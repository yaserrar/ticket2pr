import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Git service against a temporary repository with a local bare "origin"
 * (spec §13): worktree + branch, changes, commit, push, reset, removal.
 */
const tmp = mkdtempSync(path.join(os.tmpdir(), 't2p-git-'));
process.env.WORKTREES_DIR = path.join(tmp, 'worktrees');

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const origin = path.join(tmp, 'origin.git');
const repo = path.join(tmp, 'repo');
const card = { trelloShortLink: 'Xk3pQ9aB', title: 'Fix the footer link', branchName: null, worktreePath: null };

type Modules = {
  repoMod: typeof import('./repo');
  worktree: typeof import('./worktree');
  changes: typeof import('./changes');
};
let m: Modules;

beforeAll(async () => {
  sh(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  sh(tmp, 'init', '-q', '-b', 'main', repo);
  sh(repo, 'config', 'user.email', 'dev@example.com');
  sh(repo, 'config', 'user.name', 'Dev');
  writeFileSync(path.join(repo, 'README.md'), '# Site\n');
  sh(repo, 'add', '.');
  sh(repo, 'commit', '-qm', 'init');
  sh(repo, 'remote', 'add', 'origin', origin);
  sh(repo, 'push', '-q', '-u', 'origin', 'main');
  m = { repoMod: await import('./repo'), worktree: await import('./worktree'), changes: await import('./changes') };
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('git integration', () => {
  let worktreePath = '';
  let branchName = '';

  it('validates the repository', async () => {
    const result = await m.repoMod.validateRepo(path.join(repo, '.'));
    expect(result.ok).toBe(true);
    expect(result.branches).toContain('main');
    expect(result.defaultBranch).toBe('main');
    expect(result.remote?.url).toBe(origin);
    expect((await m.repoMod.validateRepo(path.join(tmp, 'nope'))).ok).toBe(false);
  });

  it('creates a worktree and branch from origin/main, outside the repo', async () => {
    const logs: string[] = [];
    const wt = await m.worktree.ensureWorktree({ repoPath: repo, baseBranch: 'main', projectId: 'p1', card, log: (l) => void logs.push(l) });
    ({ worktreePath, branchName } = wt);
    expect(wt.created).toBe(true);
    expect(branchName).toBe('t2p/Xk3pQ9aB-fix-the-footer-link');
    expect(worktreePath.startsWith(process.env.WORKTREES_DIR!)).toBe(true);
    expect(sh(worktreePath, 'branch', '--show-current')).toBe(branchName);
    expect(logs.join('\n')).toMatch(/Fetching origin\/main/);
    // The main working copy is untouched.
    expect(sh(repo, 'branch', '--show-current')).toBe('main');
  });

  it('reports changes, including new files in full', async () => {
    appendFileSync(path.join(worktreePath, 'README.md'), 'More.\n');
    writeFileSync(path.join(worktreePath, 'footer.html'), '<a href="/legal/privacy">Privacy</a>\n');
    const result = await m.changes.getChanges(worktreePath, 'main');
    expect(result.stats).toEqual({ files: 2, additions: 2, deletions: 0 });
    expect(result.files.find((f) => f.path === 'footer.html')?.status).toBe('added');
    // Reading the diff leaves the index alone: the new file is still untracked.
    expect(sh(worktreePath, 'status', '--porcelain')).toContain('?? footer.html');
    const status = await m.changes.getBranchStatus(worktreePath, 'main', branchName);
    expect(status).toMatchObject({ uncommittedFiles: 2, commitsAhead: 0, remoteBranchExists: false, hasRemote: true });
  });

  it('commits and pushes, and the PR diff still shows the work', async () => {
    const sha = await m.changes.commitAll(worktreePath, 'feat(Xk3pQ9aB): Fix the footer link');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    await expect(m.changes.commitAll(worktreePath, 'again')).rejects.toThrow(/Nothing to commit/);
    await m.changes.pushBranch(worktreePath, branchName);
    expect(sh(origin, 'branch', '--list', branchName)).toContain(branchName);
    const status = await m.changes.getBranchStatus(worktreePath, 'main', branchName);
    expect(status).toMatchObject({ uncommittedFiles: 0, commitsAhead: 1, remoteBranchExists: true, unpushedCommits: 0 });
    expect((await m.changes.getChanges(worktreePath, 'main')).stats.files).toBe(2);
  });

  it('resets uncommitted changes only', async () => {
    writeFileSync(path.join(worktreePath, 'scratch.txt'), 'temp\n');
    appendFileSync(path.join(worktreePath, 'README.md'), 'Oops.\n');
    await m.changes.resetChanges(worktreePath);
    expect(existsSync(path.join(worktreePath, 'scratch.txt'))).toBe(false);
    expect((await m.changes.getBranchStatus(worktreePath, 'main', branchName)).uncommittedFiles).toBe(0);
    expect(existsSync(path.join(worktreePath, 'footer.html'))).toBe(true);
  });

  it('reuses an existing worktree, and recreates it from the branch after removal', async () => {
    const again = await m.worktree.ensureWorktree({
      repoPath: repo,
      baseBranch: 'main',
      projectId: 'p1',
      card: { ...card, branchName, worktreePath },
      log: () => undefined,
    });
    expect(again.created).toBe(false);

    await m.worktree.removeWorktree({ repoPath: repo, worktreePath, branchName, deleteBranch: false });
    expect(existsSync(worktreePath)).toBe(false);
    const recreated = await m.worktree.ensureWorktree({
      repoPath: repo,
      baseBranch: 'main',
      projectId: 'p1',
      card: { ...card, branchName, worktreePath },
      log: () => undefined,
    });
    expect(recreated.created).toBe(true);
    expect(existsSync(path.join(worktreePath, 'footer.html'))).toBe(true);
  });

  it('discards the worktree and the branch', async () => {
    await m.worktree.removeWorktree({ repoPath: repo, worktreePath, branchName, deleteBranch: true });
    expect(existsSync(worktreePath)).toBe(false);
    expect(sh(repo, 'branch', '--list', branchName)).toBe('');
  });

  it('runs the setup command and streams its output', async () => {
    const lines: string[] = [];
    await m.worktree.runSetupCommand('echo installing && echo done', repo, (l) => void lines.push(l), new AbortController().signal);
    expect(lines.join('\n')).toMatch(/installing[\s\S]*done/);
    await expect(m.worktree.runSetupCommand('exit 3', repo, () => undefined, new AbortController().signal)).rejects.toThrow(/code 3/);
  });
});
