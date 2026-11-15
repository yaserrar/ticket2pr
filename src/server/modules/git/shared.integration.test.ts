import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Shared-branch work mode, the repository Pull, "Update from main" and the
 * repo-folder guard, against temporary repositories with a local bare origin
 * and a teammate clone that pushes to it.
 */
const tmp = mkdtempSync(path.join(os.tmpdir(), 't2p-shared-'));
process.env.WORKTREES_DIR = path.join(tmp, 'worktrees');

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const origin = path.join(tmp, 'origin.git');
const repo = path.join(tmp, 'repo');
const mate = path.join(tmp, 'teammate');

function identity(dir: string) {
  sh(dir, 'config', 'user.email', 'dev@example.com');
  sh(dir, 'config', 'user.name', 'Dev');
}

/** The teammate commits a file on a branch and pushes it. */
function teammatePush(branch: string, file: string, content: string) {
  sh(mate, 'fetch', '-q', 'origin');
  sh(mate, 'checkout', '-q', '-B', branch, `origin/${branch}`);
  writeFileSync(path.join(mate, file), content);
  sh(mate, 'add', '.');
  sh(mate, 'commit', '-qm', `teammate: ${file}`);
  sh(mate, 'push', '-q', 'origin', branch);
}

type Modules = {
  shared: typeof import('./shared-checkout');
  changes: typeof import('./changes');
  worktree: typeof import('./worktree');
};
let m: Modules;

const project = (over: Partial<import('./shared-checkout').SharedProject> = {}) => ({
  id: 'p1',
  repoPath: repo,
  baseBranch: 'main',
  sharedBranch: null,
  sharedInRepo: true,
  ...over,
});

