import 'server-only';
import { prisma } from '~/server/config/prisma';
import { logger } from '~/server/config/logger';
import { settingsService } from '~/server/modules/settings/settings.service';
import { usageService } from '~/server/modules/claude/usage.service';
import { executeRun } from './run-executor';
import { runRegistry } from './run-registry';

/**
 * In-process run queue (spec §9.4): at most `maxParallelRuns` runs at once,
 * the rest stay QUEUED in order. `kickQueue()` is called after a run is
 * queued, after one ends, and on server start. Calls during a pass are
 * coalesced into one more pass.
 */
const g = globalThis as unknown as { t2pQueue?: { busy: boolean; again: boolean; resumeTimer?: ReturnType<typeof setTimeout> } };
const state = (g.t2pQueue ??= { busy: false, again: false });

/** Usage limit reached: try again just after the reset. */
function scheduleResume(at: Date) {
  if (state.resumeTimer) clearTimeout(state.resumeTimer);
  const ms = Math.min(Math.max(at.getTime() - Date.now() + 2_000, 1_000), 2 ** 31 - 1);
  state.resumeTimer = setTimeout(() => {
    state.resumeTimer = undefined;
    void kickQueue();
  }, ms);
}

export async function kickQueue(): Promise<void> {
  if (state.busy) {
    state.again = true;
    return;
  }
  state.busy = true;
  try {
    do {
      state.again = false;
      await fillSlots();
    } while (state.again);
  } catch (error) {
    logger.error({ err: error }, 'Run queue failed');
  } finally {
    state.busy = false;
  }
}

async function fillSlots() {
  const pausedUntil = await usageService.pausedUntil();
  if (pausedUntil) {
    scheduleResume(pausedUntil);
    return;
  }
  const { maxParallelRuns } = await settingsService.row();
  const free = maxParallelRuns - runRegistry.activeCount();
  if (free <= 0) return;
  const queued = await prisma.run.findMany({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' }, take: free, select: { id: true } });
  for (const { id } of queued) {
    // Claim atomically: a cancelled or already-started run is skipped.
    const claimed = await prisma.run.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: new Date() } });
    if (!claimed.count) continue;
    const controller = new AbortController();
    runRegistry.register(id, controller);
    void executeRun(id, controller, () => void kickQueue());
  }
}

/** On server start: runs left RUNNING by a previous process are INTERRUPTED (spec §7.5). */
export async function recoverRuns() {
  const interrupted = await prisma.run.updateMany({
    // Runs still registered in this process (dev reloads) are genuinely running.
    where: { status: 'RUNNING', id: { notIn: runRegistry.activeIds() } },
    data: { status: 'INTERRUPTED', error: 'The server stopped during this run.', endedAt: new Date() },
  });
  if (interrupted.count) logger.warn({ count: interrupted.count }, 'Marked interrupted runs');
  await kickQueue();
}
