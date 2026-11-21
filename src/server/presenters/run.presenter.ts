import 'server-only';
import type { Run, RunEvent } from '~/generated/prisma/client';
import { checksStatusSchema } from '~/lib/checks';
import type { RunDto, RunEventDto, RunEventPayload, RunKind, RunStatus } from '~/types/run';

export function presentRun(row: Run): RunDto {
  return {
    id: row.id,
    cardId: row.cardId,
    kind: row.kind as RunKind,
    fixRound: row.fixRound,
    runner: row.runner,
    status: row.status as RunStatus,
    summary: row.summary,
    error: row.error,
    costUsd: row.costUsd,
    numTurns: row.numTurns,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    durationMs: row.durationMs,
    checksStatus: checksStatusSchema.nullable().catch(null).parse(row.checksStatus),
    checksMs: row.checksMs,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function presentRunEvent(row: Pick<RunEvent, 'seq' | 'type' | 'payload' | 'createdAt'>): RunEventDto {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    payload = { message: row.payload };
  }
  return { ...(payload as object), type: row.type, seq: row.seq, createdAt: row.createdAt.toISOString() } as RunEventDto;
}

/** Splits a payload into the stored `type` column and the JSON rest. */
export function serializeRunEvent(event: RunEventPayload) {
  const { type, ...rest } = event;
  return { type, payload: JSON.stringify(rest) };
}