beforeAll(async () => {
  sh(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  sh(tmp, 'init', '-q', '-b', 'main', repo);
  identity(repo);
  writeFileSync(path.join(repo, 'README.md'), '# Site\n');
  writeFileSync(path.join(repo, 'footer.html'), '<footer>Made with care</footer>\n');
  sh(repo, 'add', '.');
  sh(repo, 'commit', '-qm', 'init');
  sh(repo, 'remote', 'add', 'origin', origin);
  sh(repo, 'push', '-q', '-u', 'origin', 'main');
  sh(repo, 'push', '-q', 'origin', 'main:dev');
  sh(tmp, 'clone', '-q', origin, mate);
  identity(mate);
  m = { shared: await import('./shared-checkout'), changes: await import('./changes'), worktree: await import('./worktree') };
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('shared branch, in the repository folder', () => {
  let startSha = '';

  it('shows how far behind origin the folder is', async () => {
    teammatePush('main', 'about.html', '<h1>About</h1>\n');
    const status = await m.shared.folderStatus(repo);
    expect(status).toMatchObject({ branch: 'main', behind: 1, ahead: 0, hasUpstream: true, uncommittedFiles: 0, fetchError: null });
  });

  it('refuses to start a card on a dirty folder', async () => {
    appendFileSync(path.join(repo, 'README.md'), 'my own edit\n');
    await expect(m.shared.prepareSharedCheckout({ project: project(), card: { startSha: null }, log: () => undefined })).rejects.toThrow(
      /1 uncommitted file/,
    );
    sh(repo, 'checkout', '--', 'README.md');
  });

  it('pulls first, then records where the card started', async () => {
    const logs: string[] = [];
    const out = await m.shared.prepareSharedCheckout({ project: project(), card: { startSha: null }, log: (l) => void logs.push(l) });
    expect(out.folder).toBe(repo);
    expect(out.branchName).toBe('main');
    expect(existsSync(path.join(repo, 'about.html'))).toBe(true);
    expect(logs.join('\n')).toMatch(/Pulled 1 new commit/);
    expect(out.startSha).toBe(sh(repo, 'rev-parse', 'HEAD'));
    startSha = out.startSha;
  });

  it('shows only this card’s changes, and keeps going on retries even with edits', async () => {
    writeFileSync(path.join(repo, 'footer.html'), '<footer>Made with care · by Bistro</footer>\n');
    const changes = await m.changes.getChanges(repo, 'main', startSha);
    expect(changes.files.map((f) => f.path)).toEqual(['footer.html']);
    expect(changes.baseRef).toMatch(/where this card started/);
    const again = await m.shared.prepareSharedCheckout({ project: project(), card: { startSha }, log: () => undefined });
    expect(again.startSha).toBe(startSha);
  });

  it('counts the card’s commits and pushes the shared branch', async () => {
    await m.changes.commitAll(repo, 'feat(Z2yj86KN): footer credit');
    const status = await m.changes.getBranchStatus(repo, 'main', 'main', startSha);
    expect(status).toMatchObject({ uncommittedFiles: 0, commitsAhead: 1, behindBase: 0, remoteBranchExists: true, unpushedCommits: 1 });
    await m.changes.pushBranch(repo, 'main');
    expect(sh(origin, 'log', '-1', '--format=%s', 'main')).toBe('feat(Z2yj86KN): footer credit');
  });

  it('never switches the folder’s branch', async () => {
    await expect(
      m.shared.prepareSharedCheckout({ project: project({ sharedBranch: 'dev' }), card: { startSha: null }, log: () => undefined }),
    ).rejects.toThrow(/git switch dev[\s\S]*never switches/);
    expect(sh(repo, 'branch', '--show-current')).toBe('main');
  });

  it('refuses a pull that cannot fast-forward', async () => {
    teammatePush('main', 'menu.html', '<h1>Menu</h1>\n');
    writeFileSync(path.join(repo, 'local.txt'), 'local\n');
    sh(repo, 'add', '.');
    sh(repo, 'commit', '-qm', 'local commit');
    await m.shared.fetchBranch(repo, 'main');
    await expect(m.shared.fastForward(repo, 'main')).rejects.toThrow(/have diverged/);
    sh(repo, 'reset', '-q', '--hard', 'origin/main');
  });

  it('never removes the repository folder', async () => {
    await m.worktree.removeWorktree({ repoPath: repo, worktreePath: repo, branchName: 'main', deleteBranch: false });
    expect(existsSync(path.join(repo, 'README.md'))).toBe(true);
  });
});

describe('isSharedCard', () => {
  const shared = { workMode: 'SHARED_BRANCH', sharedBranch: 'dev', baseBranch: 'main' };
  it('follows the start commit first, then the project mode and branch', () => {
    expect(m.shared.isSharedCard({ startSha: 'abc', branchName: 'dev' }, { ...shared, workMode: 'BRANCH_PER_CARD' })).toBe(true);
    expect(m.shared.isSharedCard({ startSha: null, branchName: null }, shared)).toBe(true);
    expect(m.shared.isSharedCard({ startSha: null, branchName: 'dev' }, shared)).toBe(true);
    expect(m.shared.isSharedCard({ startSha: null, branchName: 't2p/Ab12-old-card' }, shared)).toBe(false);
    expect(m.shared.isSharedCard({ startSha: null, branchName: null }, { ...shared, workMode: 'BRANCH_PER_CARD' })).toBe(false);
  });
});

describe('shared branch, in a separate folder', () => {
  it('creates one folder for the branch, tracking origin', async () => {
    const out = await m.shared.prepareSharedCheckout({
      project: project({ sharedBranch: 'dev', sharedInRepo: false }),
      card: { startSha: null },
      log: () => undefined,
    });
    expect(out.folder).toBe(m.shared.sharedWorktreePath('p1', 'dev'));
    expect(out.created).toBe(true);
    expect(sh(out.folder, 'branch', '--show-current')).toBe('dev');
    expect(sh(repo, 'branch', '--show-current')).toBe('main');
    const reused = await m.shared.prepareSharedCheckout({
      project: project({ sharedBranch: 'dev', sharedInRepo: false }),
      card: { startSha: null },
      log: () => undefined,
    });
    expect(reused.created).toBe(false);
  });

  it('explains when the branch is already checked out in the repository folder', async () => {
    await expect(
      m.shared.prepareSharedCheckout({ project: project({ id: 'p2', sharedInRepo: false }), card: { startSha: null }, log: () => undefined }),
    ).rejects.toThrow(/one folder at a time/);
  });
});

describe('branch per card: update from main', () => {
  const card = { trelloShortLink: 'Ab12Cd34', title: 'Contact page', branchName: null, worktreePath: null };

  it('merges a newer main, and aborts cleanly on conflicts', async () => {
    const wt = await m.worktree.ensureWorktree({ repoPath: repo, baseBranch: 'main', projectId: 'p3', card, log: () => undefined });
    writeFileSync(path.join(wt.worktreePath, 'footer.html'), '<footer>Card version</footer>\n');
    await m.changes.commitAll(wt.worktreePath, 'card change');

    teammatePush('main', 'news.html', '<h1>News</h1>\n');
    await m.shared.fetchBranch(wt.worktreePath, 'main');
    expect((await m.changes.getBranchStatus(wt.worktreePath, 'main', wt.branchName)).behindBase).toBe(1);
    expect(await m.shared.mergeBaseInto(wt.worktreePath, 'main')).toMatchObject({ merged: 1 });
    expect(existsSync(path.join(wt.worktreePath, 'news.html'))).toBe(true);

    teammatePush('main', 'footer.html', '<footer>Teammate version</footer>\n');
    const head = sh(wt.worktreePath, 'rev-parse', 'HEAD');
    await expect(m.shared.mergeBaseInto(wt.worktreePath, 'main')).rejects.toThrow(/same lines as this card in 1 file: footer.html/);
    expect(sh(wt.worktreePath, 'rev-parse', 'HEAD')).toBe(head);
    expect(sh(wt.worktreePath, 'status', '--porcelain')).toBe('');
  });
});
