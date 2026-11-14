import 'server-only';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { HttpError } from '~/server/http/errors';
import { gitAt, gitErrorText, gitTry } from './git.client';
import { isWorktree, worktreesRoot } from './worktree';

/**
 * SHARED_BRANCH work mode: every card of the project works on one branch, one
 * card at a time, either in the developer's repository folder itself or in a
 * single worktree kept for the project.
 *
 * Nothing here ever switches the branch of the developer's folder or rewrites
 * history: it refuses with an explanation instead.
 */
export type SharedProject = {
  id: string;
  repoPath: string;
  baseBranch: string;
  sharedBranch: string | null;
  sharedInRepo: boolean;
};

type Log = (message: string) => Promise<void> | void;

export const sharedBranchOf = (project: { sharedBranch: string | null; baseBranch: string }) =>
  project.sharedBranch || project.baseBranch;

export function sharedWorktreePath(projectId: string, branch: string) {
  return path.join(worktreesRoot(), projectId, `_shared-${branch.replace(/[^A-Za-z0-9._-]/g, '-')}`);
}

const conflict = (message: string) => new HttpError(409, message, 'GIT_ERROR');

const refExists = async (dir: string, ref: string) => Boolean(await gitTry(dir, ['rev-parse', '--verify', '--quiet', ref]));

export async function uncommittedCount(dir: string) {
  const porcelain = (await gitTry(dir, ['status', '--porcelain'])) ?? '';
  return porcelain.split('\n').filter(Boolean).length;
}

const hasOrigin = async (dir: string) => Boolean(await gitTry(dir, ['remote', 'get-url', 'origin']));

/** `git fetch origin {branch}`; returns the error text instead of throwing (offline is not fatal). */
export async function fetchBranch(dir: string, branch: string, timeoutMs = 60_000): Promise<string | null> {
  if (!(await hasOrigin(dir))) return null;
  try {
    await gitAt(dir, timeoutMs).raw(['fetch', '--quiet', 'origin', branch]);
    return null;
  } catch (error) {
    return gitErrorText(error);
  }
}

const FETCH_TTL_MS = 60_000;
const g = globalThis as unknown as { t2pFetchedAt?: Map<string, number> };
const fetchedAt = (g.t2pFetchedAt ??= new Map());

/**
 * Fetches a branch at most once a minute per repository (worktrees share the
 * repository's refs, so one fetch serves every card). Used by status reads.
 */
export async function fetchBranchThrottled(repoPath: string, branch: string, { force = false } = {}) {
  const key = `${repoPath}\0${branch}`;
  if (!force && Date.now() - (fetchedAt.get(key) ?? 0) < FETCH_TTL_MS) return null;
  const error = await fetchBranch(repoPath, branch, 20_000);
  if (!error) fetchedAt.set(key, Date.now());
  return error;
}

/**
 * Does this card work on the project's shared branch? Yes once its start
 * commit is recorded; before that, when the project is in shared mode and the
 * card isn't on a card branch of its own.
 */
export function isSharedCard(
  card: { startSha: string | null; branchName: string | null },
  project: { workMode: string; sharedBranch: string | null; baseBranch: string },
) {
  if (card.startSha) return true;
  return project.workMode === 'SHARED_BRANCH' && (!card.branchName || card.branchName === sharedBranchOf(project));
}

