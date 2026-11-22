import { z } from 'zod';
import { format, startOfMonth, startOfWeek, subMonths } from 'date-fns';

/**
 * Time and Claude usage per run, card and project. Claude Code reports, for
 * each run, the tokens it used and what they would cost on the API
 * (`total_cost_usd`): with a subscription nothing is charged, but the figure
 * is a fair measure of the work for billing maintenance to a client. Pure, so
 * aggregation and the CSV are unit-tested.
 */
export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** API-equivalent cost reported by Claude Code. */
  costUsd: number;
  /** Models used, most expensive first. */
  models: string[];
};

export const agentUsageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  cacheReadTokens: z.number().nonnegative(),
  cacheWriteTokens: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
  models: z.array(z.string()),
});

const COUNTERS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'costUsd'] as const;

export const tokensOf = (u: Pick<AgentUsage, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>) =>
  u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;

export function addUsage(a: AgentUsage | null, b: AgentUsage): AgentUsage {
  if (!a) return b;
  const sum = Object.fromEntries(COUNTERS.map((k) => [k, a[k] + b[k]])) as Omit<AgentUsage, 'models'>;
  return { ...sum, models: [...new Set([...a.models, ...b.models])] };
}

/**
 * This run's part of a session's usage. A resumed session reports totals that
 * include the earlier runs of the session ("continues from the total its
 * transcript saved, when it has one"): when every counter grew from the
 * previous report, the difference is this run's; otherwise the session started
 * its totals afresh and the report is this run's alone.
 */
export function usageDelta(reported: AgentUsage, previous: AgentUsage | null): AgentUsage {
  if (!previous || !COUNTERS.every((k) => reported[k] >= previous[k])) return reported;
  const delta = Object.fromEntries(COUNTERS.map((k) => [k, Math.max(0, reported[k] - previous[k])])) as Omit<AgentUsage, 'models'>;
  return { ...delta, costUsd: Math.round(delta.costUsd * 1e6) / 1e6, models: reported.models };
}

export function parseUsage(json: string | null | undefined): AgentUsage | null {
  if (!json) return null;
  try {
    const parsed = agentUsageSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ─── Totals ──────────────────────────────────────────────────────────────────

/** What a run contributes (a `Run` row, or its DTO). */
export type RunUsageRow = {
  kind: string;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  durationMs: number | null;
  checksMs: number | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
};

export type UsageTotals = {
  /** Claude runs (first, follow-ups, fix rounds) that finished. Checks-only runs add time, not runs. */
  runs: number;
  fixRounds: number;
  /** Wall clock of every finished run, checks included. */
  durationMs: number;
  checksMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  tokens: number;
  costUsd: number;
};

export const EMPTY_TOTALS: UsageTotals = {
  runs: 0,
  fixRounds: 0,
  durationMs: 0,
  checksMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  tokens: 0,
  costUsd: 0,
};

/** Started and ended: queued, running and never-started runs count for nothing yet. */
export const isFinishedRun = (run: Pick<RunUsageRow, 'startedAt' | 'endedAt'>) => Boolean(run.startedAt && run.endedAt);

export function sumUsage(runs: RunUsageRow[]): UsageTotals {
  const totals = { ...EMPTY_TOTALS };
  for (const run of runs) {
    if (!isFinishedRun(run)) continue;
    if (run.kind !== 'CHECKS') totals.runs += 1;
    if (run.kind === 'FIX') totals.fixRounds += 1;
    totals.durationMs += run.durationMs ?? 0;
    totals.checksMs += run.checksMs ?? 0;
    totals.inputTokens += run.inputTokens ?? 0;
    totals.outputTokens += run.outputTokens ?? 0;
    totals.cacheReadTokens += run.cacheReadTokens ?? 0;
    totals.cacheWriteTokens += run.cacheWriteTokens ?? 0;
    totals.costUsd += run.costUsd ?? 0;
  }
  totals.tokens = tokensOf(totals);
  totals.costUsd = Math.round(totals.costUsd * 1e6) / 1e6;
  return totals;
}

// ─── Periods ─────────────────────────────────────────────────────────────────

export const USAGE_PERIODS = ['week', 'month', 'last-month', 'all'] as const;
export const usagePeriodSchema = z.enum(USAGE_PERIODS);
export type UsagePeriod = z.infer<typeof usagePeriodSchema>;

export const USAGE_PERIOD_LABEL: Record<UsagePeriod, string> = {
  week: 'This week',
  month: 'This month',
  'last-month': 'Last month',
  all: 'All time',
};

/** [from, to) in local time; weeks start on Monday. `null` = unbounded. */
export function periodRange(period: UsagePeriod, now: Date): { from: Date | null; to: Date | null } {
  switch (period) {
    case 'week':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: null };
    case 'month':
      return { from: startOfMonth(now), to: null };
    case 'last-month':
      return { from: startOfMonth(subMonths(now, 1)), to: startOfMonth(now) };
    case 'all':
      return { from: null, to: null };
  }
}

export function inRange(date: Date | string | null, range: { from: Date | null; to: Date | null }) {
  if (!date) return false;
  const t = new Date(date).getTime();
  return (!range.from || t >= range.from.getTime()) && (!range.to || t < range.to.getTime());
}

// ─── Per card, and the CSV for billing ──────────────────────────────────────

export type CardUsageRow = UsageTotals & {
  cardId: string;
  shortLink: string;
  title: string;
  trelloUrl: string;
  status: string;
  firstRunAt: string | null;
  lastRunAt: string | null;
};

type CardInfo = Pick<CardUsageRow, 'cardId' | 'shortLink' | 'title' | 'trelloUrl' | 'status'>;

/** Cards with runs in the period, latest work first. A run belongs to the period it started in. */
export function usageByCard(cards: CardInfo[], runs: (RunUsageRow & { cardId: string })[], range: { from: Date | null; to: Date | null }) {
  const byCard = new Map<string, (RunUsageRow & { cardId: string })[]>();
  for (const run of runs) {
    if (!isFinishedRun(run) || !inRange(run.startedAt, range)) continue;
    byCard.set(run.cardId, [...(byCard.get(run.cardId) ?? []), run]);
  }
  const rows: CardUsageRow[] = [];
  for (const card of cards) {
    const cardRuns = byCard.get(card.cardId);
    if (!cardRuns?.length) continue;
    const starts = cardRuns.map((r) => new Date(r.startedAt!).getTime()).sort((a, b) => a - b);
    rows.push({
      ...card,
      ...sumUsage(cardRuns),
      firstRunAt: new Date(starts[0]!).toISOString(),
      lastRunAt: new Date(starts.at(-1)!).toISOString(),
    });
  }
  return rows.sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? ''));
}

