import type { RunEventPayload, RunKind } from '~/types/run';
import type { UsageReport } from '~/server/modules/claude/usage.service';

/** What every runner (fake now, Claude Agent SDK next) receives and returns. */
export type RunnerContext = {
  runId: string;
  kind: RunKind;
  prompt: string;
  /** The previous agent session, for follow-up runs. */
  resumeSessionId: string | null;
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
  costUsd: number;
  sessionId: string | null;
  isError: boolean;
  /** Why the run failed, when `isError`. */
  error?: string | null;
};

export type Runner = (ctx: RunnerContext) => Promise<RunnerResult>;