/** Fast-forwards the checked-out branch to `origin/{branch}`. Never merges or rebases. */
export async function fastForward(dir: string, branch: string) {
  if (!(await refExists(dir, `refs/remotes/origin/${branch}`))) return { pulled: 0 };
  const behind = Number((await gitTry(dir, ['rev-list', '--count', `HEAD..origin/${branch}`])) ?? 0);
  if (!behind) return { pulled: 0 };
  try {
    await gitAt(dir, 60_000).raw(['merge', '--ff-only', '--quiet', `origin/${branch}`]);
  } catch (error) {
    const text = gitErrorText(error);
    if (/would be overwritten/i.test(text)) {
      throw conflict(`You have uncommitted changes in files the pull would update. Commit or stash them, then pull.\n${text}`);
    }
    if (/not possible to fast-forward|diverg/i.test(text)) {
      throw conflict(
        `${branch} and origin/${branch} have diverged (both have commits the other doesn't). ` +
          'Pull or rebase it yourself in a terminal, then try again.',
      );
    }
    throw conflict(`Pulling origin/${branch} failed.\n${text}`);
  }
  if (Number((await gitTry(dir, ['rev-list', '--count', `HEAD..origin/${branch}`])) ?? 1) > 0) {
    throw conflict(`Pulling origin/${branch} did not complete. Pull it yourself in a terminal to see why.`);
  }
  return { pulled: behind };
}

/** The folder cards of this project work in, created on first use in separate-folder mode. */
async function sharedFolder(project: SharedProject, log: Log): Promise<string> {
  const branch = sharedBranchOf(project);

  if (project.sharedInRepo) {
    const current = await gitTry(project.repoPath, ['branch', '--show-current']);
    if (current !== branch) {
      throw conflict(
        `Your repository folder is on ${current ? `“${current}”` : 'a detached HEAD'}, but this project works on “${branch}”. ` +
          `Run \`git switch ${branch}\` in ${project.repoPath}, or change the branch in Project settings. Ticket2PR never switches it for you.`,
      );
    }
    return project.repoPath;
  }

  const folder = sharedWorktreePath(project.id, branch);
  if (await isWorktree(folder)) return folder;

  const git = gitAt(project.repoPath, 5 * 60_000);
  await git.raw(['worktree', 'prune']).catch(() => undefined);
  await mkdir(path.dirname(folder), { recursive: true });
  const local = await refExists(project.repoPath, `refs/heads/${branch}`);
  if (!local) await fetchBranch(project.repoPath, branch);
  try {
    if (local) {
      await git.raw(['worktree', 'add', folder, branch]);
    } else if (await refExists(project.repoPath, `refs/remotes/origin/${branch}`)) {
      await git.raw(['worktree', 'add', '--track', '-b', branch, folder, `origin/${branch}`]);
    } else {
      throw new Error(`The branch “${branch}” doesn't exist locally or on origin.`);
    }
  } catch (error) {
    const text = gitErrorText(error);
    if (/already (checked out|used by worktree)/i.test(text)) {
      throw conflict(
        `“${branch}” is checked out in another folder (probably your repository folder), and git allows a branch in one folder at a time. ` +
          'Turn on “Work directly in my repository folder” in Project settings, or switch that folder to another branch.',
      );
    }
    throw conflict(`Preparing the folder for “${branch}” failed.\n${text}`);
  }
  await log(`Created a folder for ${branch} at ${folder}`);
  return folder;
}

/**
 * Before a shared-branch run. On the card's first run the folder must be
 * clean (so the card's diff is only its own work), the branch is
 * fast-forwarded from origin, and HEAD is recorded as the card's start.
 * Retries and follow-ups keep working on what is there.
 */
export async function prepareSharedCheckout(input: {
  project: SharedProject;
  card: { startSha: string | null };
  log: Log;
}): Promise<{ folder: string; branchName: string; startSha: string; created: boolean }> {
  const { project, card, log } = input;
  const branch = sharedBranchOf(project);
  const existed = project.sharedInRepo || (await isWorktree(sharedWorktreePath(project.id, branch)));
  const folder = await sharedFolder(project, log);

  if (card.startSha) {
    await log(`Continuing on ${branch} in ${folder}`);
    return { folder, branchName: branch, startSha: card.startSha, created: false };
  }

  const dirty = await uncommittedCount(folder);
  if (dirty) {
    throw conflict(
      `${folder} has ${dirty} uncommitted file${dirty === 1 ? '' : 's'}. Commit or stash ${dirty === 1 ? 'it' : 'them'} first, ` +
        'so this card’s changes are only its own.',
    );
  }

  await log(`Pulling the latest ${branch}…`);
  const fetchError = await fetchBranch(folder, branch);
  if (fetchError) await log(`Could not fetch origin/${branch}, working on the local branch.\n${fetchError}`);
  else {
    const { pulled } = await fastForward(folder, branch);
    await log(pulled ? `Pulled ${pulled} new commit${pulled === 1 ? '' : 's'} from origin/${branch}` : `${branch} is up to date`);
  }

  const startSha = (await gitTry(folder, ['rev-parse', 'HEAD'])) ?? '';
  if (!startSha) throw conflict(`Could not read the current commit of ${branch}.`);
  await log(`Working on ${branch} in ${folder}, from ${startSha.slice(0, 7)}`);
  return { folder, branchName: branch, startSha, created: !existed };
}

