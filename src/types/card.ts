import type { CardStatus } from '~/schemas/common';
import type { ISODate } from './api';
import type { ProjectDto } from './project';
import type { RunStatus } from './run';

export type CardLabel = { id: string; name: string; color: string | null };

export type ChecklistItem = { id: string; name: string; state: 'complete' | 'incomplete' };

export type Checklist = { id: string; name: string; items: ChecklistItem[] };

export type CardDto = {
  id: string;
  projectId: string;
  trelloCardId: string;
  shortLink: string;
  trelloUrl: string;
  title: string;
  description: string;
  labels: CardLabel[];
  checklists: Checklist[];
  checklistProgress: { done: number; total: number };
  status: CardStatus;
  position: number;
  /** Still in the project's source list on Trello. */
  inSourceList: boolean;
  changedOnTrello: boolean;
  removedFromTrello: boolean;
  branchName: string | null;
  hasWorktree: boolean;
  prUrl: string | null;
  /** The last Trello write-back failed (moving the card). */
  trelloError: string | null;
  /** From the last run: questions for the client (the request was unclear). */
  clientQuestions: string | null;
  /** From the last run: a plain-language update for the client. */
  clientUpdate: string | null;
  clientUpdatePostedAt: ISODate | null;
  /** Questions were asked on Trello: waiting for the client since then. */
  waitingSince: ISODate | null;
  /** The client commented while we were waiting. */
  clientRepliedAt: ISODate | null;
  /** The queued or running run, if any. `queuePosition` is 1-based among queued runs. */
  activeRun: { id: string; status: RunStatus; queuePosition: number | null } | null;
  /** The latest run (active or finished). */
  lastRun: { id: string; status: RunStatus; error: string | null } | null;
  trelloLastActivity: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
};

/** `GET /api/projects/{id}/board`: cards grouped by status, ordered by position. */
export type BoardDto = {
  project: ProjectDto;
  columns: Record<CardStatus, CardDto[]>;
};
