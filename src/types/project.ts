import type { ISODate } from './api';

export type ProjectDto = {
  id: string;
  name: string;
  trelloBoardId: string;
  trelloBoardName: string;
  trelloBoardUrl: string | null;
  trelloSourceListId: string;
  trelloSourceListName: string;
  repoPath: string | null;
  baseBranch: string;
  setupCommand: string | null;
  extraInstructions: string | null;
  workMode: 'BRANCH_PER_CARD' | 'SHARED_BRANCH';
  /** SHARED_BRANCH: the branch every card works on. */
  sharedBranch: string | null;
  sharedInRepo: boolean;
  /** Write-back: the Trello list for each status (null = don't move). */
  trelloInProgressListId: string | null;
  trelloReviewListId: string | null;
  trelloDoneListId: string | null;
  trelloNeedsInfoListId: string | null;
  /** Claude sorts new cards into in scope / out of scope of the maintenance agreement. */
  scopeCheck: boolean;
  /** null: the default rules (DEFAULT_SCOPE_RULES). */
  scopeRules: string | null;
  trelloOutOfScopeListId: string | null;
  lastSyncedAt: ISODate | null;
  /** Error of the latest sync, when it failed. */
  lastSyncError: string | null;
  cardCount: number;
  createdAt: ISODate;
  updatedAt: ISODate;
};

/** `POST /api/projects/{id}/sync`. */
export type SyncResultDto = {
  added: number;
  updated: number;
  removed: number;
  lastSyncedAt: ISODate;
};
