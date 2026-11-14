import 'server-only';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { env } from '~/server/config/env';
import { gitAt, gitFail, gitTry } from './git.client';
import { branchNameFor } from './remote';

/**
 * One worktree + branch per card, outside the repository (spec §8.2), so the
 * developer's main working copy is never touched and cards can run in parallel.
 */
export function worktreesRoot() {
  return env.WORKTREES_DIR ?? path.join(os.homedir(), '.ticket2pr', 'worktrees');
}

export function worktreePathFor(projectId: string, shortLink: string) {
  return path.join(worktreesRoot(), projectId, shortLink.replace(/[^A-Za-z0-9]/g, ''));
}

/** Only ever delete folders we created. */
function insideRoot(p: string) {
  const rel = path.relative(worktreesRoot(), p);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function isWorktree(p: string | null | undefined) {
  if (!p || !(await exists(p))) return false;
  return (await gitTry(p, ['rev-parse', '--is-inside-work-tree'])) === 'true';
}

type Log = (message: string) => Promise<void> | void;

/**
 * Creates the card's worktree on first use, reuses it afterwards:
 *   git fetch origin {base}
 *   git worktree add -b {branch} {path} origin/{base}
 * Falls back to the local base branch when there is no remote or no network.
 */
export async function ensureWorktree(input: {
  repoPath: string;
  baseBranch: string;
  projectId: string;
  card: { trelloShortLink: string; title: string; branchName: string | null; worktreePath: string | null };
  log: Log;
}): Promise<{ branchName: string; worktreePath: string; created: boolean }> {
  const { repoPath, baseBranch, card, log } = input;
  const branchName = card.branchName ?? branchNameFor(card.trelloShortLink, card.title);

  if (card.worktreePath && (await isWorktree(card.worktreePath))) {
    await log(`Reusing worktree ${card.worktreePath} on ${branchName}`);
    return { branchName, worktreePath: card.worktreePath, created: false };
  }

  const worktreePath = card.worktreePath ?? worktreePathFor(input.projectId, card.trelloShortLink);
  const git = gitAt(repoPath, 5 * 60_000);

  // A leftover folder (deleted worktree, crash): clean it if it's ours.
  await git.raw(['worktree', 'prune']).catch(() => undefined);
  if (await exists(worktreePath)) {
    if (!insideRoot(worktreePath)) throw gitFail('Creating the worktree', new Error(`${worktreePath} already exists.`));
    await rm(worktreePath, { recursive: true, force: true });
  }
  await mkdir(path.dirname(worktreePath), { recursive: true });

  let startPoint = baseBranch;
  const hasOrigin = Boolean(await gitTry(repoPath, ['remote', 'get-url', 'origin']));
  if (hasOrigin) {
    await log(`Fetching origin/${baseBranch}…`);
    try {
      await git.raw(['fetch', 'origin', baseBranch]);
      startPoint = `origin/${baseBranch}`;
    } catch {
      await log(`Could not fetch origin/${baseBranch}. Using the local ${baseBranch} branch.`);
    }
  }
  if (!(await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', `${startPoint}^{commit}`]))) {
    throw gitFail('Creating the worktree', new Error(`The base branch "${baseBranch}" was not found.`));
  }

  const branchExists = Boolean(await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`]));
  // Cleaned up after being pushed: continue from the pushed branch.
  const pushedOnly =
    !branchExists && Boolean(await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branchName}`]));
  try {
    if (branchExists) {
      await log(`Checking out the existing branch ${branchName}…`);
      await git.raw(['worktree', 'add', worktreePath, branchName]);
    } else if (pushedOnly) {
      await log(`Restoring ${branchName} from origin…`);
      await git.raw(['worktree', 'add', '--track', '-b', branchName, worktreePath, `origin/${branchName}`]);
    } else {
      await log(`Creating branch ${branchName} from ${startPoint}…`);
      await git.raw(['worktree', 'add', '-b', branchName, worktreePath, startPoint]);
    }
  } catch (error) {
    throw gitFail('Creating the worktree', error);
  }
  await log(`Worktree ready at ${worktreePath}`);
  return { branchName, worktreePath, created: true };
}

/**
 * Removes the worktree and, unless asked to keep it, the branch (spec §8.6).
 * Never the repository folder itself (shared-branch projects work there).
 */
export async function removeWorktree(input: {
  repoPath: string;
  worktreePath: string | null;
  branchName: string | null;
  deleteBranch: boolean;
}) {
  const git = gitAt(input.repoPath, 60_000);
  const isRepoFolder = input.worktreePath && path.resolve(input.worktreePath) === path.resolve(input.repoPath);
  if (input.worktreePath && !isRepoFolder) {
    try {
      await git.raw(['worktree', 'remove', '--force', input.worktreePath]);
    } catch {
      if (insideRoot(input.worktreePath)) await rm(input.worktreePath, { recursive: true, force: true });
    }
    await git.raw(['worktree', 'prune']).catch(() => undefined);
  }
  if (input.deleteBranch && input.branchName) {
    await git.raw(['branch', '-D', input.branchName]).catch(() => undefined);
  }
}

/**
 * Runs the project's setup command (e.g. `npm ci`) in a fresh worktree,
 * streaming output lines to the run log. Stops on abort or after 15 minutes.
 */
export function runSetupCommand(command: string, cwd: string, log: Log, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, env: { ...process.env, CI: '1' }, signal });
    let buffer = '';
    let pending: string[] = [];
    const flush = () => {
      if (!pending.length) return;
      const text = pending.join('\n');
      pending = [];
      void log(text);
    };
    const timer = setInterval(flush, 400);
    const timeout = setTimeout(() => child.kill('SIGTERM'), 15 * 60_000);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      pending.push(...lines.filter((l) => l.trim()).map((l) => l.slice(0, 500)));
      if (pending.length > 200) pending = pending.slice(-200);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      clearInterval(timer);
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearInterval(timer);
      clearTimeout(timeout);
      if (buffer.trim()) pending.push(buffer.trim());
      flush();
      if (code === 0) resolve();
      else reject(new Error(`Setup command exited with code ${code ?? 'unknown'}`));
    });
  });
}
