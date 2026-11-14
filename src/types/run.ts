import type { ISODate } from './api';

export type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
export type RunKind = 'INITIAL' | 'FOLLOW_UP';

export type RunDto = {
  id: string;
  cardId: string;
  kind: RunKind;
  runner: string;
  status: RunStatus;
  summary: string | null;
  error: string | null;
  costUsd: number | null;
  numTurns: number | null;
  durationMs: number | null;
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
    }
  | { type: 'error'; message: string };

export type RunEventDto = RunEventPayload & { seq: number; createdAt: ISODate };
