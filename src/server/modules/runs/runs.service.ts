import 'server-only';
import { prisma } from '~/server/config/prisma';
import { notFound } from '~/server/http/errors';
import { presentRun, presentRunEvent } from '~/server/presenters/run.presenter';
import { appendRunEvent, endRunStream } from './run-events';
import { runRegistry } from './run-registry';

export const runsService = {
  async listForCard(cardId: string) {
    const rows = await prisma.run.findMany({ where: { cardId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map(presentRun);
  },

  async get(runId: string) {
    const row = await prisma.run.findUnique({ where: { id: runId } });
    if (!row) throw notFound('Run');
    return presentRun(row);
  },

  async events(runId: string, afterSeq = -1) {
    const rows = await prisma.runEvent.findMany({
      where: { runId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      select: { seq: true, type: true, payload: true, createdAt: true },
    });
    return rows.map(presentRunEvent);
  },

  /**
   * Stop (spec §7.5): a running run is aborted (the executor records
   * CANCELLED); a queued one is cancelled directly. Waits briefly so the
   * caller sees the final status.
   */
  async cancel(runId: string) {
    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw notFound('Run');
    if (run.status === 'RUNNING' && runRegistry.abort(runId)) {
      for (let i = 0; i < 50 && runRegistry.isActive(runId); i++) await new Promise((r) => setTimeout(r, 100));
    } else if (run.status === 'QUEUED' || run.status === 'RUNNING') {
      await prisma.run.update({ where: { id: runId }, data: { status: 'CANCELLED', error: 'Stopped by you.', endedAt: new Date() } });
      await appendRunEvent(runId, { type: 'error', message: 'Stopped by you.' });
      await endRunStream(runId);
    }
    return this.get(runId);
  },
};
