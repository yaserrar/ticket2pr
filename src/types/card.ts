import type { CardStatus } from '~/schemas/common';
import type { ScopeKind, ScopeSize, ScopeStatus } from '~/lib/scope';
import type { RiskArea, RiskLevel } from '~/lib/risk';
import type { ISODate } from './api';
import type { ProjectDto } from './project';
import type { RunKind, RunStatus } from './run';
import type { CardChecksDto } from './checks';
import type { UsageTotals } from '~/lib/usage';

export type CardLabel = { id: string; name: string; color: string | null };

export type ChecklistItem = { id: string; name: string; state: 'complete' | 'incomplete' };

export type Checklist = { id: string; name: string; items: ChecklistItem[] };

/** Is the card covered by the maintenance agreement? (Claude's verdict, the developer decides.) */
export type CardScopeDto = {
  /** null: not checked yet. */
  status: ScopeStatus | null;
  kind: ScopeKind | null;
  size: ScopeSize | null;
  /** For the developer and the project manager. */
  reason: string | null;
  /** Claude's draft note for the client (out of scope or unsure). */
  clientNote: string | null;
  error: string | null;
  checkedAt: ISODate | null;
  /** The card changed on Trello since the verdict. */
  stale: boolean;
  /** Started anyway, or the client agreed to the new work. */
  approved: boolean;
  /** Dragged to In progress before the check finished: starts if in scope. */
  startWhenInScope: boolean;
  notePostedAt: ISODate | null;
};

/** How carefully the changes must be reviewed (from the diff). */
export type CardRiskDto = {
  level: RiskLevel;
  areas: RiskArea[];
  stats: { files: number; lines: number };
  /** "I reviewed the high-risk files" was confirmed for these changes. */
  reviewedAt: ISODate | null;
};

export type CardScreenshotDto = { file: string; page: string; takenAt: ISODate; url: string };

/** Screenshots of the change (public pages), for the client update. */
export type CardPreviewDto = {
  /** Pages Claude said show the change. */
  pages: string[];
  screenshots: CardScreenshotDto[];
  error: string | null;
};

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
  scope: CardScopeDto;
  risk: CardRiskDto | null;
  preview: CardPreviewDto;
  /** The latest checks of the card's work (null: none ran). */
  checks: CardChecksDto | null;
  /** Time and Claude usage of every finished run (null: none yet). */
  usage: UsageTotals | null;
  /** The queued or running run, if any. `queuePosition` is 1-based among queued runs. */
  activeRun: { id: string; status: RunStatus; kind: RunKind; fixRound: number | null; queuePosition: number | null } | null;
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
