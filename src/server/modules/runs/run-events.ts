import 'server-only';
import { prisma } from '~/server/config/prisma';
import { presentRunEvent, serializeRunEvent } from '~/server/presenters/run.presenter';
import type { RunEventPayload } from '~/types/run';
import { runRegistry } from './run-registry';

/**
 * Appends to a run's log: written to SQLite first (increasing `seq`, for
 * replay after a reload), then pushed to live subscribers (spec §7.4).
 * Appends are serialised per run so `seq` never collides.
 */
const g = globalThis as unknown as { t2pRunEventChains?: Map<string, Promise<unknown>> };
const chains = (g.t2pRunEventChains ??= new Map());

export function appendRunEvent(runId: string, event: RunEventPayload): Promise<void> {
  const previous = chains.get(runId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const last = await prisma.runEvent.aggregate({ where: { runId }, _max: { seq: true } });
      const seq = (last._max.seq ?? -1) + 1;
      const row = await prisma.runEvent.create({ data: { runId, seq, ...serializeRunEvent(event) } });
      runRegistry.publish(runId, { kind: 'event', event: presentRunEvent(row) });
    });
  chains.set(runId, next);
  void next.finally(() => {
    if (chains.get(runId) === next) chains.delete(runId);
  });
  return next;
}

/** Waits for pending appends, then tells subscribers the run ended. */
export async function endRunStream(runId: string) {
  await (chains.get(runId) ?? Promise.resolve()).catch(() => undefined);
  runRegistry.publish(runId, { kind: 'end' });
}
