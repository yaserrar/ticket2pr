/** `POST /api/projects/validate-repo` (spec §8.1). */
export type RepoCheck = { label: string; ok: boolean; detail: string | null; blocking: boolean };

export type RepoValidationDto = {
  ok: boolean;
  /** Top-level folder of the repository (what gets stored). */
  repoPath: string | null;
  branches: string[];
  defaultBranch: string | null;
  /** The branch checked out in the repository folder right now. */
  currentBranch: string | null;
  remote: { url: string; github: { owner: string; repo: string } | null } | null;
  checks: RepoCheck[];
};

export type DiffLine = {
  type: 'add' | 'del' | 'ctx' | 'note';
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

export type DiffHunk = { header: string; lines: DiffLine[] };

export type DiffFile = {
  path: string;
  oldPath: string | null;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  binary: boolean;
  /** Lines beyond the viewer's limit were dropped. */
  truncated: boolean;
  hunks: DiffHunk[];
};

/** `GET /api/cards/{id}/changes`: everything the branch changes compared with the base (spec §8.3). */
export type ChangesDto = {
  files: DiffFile[];
  stats: { files: number; additions: number; deletions: number };
  baseRef: string;
};

/** `GET /api/projects/{id}/repo`: the developer's own repository folder vs GitHub. */
export type RepoStatusDto = {
  repoPath: string;
  branch: string | null;
  uncommittedFiles: number;
  /** Commits on origin not pulled yet. */
  behind: number;
  /** Local commits not pushed yet. */
  ahead: number;
  hasUpstream: boolean;
  /** Fetching from origin failed (offline, auth): behind/ahead are from the last fetch. */
  fetchError: string | null;
};

/** `GET /api/cards/{id}/git`: what the Git tab needs. */
export type GitStatusDto = {
  workMode: 'BRANCH_PER_CARD' | 'SHARED_BRANCH';
  /** SHARED_BRANCH: the card works in the repository folder itself. */
  inRepoFolder: boolean;
  branchName: string;
  worktreePath: string;
  baseBranch: string;
  /** Files changed and not committed yet. */
  uncommittedFiles: number;
  /** Commits made for this card (on the card branch, or since the card started on a shared branch). */
  commitsAhead: number;
  /** BRANCH_PER_CARD: commits on origin/{base} the card branch doesn't have yet. */
  behindBase: number;
  remoteBranchExists: boolean;
  /** Commits not pushed yet (all of them when the branch was never pushed). */
  unpushedCommits: number;
  hasRemote: boolean;
  github: { owner: string; repo: string } | null;
  /** True when a GitHub token is saved: PRs open through the API. */
  githubTokenSet: boolean;
  prUrl: string | null;
  suggestedCommitMessage: string;
  suggestedPr: { title: string; body: string };
  /** SHARED_BRANCH on a branch other than the base: compare link for a "release" pull request. */
  releaseCompareUrl: string | null;
};
