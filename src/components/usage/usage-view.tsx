'use client';

import Link from 'next/link';
import { parse } from 'date-fns';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { ArrowLeft2, Chart, DocumentDownload, Warning2 } from 'iconsax-react';
import { AppPage, PageHeader } from '~/components/layout/app-page';
import { StatusPill } from '~/components/cards/status-dot';
import { COST_NOTE } from '~/components/cards/usage-panel';
import { EmptyState } from '~/components/shared/empty-state';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useProjectUsage } from '~/hooks/projects';
import { getErrorMessage } from '~/lib/api-errors';
import { formatDate, formatDuration, plural } from '~/lib/format';
import { formatCost, formatTokens, totalOf, USAGE_PERIOD_LABEL, USAGE_PERIODS, type UsagePeriod, type UsageTotals } from '~/lib/usage';
import { cn } from '~/lib/utils';
import { cardStatusSchema } from '~/schemas/common';
import { projectsApi } from '~/services/api/projects';
import type { CardUsageRow } from '~/lib/usage';

/** "2026-11-01" (a day the server named) → "1 Nov 2026", whatever the browser's time zone. */
const formatDay = (day: string) => formatDate(parse(day, 'yyyy-MM-dd', new Date()));

/** Work time: "0 s" rather than "0 ms" for a period without runs. */
const workTime = (ms: number) => (ms > 0 ? formatDuration(ms) : '0 s');

/**
 * Time and Claude usage of a project's cards: each period at a glance, then
 * the cards of the selected one, exported as CSV to bill maintenance work.
 */
export function UsageView({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [period, setPeriod] = useQueryState('period', parseAsStringLiteral(USAGE_PERIODS).withDefault('month'));
  const usage = useProjectUsage(projectId, period);

  return (
    <AppPage className="max-w-4xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <Link href={`/projects/${projectId}`}>
            <ArrowLeft2 className="size-4" />
            Board
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow={projectName}
        title="Time and usage"
        description="How long the work on each card took, and the tokens Claude Code reported for it. Export a period to bill maintenance work."
      />

      {usage.isPending ? (
        <UsageSkeleton />
      ) : usage.error || !usage.data ? (
        <EmptyState
          icon={Warning2}
          title="Usage could not be loaded"
          description={getErrorMessage(usage.error)}
          action={<Button onClick={() => usage.refetch()}>Retry</Button>}
        />
      ) : (
        <>
          <div role="radiogroup" aria-label="Period" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {USAGE_PERIODS.map((p) => (
              <PeriodTile key={p} period={p} totals={usage.data.periods[p]} selected={p === period} onSelect={() => void setPeriod(p)} />
            ))}
          </div>

          <section aria-label={`Cards, ${USAGE_PERIOD_LABEL[period].toLowerCase()}`} className="flex flex-col gap-4 rounded-2xl border bg-fill-faint p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 className="text-[15px] tracking-tight">{USAGE_PERIOD_LABEL[period]}</h2>
                <p className="text-[13px] text-muted-foreground">
                  {usage.data.firstDay
                    ? `${formatDay(usage.data.firstDay)} – ${usage.data.lastDay ? formatDay(usage.data.lastDay) : 'today'}`
                    : 'Since the first run'}{' '}
                  · {plural(usage.data.cards.length, 'card')}
                </p>
              </div>
              {usage.data.cards.length ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={projectsApi.usageCsvUrl(projectId, period)} download>
                    <DocumentDownload className="size-4" />
                    Export CSV
                  </a>
                </Button>
              ) : null}
            </div>

            {usage.data.cards.length ? (
              <CardList projectId={projectId} rows={usage.data.cards} />
            ) : (
              <EmptyState
                size="sm"
                icon={Chart}
                title="No work in this period"
                description="Runs count in the period they started in. Pick another period above."
              />
            )}
          </section>

          <p className="text-xs leading-relaxed text-subtle-foreground">
            Time is the wall clock of each run: preparing the folder, Claude’s work, the checks and screenshots. Tokens include cache reads
            and writes. {COST_NOTE}
          </p>
        </>
      )}
    </AppPage>
  );
}

