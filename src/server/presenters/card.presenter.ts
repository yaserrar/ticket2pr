import 'server-only';
import type { ZodType, z } from 'zod';
import type { Card, Run } from '~/generated/prisma/client';
import { cardChecklistsSchema, cardLabelsSchema } from '~/schemas/card';
import { cardStatusSchema } from '~/schemas/common';
import { isActiveRunStatus } from '~/lib/workflow';
import { scopeKindSchema, scopeSizeSchema, scopeStatusSchema } from '~/lib/scope';
import { scopeContentKey } from '~/server/modules/scope/scope-content';
import { riskService } from '~/server/modules/risk/risk.service';
import { parsePages, parseScreenshots } from '~/server/modules/preview/card-preview.service';
import { checkSummarySchema, checksStatusSchema } from '~/lib/checks';
import type { UsageTotals } from '~/lib/usage';
import type { CardDto } from '~/types/card';
import type { RunKind, RunStatus } from '~/types/run';

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
  runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, error: true, kind: true, fixRound: true } },
} as const;

export type CardPresentContext = {
  sourceListId: string;
  /** Queue position by run id (1-based), for "Queued (2nd)". */
  queuePositions?: Map<string, number>;
  /** Time and usage totals by card id. */
  usage?: Map<string, UsageTotals>;
};

export function presentCard(
  row: Card & { runs?: Pick<Run, 'id' | 'status' | 'error' | 'kind' | 'fixRound'>[] },
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
    risk: (() => {
      const risk = riskService.parse(row.riskLevel, row.riskJson);
      return risk ? { ...risk, reviewedAt: row.riskReviewedAt?.toISOString() ?? null } : null;
    })(),
    preview: {
      pages: parsePages(row.previewPagesJson),
      screenshots: parseScreenshots(row.screenshotsJson).map((s) => ({ ...s, url: `/api/cards/${row.id}/screenshots/${s.file}` })),
      error: row.screenshotError,
    },
    checks: (() => {
      const status = checksStatusSchema.safeParse(row.checksStatus);
      return status.success ? { status: status.data, checks: parseJson(row.checksJson ?? '[]', checkSummarySchema, []) } : null;
    })(),
    usage: ctx.usage?.get(row.id) ?? null,
    activeRun:
      latest && latestStatus && isActiveRunStatus(latestStatus)
        ? {
            id: latest.id,
            status: latestStatus,
            kind: latest.kind as RunKind,
            fixRound: latest.fixRound,
            queuePosition: ctx.queuePositions?.get(latest.id) ?? null,
          }
        : null,
    lastRun: latest && latestStatus ? { id: latest.id, status: latestStatus, error: latest.error } : null,
    trelloLastActivity: row.trelloLastActivity.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
