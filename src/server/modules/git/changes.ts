import 'server-only';
import type { ChangesDto } from '~/types/git';
import { gitAt, gitFail, gitTry } from './git.client';
import { parseUnifiedDiff } from './diff-parse';

/** `origin/{base}` when it exists, else the local base branch. */
export async function baseRefFor(worktreePath: string, baseBranch: string) {
  const remote = await gitTry(worktreePath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseBranch}`]);
  return remote ? `origin/${baseBranch}` : baseBranch;
}

async function mergeBase(worktreePath: string, baseRef: string) {
  return (await gitTry(worktreePath, ['merge-base', 'HEAD', baseRef])) ?? 'HEAD';
}

const MAX_PATCH_BYTES = 4 * 1024 * 1024;

/**
 * Everything the branch changes compared with the base, committed or not
 * (spec §8.3): what the pull request will contain. New files show in full:
 * they are marked "intent to add" for the diff, then unmarked again.
 * On a shared branch, `since` is the commit the card started from.
 */
export async function getChanges(worktreePath: string, baseBranch: string, since?: string | null): Promise<ChangesDto> {
  const git = gitAt(worktreePath);
  const baseRef = since ? `${since.slice(0, 7)}, where this card started` : await baseRefFor(worktreePath, baseBranch);
  const untracked = ((await gitTry(worktreePath, ['ls-files', '--others', '--exclude-standard', '-z'])) ?? '').split('\0').filter(Boolean);
  try {
    if (untracked.length) await git.raw(['add', '--intent-to-add', '--', ...untracked]);
    const base = since ?? (await mergeBase(worktreePath, baseRef));
    let patch: string;
    try {
      patch = await git.raw(['diff', '--no-color', '--find-renames', base]);
    } finally {
      // Leave the index as it was: new files stay untracked in the developer's `git status`.
      for (let i = 0; i < untracked.length; i += 200) {
        await git.raw(['reset', '--quiet', '--', ...untracked.slice(i, i + 200)]).catch(() => undefined);
      }
    }
    if (patch.length > MAX_PATCH_BYTES) patch = patch.slice(0, MAX_PATCH_BYTES);
    const files = parseUnifiedDiff(patch);
    return {
      files,
      stats: {
        files: files.length,
        additions: files.reduce((n, f) => n + f.additions, 0),
        deletions: files.reduce((n, f) => n + f.deletions, 0),
      },
      baseRef,
    };
  } catch (error) {
    throw gitFail('Reading the changes', error);
  }
}

/**
 * Branch-per-card: commits vs the merge base with the base branch, and how far
 * the base has moved on. Shared branch (`since`): commits since the card started.
 */
export async function getBranchStatus(worktreePath: string, baseBranch: string, branchName: string, since?: string | null) {
  const baseRef = await baseRefFor(worktreePath, baseBranch);
  const base = since ?? (await mergeBase(worktreePath, baseRef));
  const porcelain = (await gitTry(worktreePath, ['status', '--porcelain'])) ?? '';
  const uncommittedFiles = porcelain ? porcelain.split('\n').filter(Boolean).length : 0;
  const commitsAhead = Number((await gitTry(worktreePath, ['rev-list', '--count', `${base}..HEAD`])) ?? 0);
  const behindBase = since ? 0 : Number((await gitTry(worktreePath, ['rev-list', '--count', `HEAD..${baseRef}`])) ?? 0);
  const remoteRef = `refs/remotes/origin/${branchName}`;
  const remoteBranchExists = Boolean(await gitTry(worktreePath, ['rev-parse', '--verify', '--quiet', remoteRef]));
  const unpushedCommits = remoteBranchExists
    ? Number((await gitTry(worktreePath, ['rev-list', '--count', `origin/${branchName}..HEAD`])) ?? 0)
    : commitsAhead;
  const hasRemote = Boolean(await gitTry(worktreePath, ['remote', 'get-url', 'origin']));
  return { uncommittedFiles, commitsAhead, behindBase, remoteBranchExists, unpushedCommits, hasRemote };
}

/** Throws away uncommitted changes (spec §7.5 "Reset changes first"). */
export async function resetChanges(worktreePath: string) {
  const git = gitAt(worktreePath);
  try {
    await git.raw(['reset', '--quiet']);
    await git.raw(['checkout', '--', '.']);
    await git.raw(['clean', '-fd']);
  } catch (error) {
    throw gitFail('Resetting the changes', error);
  }
}

export async function commitAll(worktreePath: string, message: string) {
  const git = gitAt(worktreePath);
  try {
    await git.raw(['add', '--all']);
    const staged = await gitTry(worktreePath, ['diff', '--cached', '--name-only']);
    if (!staged) throw new Error('Nothing to commit: the working tree is clean.');
    await git.raw(['commit', '--quiet', '-m', message]);
    return (await git.raw(['rev-parse', 'HEAD'])).trim();
  } catch (error) {
    throw gitFail('Commit', error);
  }
}

/** `git push -u origin {branch}` with the developer's own credentials. */
export async function pushBranch(worktreePath: string, branchName: string) {
  try {
    await gitAt(worktreePath, 3 * 60_000).raw(['push', '--porcelain', '-u', 'origin', `${branchName}:${branchName}`]);
  } catch (error) {
    throw gitFail('Push', error);
  }
}