function PeriodTile({ period, totals, selected, onSelect }: { period: UsagePeriod; totals: UsageTotals; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-brand-border bg-brand-subtle' : 'bg-fill-faint hover:bg-fill',
      )}
    >
      <span className={cn('eyebrow', selected ? 'text-brand-muted' : 'text-subtle-foreground')}>{USAGE_PERIOD_LABEL[period]}</span>
      <span className="font-mono text-lg text-foreground">{workTime(totals.durationMs)}</span>
      <span className="truncate font-mono text-[11.5px] text-muted-foreground">
        {formatTokens(totals.tokens)} tok · ≈{formatCost(totals.costUsd)}
      </span>
    </button>
  );
}

const COLUMNS = 'sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_5rem_5rem]';

function CardList({ projectId, rows }: { projectId: string; rows: CardUsageRow[] }) {
  const total = totalOf(rows);
  return (
    <div className="flex flex-col">
      <div aria-hidden className={cn('hidden gap-3 border-b px-2 pb-2 text-xs font-medium text-muted-foreground sm:grid', COLUMNS)}>
        <span>Card</span>
        <span className="text-right">Time</span>
        <span className="text-right">Runs</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">API-equiv.</span>
      </div>
      <ul className="flex flex-col divide-y">
        {rows.map((row) => (
          <li key={row.cardId} className={cn('grid grid-cols-2 gap-x-3 gap-y-1.5 px-2 py-3 sm:items-center', COLUMNS)}>
            <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
              <Link
                href={`/projects/${projectId}?card=${row.cardId}`}
                className="truncate text-[13.5px] font-medium text-foreground underline-offset-4 hover:underline"
              >
                {row.title}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-xs text-subtle-foreground">
                <span className="font-mono">{row.shortLink}</span>
                <StatusPill status={cardStatusSchema.catch('NEW').parse(row.status)} />
                {row.lastRunAt ? <span>last run {formatDate(row.lastRunAt)}</span> : null}
              </span>
            </div>
            <Cell label="Time" value={formatDuration(row.durationMs)} hint={row.checksMs ? `checks ${formatDuration(row.checksMs)}` : undefined} />
            <Cell label="Runs" value={String(row.runs)} hint={row.fixRounds ? plural(row.fixRounds, 'fix') : undefined} />
            <Cell label="Tokens" value={formatTokens(row.tokens)} />
            <Cell label="API-equivalent" value={formatCost(row.costUsd)} />
          </li>
        ))}
      </ul>
      <div className={cn('grid grid-cols-2 gap-x-3 gap-y-1.5 border-t px-2 pt-3 sm:items-center', COLUMNS)}>
        <span className="col-span-2 text-[13px] font-medium text-foreground sm:col-span-1">Total</span>
        <Cell label="Time" value={workTime(total.durationMs)} strong />
        <Cell label="Runs" value={String(total.runs)} strong />
        <Cell label="Tokens" value={formatTokens(total.tokens)} strong />
        <Cell label="API-equivalent" value={formatCost(total.costUsd)} strong />
      </div>
    </div>
  );
}

/** A number: labelled on phones (no header row), right-aligned under the header on larger screens. */
function Cell({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 sm:flex-col sm:items-end sm:gap-0">
      <span className="text-xs text-muted-foreground sm:sr-only">{label}</span>
      <span className="flex flex-col items-end">
        <span className={cn('font-mono text-[13px] text-foreground', strong && 'font-medium')}>{value}</span>
        {hint ? <span className="text-[11px] text-subtle-foreground">{hint}</span> : null}
      </span>
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {USAGE_PERIODS.map((p) => (
          <Skeleton key={p} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
