import 'server-only';
import { prisma } from '~/server/config/prisma';
import { notFound } from '~/server/http/errors';
import type { Prisma } from '~/generated/prisma/client';
import { STATUS_META } from '~/constants/statuses';
import { cardStatusSchema } from '~/schemas/common';
import { format } from 'date-fns';
import { EMPTY_TOTALS, periodRange, tokensOf, totalOf, usageByCard, usageCsv, USAGE_PERIODS, type UsagePeriod, type UsageTotals } from '~/lib/usage';
import type { ProjectUsageDto } from '~/types/usage';

/**
 * Time and Claude usage of the work on cards: every run (first runs,
 * follow-ups, fix rounds, checks) with its wall-clock time and the tokens and
 * API-equivalent cost Claude Code reported. For the card panel, the board
 * hint, and the project summary exported as CSV for billing.
 */
const finished = { startedAt: { not: null }, endedAt: { not: null } } satisfies Prisma.RunWhereInput;

const runUsageSelect = {
  cardId: true,
  kind: true,
  startedAt: true,
  endedAt: true,
  durationMs: true,
  checksMs: true,
  costUsd: true,
  inputTokens: true,
  outputTokens: true,
  cacheReadTokens: true,
  cacheWriteTokens: true,
} satisfies Prisma.RunSelect;

/** A calendar day in this machine's time zone. */
const day = (d: Date) => format(d, 'yyyy-MM-dd');

export const workUsageService = {
  /** Totals per card, for the board and the card panel. */
  async byCard(where: Prisma.RunWhereInput): Promise<Map<string, UsageTotals>> {
    const groups = await prisma.run.groupBy({
      by: ['cardId', 'kind'],
      where: { ...where, ...finished },
      _count: { _all: true },
      _sum: { durationMs: true, checksMs: true, costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true },
    });
    const totals = new Map<string, UsageTotals>();
    for (const { cardId, kind, _count, _sum } of groups) {
      const t = totals.get(cardId) ?? { ...EMPTY_TOTALS };
      if (kind !== 'CHECKS') t.runs += _count._all;
      if (kind === 'FIX') t.fixRounds += _count._all;
      t.durationMs += _sum.durationMs ?? 0;
      t.checksMs += _sum.checksMs ?? 0;
      t.inputTokens += _sum.inputTokens ?? 0;
      t.outputTokens += _sum.outputTokens ?? 0;
      t.cacheReadTokens += _sum.cacheReadTokens ?? 0;
      t.cacheWriteTokens += _sum.cacheWriteTokens ?? 0;
      t.tokens = tokensOf(t);
      t.costUsd += _sum.costUsd ?? 0;
      totals.set(cardId, t);
    }
    return totals;
  },

  async project(projectId: string, period: UsagePeriod, now = new Date()): Promise<ProjectUsageDto> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { cards: { select: { id: true, trelloShortLink: true, title: true, trelloUrl: true, status: true } } },
    });
    if (!project) throw notFound('Project');
    const runs = await prisma.run.findMany({ where: { card: { projectId }, ...finished }, select: runUsageSelect });
    const cards = project.cards.map((c) => ({ cardId: c.id, shortLink: c.trelloShortLink, title: c.title, trelloUrl: c.trelloUrl, status: c.status }));
    const periods = Object.fromEntries(
      USAGE_PERIODS.map((p) => [p, totalOf(usageByCard(cards, runs, periodRange(p, now)))]),
    ) as Record<UsagePeriod, UsageTotals>;
    const range = periodRange(period, now);
    return {
      period,
      firstDay: range.from ? day(range.from) : null,
      lastDay: range.to ? day(new Date(range.to.getTime() - 1)) : null,
      periods,
      cards: usageByCard(cards, runs, range),
    };
  },

  /** Deletes the finished runs that started before `before`, so the usage counts from that day. */
  async resetBefore(projectId: string, before: Date) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw notFound('Project');
    const { count } = await prisma.run.deleteMany({ where: { ...finished, startedAt: { lt: before } } });
    return { deleted: count };
  },

  /** The per-card list of a period as CSV, and a file name for it. */
  async csv(projectId: string, period: UsagePeriod, now = new Date()) {
    const [usage, project] = await Promise.all([
      this.project(projectId, period, now),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    ]);
    const label = (status: string) => STATUS_META[cardStatusSchema.catch('NEW').parse(status)].label;
    // The client sees this name: keep the project's real name instead of a slug.
    const name = project?.name ?? 'Project';
    const span = usage.firstDay ? `${usage.firstDay} to ${usage.lastDay ?? day(now)}` : 'all time';
    return { filename: `Ticket2PR usage - ${name} - ${span}.csv`, body: usageCsv(usage.cards, label) };
  },
};
