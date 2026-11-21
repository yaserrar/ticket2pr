import type { CheckStatus, ChecksStatus, CheckSummary } from '~/lib/checks';
import type { ISODate } from './api';
import type { RunKind, RunStatus } from './run';

/** One check of a run: a configured command, run in the card's folder. */
export type RunCheckDto = {
  id: string;
  name: string;
  command: string;
  status: CheckStatus;
  exitCode: number | null;
  durationMs: number | null;
  /** The end of stdout and stderr (live while it runs). */
  output: string | null;
  startedAt: ISODate | null;
};

/** `GET /api/cards/{id}/checks`: the checks of each run, newest first. */
export type RunChecksDto = {
  runId: string;
  runKind: RunKind;
  fixRound: number | null;
  runStatus: RunStatus;
  status: ChecksStatus;
  checksMs: number | null;
  createdAt: ISODate;
  checks: RunCheckDto[];
};

/** The card's latest checks, for the board badge and the push / pull request warning. */
export type CardChecksDto = { status: ChecksStatus; checks: CheckSummary };

/** `POST /api/projects/check-suggestions`. */
export type CheckSuggestionsDto = { checks: { name: string; command: string; timeoutMin: number }[] };
