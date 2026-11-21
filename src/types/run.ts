import type { CheckStatus, ChecksStatus } from '~/lib/checks';
import type { ISODate } from './api';

export type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
/** FIX: failing checks sent back to Claude (same session). CHECKS: the checks alone, on request. */
export type RunKind = 'INITIAL' | 'FOLLOW_UP' | 'FIX' | 'CHECKS';

export type RunDto = {
  id: string;
  cardId: string;
  kind: RunKind;
  /** FIX: 1, 2… */
  fixRound: number | null;
  runner: string;
  status: RunStatus;
  summary: string | null;
  error: string | null;
  /** API-equivalent cost reported by Claude Code (covered by the subscription). */
  costUsd: number | null;
  numTurns: number | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  /** Wall clock, checks included. */
  durationMs: number | null;
  checksStatus: ChecksStatus | null;
  checksMs: number | null;
  startedAt: ISODate | null;
  endedAt: ISODate | null;
  createdAt: ISODate;
};

/** What a run streams (spec §7.4). Stored as `RunEvent.type` + JSON payload. */
export type RunEventPayload =
  | { type: 'system'; message: string }
  | { type: 'info'; message: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; output: string; isError: boolean }
  | {
      type: 'result';
      summary: string;
      numTurns: number;
      durationMs: number;
      costUsd: number;
      isError: boolean;
      /** With a Claude subscription the cost is what the run would cost on the API, not a charge. */
      costIsEstimate?: boolean;
      /** Input, output and cache tokens of this run. */
      tokens?: number;
    }
  | { type: 'check'; name: string; command: string; status: CheckStatus; durationMs: number }
  | { type: 'error'; message: string };

export type RunEventDto = RunEventPayload & { seq: number; createdAt: ISODate };