/**
 * Ahead/behind of a folder's branch vs origin (the board's repo chip).
 * `fetch`: "auto" fetches at most once a minute, "now" always, "no" never.
 */
export async function folderStatus(dir: string, { fetch = 'auto' }: { fetch?: 'auto' | 'now' | 'no' } = {}) {
  const branch = (await gitTry(dir, ['branch', '--show-current'])) || null;
  const uncommittedFiles = await uncommittedCount(dir);
  let fetchError: string | null = null;
  if (branch && fetch !== 'no') fetchError = await fetchBranchThrottled(dir, branch, { force: fetch === 'now' });
  const hasUpstream = Boolean(branch && (await refExists(dir, `refs/remotes/origin/${branch}`)));
  let ahead = 0;
  let behind = 0;
  if (branch && hasUpstream) {
    const counts = (await gitTry(dir, ['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`])) ?? '0\t0';
    const [a, b] = counts.split(/\s+/).map(Number);
    ahead = a || 0;
    behind = b || 0;
  }
  return { branch, uncommittedFiles, ahead, behind, hasUpstream, fetchError };
}

/**
 * Brings `origin/{base}` into a card branch (branch-per-card "Update from
 * main"). Needs a clean worktree. On conflicts the merge is aborted, so the
 * branch is exactly as before, and the conflicting files are listed.
 */
export async function mergeBaseInto(worktreePath: string, baseBranch: string) {
  const dirty = await uncommittedCount(worktreePath);
  if (dirty) throw conflict('Commit or reset the changes first: updating needs a clean worktree.');
  const fetchError = await fetchBranch(worktreePath, baseBranch);
  if (fetchError) throw conflict(`Could not fetch origin/${baseBranch}.\n${fetchError}`);
  const baseRef = (await refExists(worktreePath, `refs/remotes/origin/${baseBranch}`)) ? `origin/${baseBranch}` : baseBranch;
  const behind = Number((await gitTry(worktreePath, ['rev-list', '--count', `HEAD..${baseRef}`])) ?? 0);
  if (!behind) return { merged: 0, baseRef };

  // A conflicting merge can exit without stderr (simple-git then doesn't throw): check the result too.
  let failure: unknown = null;
  await gitAt(worktreePath, 2 * 60_000)
    .raw(['merge', '--no-edit', baseRef])
    .catch((error: unknown) => (failure = error));
  const files = (await gitTry(worktreePath, ['diff', '--name-only', '--diff-filter=U'])) ?? '';
  const merging = Boolean(await gitTry(worktreePath, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']));
  if (failure || files || merging) {
    if (merging) await gitAt(worktreePath).raw(['merge', '--abort']).catch(() => undefined);
    if (files) {
      const list = files.split('\n').filter(Boolean);
      throw conflict(
        `${baseRef} changes the same lines as this card in ${list.length} file${list.length === 1 ? '' : 's'}: ${list.slice(0, 6).join(', ')}` +
          `${list.length > 6 ? '…' : ''}. Nothing was changed. To resolve it, run \`git merge ${baseRef}\` in ${worktreePath} and fix the conflicts.`,
      );
    }
    throw conflict(`Updating from ${baseRef} failed. Nothing was changed.\n${gitErrorText(failure ?? 'The merge did not complete.')}`);
  }
  return { merged: behind, baseRef };
}
