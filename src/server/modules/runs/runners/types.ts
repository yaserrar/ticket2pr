import type { RunEventPayload, RunKind } from '~/types/run';
import type { UsageReport } from '~/server/modules/claude/usage.service';
import type { AgentUsage } from '~/lib/usage';

/** What every runner (fake now, Claude Agent SDK next) receives and returns. */
export type RunnerContext = {
  runId: string;
  kind: RunKind;
  prompt: string;
  /** The previous agent session, for follow-up and fix runs. */
  resumeSessionId: string | null;
  /** That session's cumulative usage as last reported, so the runner can tell this run's part. */
  sessionUsage: AgentUsage | null;
  /** FIX runs: which round of fixes (1, 2…). */
  fixRound: number | null;
  card: { shortLink: string; title: string; description: string; trelloUrl: string };
  worktreePath: string;
  /** Downloaded Trello attachments: Claude may read this folder. */
  attachmentsDir: string | null;
  signal: AbortSignal;
  emit: (event: RunEventPayload) => Promise<void>;
  /** Usage reports from Claude (subscription rate limits). */
  onUsage: (report: UsageReport) => Promise<void>;
};

export type RunnerResult = {
  summary: string;
  numTurns: number;
  sessionId: string | null;
  isError: boolean;
  /** Why the run failed, when `isError`. */
  error?: string | null;
  /** This run's tokens and API-equivalent cost. */
  usage: AgentUsage;
  /** The session's cumulative usage after this run (the next resumed run's `sessionUsage`). */
  sessionUsage: AgentUsage;
};

export type Runner = (ctx: RunnerContext) => Promise<RunnerResult>;
