import 'server-only';
import type { ZodType, z } from 'zod';
import type { Card, Run } from '~/generated/prisma/client';
import { cardChecklistsSchema, cardLabelsSchema } from '~/schemas/card';
import { cardStatusSchema } from '~/schemas/common';
import { isActiveRunStatus } from '~/lib/workflow';
import { scopeKindSchema, scopeSizeSchema, scopeStatusSchema } from '~/lib/scope';
import { scopeContentKey } from '~/server/modules/scope/scope-content';
import type { CardDto } from '~/types/card';
import type { RunStatus } from '~/types/run';

/** Parses a JSON column. A malformed value degrades to the fallback instead of breaking the board. */
export function parseJson<S extends ZodType>(value: string, schema: S, fallback: z.output<S>): z.output<S> {
  try {
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/** Prisma `include` giving the presenter the card's latest run. */
export const cardInclude = {
  runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, error: true } },
} as const;

export type CardPresentContext = {
  sourceListId: string;
  /** Queue position by run id (1-based), for "Queued (2nd)". */
  queuePositions?: Map<string, number>;
};

export function presentCard(
  row: Card & { runs?: Pick<Run, 'id' | 'status' | 'error'>[] },
  ctx: CardPresentContext,
): CardDto {
  const checklists = parseJson(row.checklistsJson, cardChecklistsSchema, []);
  const items = checklists.flatMap((c) => c.items);
  const latest = row.runs?.[0];
  const latestStatus = latest?.status as RunStatus | undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    trelloCardId: row.trelloCardId,
    shortLink: row.trelloShortLink,
    trelloUrl: row.trelloUrl,
    title: row.title,
    description: row.description,
    labels: parseJson(row.labelsJson, cardLabelsSchema, []),
    checklists,
    checklistProgress: { done: items.filter((i) => i.state === 'complete').length, total: items.length },
    status: cardStatusSchema.catch('NEW').parse(row.status),
    position: row.position,
    inSourceList: row.trelloListId === ctx.sourceListId,
    changedOnTrello: row.changedOnTrello,
    removedFromTrello: row.removedFromTrello,
    branchName: row.branchName,
    hasWorktree: Boolean(row.worktreePath),
    prUrl: row.prUrl,
    trelloError: row.trelloError,
    clientQuestions: row.clientQuestions,
    clientUpdate: row.clientUpdate,
    clientUpdatePostedAt: row.clientUpdatePostedAt?.toISOString() ?? null,
    waitingSince: row.waitingSince?.toISOString() ?? null,
    clientRepliedAt: row.clientRepliedAt?.toISOString() ?? null,
    scope: {
      status: scopeStatusSchema.nullable().catch(null).parse(row.scopeStatus),
      kind: scopeKindSchema.nullable().catch(null).parse(row.scopeKind),
      size: scopeSizeSchema.nullable().catch(null).parse(row.scopeSize),
      reason: row.scopeReason,
      clientNote: row.scopeClientNote,
      error: row.scopeError,
      checkedAt: row.scopeCheckedAt?.toISOString() ?? null,
      stale: Boolean(row.scopeContentKey) && row.scopeContentKey !== scopeContentKey(row),
      approved: row.scopeApproved,
      startWhenInScope: row.startWhenInScope,
      notePostedAt: row.scopeNotePostedAt?.toISOString() ?? null,
    },
    activeRun:
      latest && latestStatus && isActiveRunStatus(latestStatus)
        ? { id: latest.id, status: latestStatus, queuePosition: ctx.queuePositions?.get(latest.id) ?? null }
        : null,
    lastRun: latest && latestStatus ? { id: latest.id, status: latestStatus, error: latest.error } : null,
    trelloLastActivity: row.trelloLastActivity.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
