import 'server-only';
import os from 'node:os';
import { stat } from 'node:fs/promises';
import type { RepoCheck, RepoValidationDto } from '~/types/git';
import { gitTry, originGithub } from './git.client';

/** `~/code/site` → `/Users/me/code/site`. Browsers can't pick folders, so this is typed (spec §8.1). */
export function expandHome(input: string) {
  const trimmed = input.trim();
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return `${os.homedir()}${trimmed.slice(1)}`;
  return trimmed;
}

async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Local branches plus `origin/*` branches (without the prefix), deduplicated. */
async function listBranches(repoPath: string) {
  const out = await gitTry(repoPath, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin']);
  const names = new Set<string>();
  for (const ref of out?.split('\n') ?? []) {
    if (ref.startsWith('refs/heads/')) names.add(ref.slice('refs/heads/'.length));
    else if (ref.startsWith('refs/remotes/origin/') && ref !== 'refs/remotes/origin/HEAD') {
      names.add(ref.slice('refs/remotes/origin/'.length));
    }
  }
  return [...names].filter((n) => !n.startsWith('t2p/')).sort((a, b) => a.localeCompare(b));
}

async function detectDefaultBranch(repoPath: string, branches: string[]) {
  const head = await gitTry(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head?.startsWith('origin/') && branches.includes(head.slice(7))) return head.slice(7);
  for (const name of ['main', 'master', 'develop']) if (branches.includes(name)) return name;
  const current = await gitTry(repoPath, ['branch', '--show-current']);
  return current && branches.includes(current) ? current : (branches[0] ?? null);
}

/**
 * Checks a repository path (spec §8.1): the folder exists, is a git
 * repository, has branches, and (not blocking) an `origin` remote on GitHub.
 */
export async function validateRepo(input: string): Promise<RepoValidationDto> {
  const checks: RepoCheck[] = [];
  const fail = (label: string, detail: string): RepoValidationDto => ({
    ok: false,
    repoPath: null,
    branches: [],
    defaultBranch: null,
    currentBranch: null,
    remote: null,
    checks: [...checks, { label, ok: false, detail, blocking: true }],
  });

  const path = expandHome(input);
  if (!path.startsWith('/')) return fail('Absolute path', 'Use the full path, for example /Users/you/code/site or ~/code/site.');
  if (!(await isDirectory(path))) return fail('Folder exists', `No folder at ${path}.`);
  checks.push({ label: 'Folder exists', ok: true, detail: null, blocking: true });

  const top = await gitTry(path, ['rev-parse', '--show-toplevel']);
  if (!top) return fail('Git repository', 'This folder is not inside a git repository.');
  checks.push({ label: 'Git repository', ok: true, detail: top === path ? null : `Using the repository root ${top}`, blocking: true });

  const branches = await listBranches(top);
  if (!branches.length) return fail('Branches', 'The repository has no branches yet. Make a first commit.');
  const defaultBranch = await detectDefaultBranch(top, branches);
  const currentBranch = (await gitTry(top, ['branch', '--show-current'])) || null;

  const { url: remoteUrl, github } = await originGithub(top);
  checks.push(
    remoteUrl
      ? { label: 'origin remote', ok: true, detail: remoteUrl, blocking: false }
      : { label: 'origin remote', ok: false, detail: 'No origin remote: you can work and commit, but not push.', blocking: false },
  );
  if (remoteUrl) {
    checks.push(
      github
        ? { label: 'GitHub repository', ok: true, detail: `${github.owner}/${github.repo}`, blocking: false }
        : { label: 'GitHub repository', ok: false, detail: 'Not a github.com remote: pull requests open by hand.', blocking: false },
    );
  }

  return {
    ok: true,
    repoPath: top,
    branches,
    defaultBranch,
    currentBranch,
    remote: remoteUrl ? { url: remoteUrl, github } : null,
    checks,
  };
}
