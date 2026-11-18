import 'server-only';
import { prisma } from '~/server/config/prisma';
import { usageService } from '~/server/modules/claude/usage.service';
import { formatTime } from '~/lib/format';
import type { NotificationDto, NotificationsDto } from '~/types/client-loop';

/**
 * What the developer should hear about while the app is open (desktop
 * notifications): finished or failed runs, questions for the client, client
 * replies, cards Claude thinks are out of scope, and the usage-limit pause.
 */
export const notificationsService = {
  async feed(after: Date | null): Promise<NotificationsDto> {
    const now = new Date();
    const activeRuns = await prisma.run.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } });
    if (!after) return { now: now.toISOString(), activeRuns, events: [] };

    const [runs, replies, scoped, usage] = await Promise.all([
      prisma.run.findMany({
        where: { endedAt: { gt: after, lte: now }, status: { in: ['SUCCEEDED', 'FAILED'] } },
        orderBy: { endedAt: 'asc' },
        take: 20,
        select: {
          id: true,
          status: true,
          error: true,
          endedAt: true,
          card: { select: { id: true, title: true, projectId: true, clientQuestions: true, project: { select: { name: true } } } },
        },
      }),
      prisma.card.findMany({
        where: { clientRepliedAt: { gt: after, lte: now } },
        take: 20,
        select: { id: true, title: true, projectId: true, clientRepliedAt: true, project: { select: { name: true } } },
      }),
      prisma.card.findMany({
        where: { scopeCheckedAt: { gt: after, lte: now }, scopeStatus: { in: ['OUT_OF_SCOPE', 'UNSURE'] }, status: 'NEW' },
        take: 20,
        select: { id: true, title: true, projectId: true, scopeStatus: true, scopeReason: true, scopeCheckedAt: true },
      }),
      usageService.state(),
    ]);

    const events: NotificationDto[] = [];
    let paused = false;
    for (const run of runs) {
      const at = (run.endedAt ?? now).toISOString();
      const base = { projectId: run.card.projectId, cardId: run.card.id, at };
      if (run.status === 'FAILED' && run.error?.includes('usage limit')) {
        paused = true;
        continue;
      }
      if (run.status === 'FAILED') {
        events.push({ ...base, id: `run-${run.id}`, kind: 'RUN_FAILED', title: `Run failed: ${run.card.title}`, body: run.error ?? run.card.project.name });
      } else if (run.card.clientQuestions) {
        events.push({ ...base, id: `run-${run.id}`, kind: 'QUESTIONS', title: `Claude has questions: ${run.card.title}`, body: 'Review them and ask the client on Trello.' });
      } else {
        events.push({ ...base, id: `run-${run.id}`, kind: 'RUN_SUCCEEDED', title: `Ready for review: ${run.card.title}`, body: run.card.project.name });
      }
    }
    for (const card of replies) {
      events.push({
        id: `reply-${card.id}-${card.clientRepliedAt?.getTime()}`,
        kind: 'CLIENT_REPLIED',
        title: `The client replied: ${card.title}`,
        body: 'Continue the card with their answer.',
        projectId: card.projectId,
        cardId: card.id,
        at: (card.clientRepliedAt ?? now).toISOString(),
      });
    }
    for (const card of scoped) {
      events.push({
        id: `scope-${card.id}-${card.scopeCheckedAt?.getTime()}`,
        kind: 'OUT_OF_SCOPE',
        title: `${card.scopeStatus === 'UNSURE' ? 'In scope? Claude isn’t sure' : 'Out of scope'}: ${card.title}`,
        body: card.scopeReason ?? 'Decide before starting it.',
        projectId: card.projectId,
        cardId: card.id,
        at: (card.scopeCheckedAt ?? now).toISOString(),
      });
    }
    if (paused && usage.pausedUntil) {
      events.push({
        id: `paused-${usage.pausedUntil}`,
        kind: 'PAUSED',
        title: 'Claude usage limit reached',
        body: `Runs continue automatically at ${formatTime(usage.pausedUntil)}.`,
        projectId: null,
        cardId: null,
        at: now.toISOString(),
      });
    }
    return { now: now.toISOString(), activeRuns, events };
  },
};