/** Totals of the per-card rows (the period's total). */
export function totalOf(rows: UsageTotals[]): UsageTotals {
  const totals = { ...EMPTY_TOTALS };
  for (const row of rows) {
    for (const key of Object.keys(totals) as (keyof UsageTotals)[]) totals[key] += row[key];
  }
  totals.costUsd = Math.round(totals.costUsd * 1e6) / 1e6;
  return totals;
}

/** 4 812 000 ms → "1:20:12". */
export function clockDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** A CSV cell: quoted when needed, and never read as a formula by a spreadsheet (titles come from clients). */
export function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const USAGE_CSV_HEADER = [
  'Card',
  'Trello card',
  'Status',
  'Runs',
  'Fix rounds',
  'Time (h:mm:ss)',
  'Time (hours)',
  'Checks time (hours)',
  'Input tokens',
  'Output tokens',
  'Cache read tokens',
  'Cache write tokens',
  'API-equivalent cost reported by Claude Code (USD)',
  'First run',
  'Last run',
];

const hours = (ms: number) => (ms / 3_600_000).toFixed(2);
const when = (iso: string | null) => (iso ? format(new Date(iso), 'yyyy-MM-dd HH:mm') : '');

/** One line per card, for billing maintenance work. `statusLabel` names the board column. */
export function usageCsv(rows: CardUsageRow[], statusLabel: (status: string) => string) {
  const lines = rows.map((r) =>
    [
      r.title,
      r.trelloUrl,
      statusLabel(r.status),
      r.runs,
      r.fixRounds,
      clockDuration(r.durationMs),
      hours(r.durationMs),
      hours(r.checksMs),
      r.inputTokens,
      r.outputTokens,
      r.cacheReadTokens,
      r.cacheWriteTokens,
      r.costUsd.toFixed(2),
      when(r.firstRunAt),
      when(r.lastRunAt),
    ]
      .map(csvCell)
      .join(','),
  );
  return [USAGE_CSV_HEADER.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
}

/** 950 → "950", 18 420 → "18.4k", 182 400 → "182k", 1 250 000 → "1.25M". */
export function formatTokens(n: number) {
  if (n < 1000) return String(Math.round(n));
  if (n < 999_500) return `${(n / 1000).toFixed(n < 99_950 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
}

/** "$0.84", "<$0.01". */
export function formatCost(usd: number) {
  if (usd > 0 && usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

/** Mean API-equivalent cost of one run over the given cards. 0 when nothing ran. */
export function averageRunCost(rows: Pick<UsageTotals, 'runs' | 'costUsd'>[]) {
  const runs = rows.reduce((sum, r) => sum + r.runs, 0);
  return runs === 0 ? 0 : rows.reduce((sum, r) => sum + r.costUsd, 0) / runs;
}

export type BudgetStatus = 'ok' | 'near' | 'over';

/** Where a period's cost stands against a monthly budget: "near" from 80 %, "over" past it. */
export function budgetStatus(spentUsd: number, budgetUsd: number): BudgetStatus {
  const ratio = spentUsd / budgetUsd;
  if (ratio >= 0.8) return 'near';
  if (ratio >= 1) return 'over';
  return 'ok';
}
