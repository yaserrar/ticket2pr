import 'server-only';
import { prisma } from '~/server/config/prisma';
import { usageService } from '~/server/modules/claude/usage.service';
import { formatTime } from '~/lib/format';
import type { NotificationDto, NotificationsDto } from '~/types/client-loop';

/**
 * What the developer should hear about while the app is open (desktop
 * notifications): finished or failed runs, questions for the client, client
 * replies, and the usage-limit pause.
 */
export const notificationsService = {
  async feed(after: Date | null): Promise<NotificationsDto> {
    const now = new Date();
    const activeRuns = await prisma.run.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } });
    if (!after) return { now: now.toISOString(), activeRuns, events: [] };

    const [runs, replies, usage] = await Promise.all([
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
