import 'server-only';
import { subDays } from 'date-fns';
import { prisma } from '~/server/config/prisma';
import { logger } from '~/server/config/logger';
import { notFound } from '~/server/http/errors';
import { trelloService } from '~/server/modules/trello/trello.service';
import type { SyncTrigger } from '~/schemas/common';
import type { SyncResultDto } from '~/types/project';
import { postedIdsOf } from '~/server/modules/trello/write-back.service';
import type { TrelloComment } from '~/server/modules/trello/trello.schemas';
import { scopeService } from '~/server/modules/scope/scope.service';
import { contentFromTrello, groupChecklistsByCard, planCommentFlags, planSync, refreshCard } from './sync.plan';

const POSITION_STEP = 1000;
const SYNC_LOG_RETENTION_DAYS = 7;

/**
 * One in-flight sync per project, kept on `globalThis` so dev hot reloads
 * share it. A second request while a sync runs gets the same result instead
 * of starting another one.
 */
const globalForSync = globalThis as unknown as { syncLocks?: Map<string, Promise<SyncResultDto>> };
const locks = (globalForSync.syncLocks ??= new Map());

export const syncService = {
  syncProject(projectId: string, trigger: SyncTrigger): Promise<SyncResultDto> {
    const running = locks.get(projectId);
    if (running) return running;
    const promise = runSync(projectId, trigger).finally(() => locks.delete(projectId));
    locks.set(projectId, promise);
    return promise;
  },
};

async function runSync(projectId: string, trigger: SyncTrigger): Promise<SyncResultDto> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Project');
  const client = await trelloService.client();
  const log = await prisma.syncLog.create({ data: { projectId, trigger } });

  try {
    const [remote, local] = await Promise.all([
      client.openCards(project.trelloBoardId),
      prisma.card.findMany({
        where: { projectId },
        select: {
          id: true,
          trelloCardId: true,
          status: true,
          title: true,
          description: true,
          labelsJson: true,
          checklistsJson: true,
          trelloListId: true,
          trelloLastActivity: true,
          removedFromTrello: true,
          postedCommentIds: true,
          sentContextAt: true,
          waitingSince: true,
          clientRepliedAt: true,
          changedOnTrello: true,
        },
      }),
    ]);

    // Comments only matter on cards being worked on; one board request covers them all.
    const working = local.filter((c) => c.status === 'IN_PROGRESS' || c.status === 'REVIEW');
    const comments: TrelloComment[] = working.length
      ? await client
          .boardComments(project.trelloBoardId, project.lastSyncedAt ?? subDays(new Date(), 1))
          .catch((error: unknown) => {
            logger.warn({ err: error, projectId }, 'Reading Trello comments failed');
            return [];
          })
      : [];
    const commentFlags = planCommentFlags(
      comments,
      working.map((c) => ({ ...c, postedCommentIds: postedIdsOf(c.postedCommentIds) })),
    );

    const plan = planSync({ sourceListId: project.trelloSourceListId, remote, local });
    const needsChecklists = plan.create.length > 0 || plan.refresh.length > 0;
    const checklists = needsChecklists ? groupChecklistsByCard(await client.checklists(project.trelloBoardId)) : new Map();

    const last = await prisma.card.aggregate({ where: { projectId, status: 'NEW' }, _max: { position: true } });
    let position = last._max.position ?? 0;

    const creates = plan.create.map((card) => {
      position += POSITION_STEP;
      return prisma.card.create({
        data: {
          projectId,
          trelloCardId: card.id,
          trelloShortLink: card.shortLink,
          trelloUrl: card.url,
          trelloListId: card.idList,
          trelloLastActivity: new Date(card.dateLastActivity),
          position,
          ...contentFromTrello(card, checklists.get(card.id) ?? []),
        },
      });
    });

    let updated = plan.restore.length;
    const refreshes = plan.refresh.map(({ local: card, remote: trelloCard }) => {
      const { changed, data } = refreshCard(card, trelloCard, checklists.get(trelloCard.id) ?? []);
      // Set aside as out of scope, then moved back to the source list on Trello: the client agreed to the new work.
      const backInScope =
        card.status === 'OUT_OF_SCOPE' && trelloCard.idList === project.trelloSourceListId && card.trelloListId !== trelloCard.idList;
      if (changed || backInScope) updated++;
      if (backInScope) position += POSITION_STEP;
      return prisma.card.update({
        where: { id: card.id },
        data: backInScope ? { ...data, status: 'NEW', position, scopeApproved: true, changedOnTrello: false } : data,
      });
    });
    const restores = plan.restore.map((card) =>
      prisma.card.update({ where: { id: card.id }, data: { removedFromTrello: false } }),
    );
    const removals = plan.remove.map((card) =>
      prisma.card.update({ where: { id: card.id }, data: { removedFromTrello: true } }),
    );

    const flags = [...commentFlags].map(([id, data]) => prisma.card.update({ where: { id }, data }));
    updated += flags.length;

    const now = new Date();
    const result = { added: plan.create.length, updated, removed: plan.remove.length };
    await prisma.$transaction([
      ...creates,
      ...refreshes,
      ...restores,
      ...removals,
      ...flags,
      prisma.project.update({ where: { id: projectId }, data: { lastSyncedAt: now } }),
      prisma.syncLog.update({ where: { id: log.id }, data: { endedAt: now, ...result } }),
    ]);

    await prisma.syncLog.deleteMany({
      where: { projectId, startedAt: { lt: subDays(now, SYNC_LOG_RETENTION_DAYS) } },
    });

    if (result.added || result.updated || result.removed) logger.info({ projectId, trigger, ...result }, 'Trello sync');
    // New cards (and ones edited since their verdict) get a scope check, in the background.
    if (project.scopeCheck) void scopeService.queueProject(projectId).catch((error: unknown) => logger.warn({ err: error, projectId }, 'Queueing scope checks failed'));
    return { ...result, lastSyncedAt: now.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    await prisma.syncLog
      .update({ where: { id: log.id }, data: { endedAt: new Date(), error: message } })
      .catch(() => undefined);
    throw error;
  }
}
