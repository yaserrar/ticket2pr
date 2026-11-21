import type {
  ClientCommentInput,
  CommitInput,
  CreateRunInput,
  MoveCardInput,
  OpenPrInput,
  OutOfScopeInput,
  PushInput,
  RetakeScreenshotsInput,
  ScopeCheckInput,
} from '~/schemas/card';
import type { TrelloUpdatesDto } from '~/types/client-loop';
import type { CardDto } from '~/types/card';
import type { ChangesDto, GitStatusDto } from '~/types/git';
import type { RunDto } from '~/types/run';
import type { RunChecksDto } from '~/types/checks';
import { api } from './client';

export const cardsApi = {
  get: (cardId: string) => api.get<CardDto>(`/cards/${cardId}`),
  move: (cardId: string, body: MoveCardInput) => api.patch<CardDto>(`/cards/${cardId}/move`, body),
  runs: (cardId: string) => api.get<RunDto[]>(`/cards/${cardId}/runs`),
  createRun: (cardId: string, body: CreateRunInput) => api.post<CardDto>(`/cards/${cardId}/runs`, body),
  checks: (cardId: string) => api.get<RunChecksDto[]>(`/cards/${cardId}/checks`),
  runChecks: (cardId: string) => api.post<CardDto>(`/cards/${cardId}/checks`),
  discard: (cardId: string) => api.post<CardDto>(`/cards/${cardId}/discard`),
  changes: (cardId: string) => api.get<ChangesDto>(`/cards/${cardId}/changes`),
  reset: (cardId: string) => api.post<{ ok: true }>(`/cards/${cardId}/reset`),
  git: (cardId: string) => api.get<GitStatusDto>(`/cards/${cardId}/git`),
  commit: (cardId: string, body: CommitInput) => api.post<{ sha: string }>(`/cards/${cardId}/commit`, body),
  /** `done`: a shared-branch card moved to Done after the push. */
  push: (cardId: string, body: PushInput) => api.post<{ ok: true; branchName: string; done: boolean }>(`/cards/${cardId}/push`, body),
  updateBase: (cardId: string) => api.post<{ merged: number; baseRef: string }>(`/cards/${cardId}/update-base`),
  cleanup: (cardId: string) =>
    api.post<{ removedWorktree: boolean; deletedBranch: boolean; keptBranchReason: string | null }>(`/cards/${cardId}/cleanup`),
  trelloUpdates: (cardId: string) => api.get<TrelloUpdatesDto>(`/cards/${cardId}/trello-updates`),
  dismissTrelloUpdates: (cardId: string) => api.post<CardDto>(`/cards/${cardId}/trello-updates/dismiss`),
  clientComment: (cardId: string, body: ClientCommentInput) => api.post<CardDto>(`/cards/${cardId}/client-comment`, body),
  checkScope: (cardId: string, body: ScopeCheckInput) => api.post<CardDto>(`/cards/${cardId}/scope`, body),
  outOfScope: (cardId: string, body: OutOfScopeInput) => api.post<CardDto>(`/cards/${cardId}/out-of-scope`, body),
  retakeScreenshots: (cardId: string, body: RetakeScreenshotsInput) => api.post<CardDto>(`/cards/${cardId}/screenshots`, body),
  openPr: (cardId: string, body: OpenPrInput) =>
    api.post<{ prUrl: string | null; compareUrl: string | null }>(`/cards/${cardId}/pr`, body),
};
