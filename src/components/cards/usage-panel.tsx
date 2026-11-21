'use client';

import * as React from 'react';
import { ArrowRight2, Timer1 } from 'iconsax-react';
import { formatDuration, plural } from '~/lib/format';
import { formatCost, formatTokens, isFinishedRun, tokensOf, type UsageTotals } from '~/lib/usage';
import { cn } from '~/lib/utils';
import type { RunDto } from '~/types/run';
import { RunStatusPill } from './run-state';

export const COST_NOTE =
  'API-equivalent cost reported by Claude Code: what these tokens would cost on the Claude API. Your subscription covers it, so it measures the work, it isn’t a charge.';

/** "Initial", "Follow-up", "Fix round 1", "Checks". */
export function runKindLabel(run: Pick<RunDto, 'kind' | 'fixRound'>) {
  switch (run.kind) {
    case 'FOLLOW_UP':
      return 'Follow-up';
    case 'FIX':
      return `Fix round ${run.fixRound ?? 1}`;
    case 'CHECKS':
      return 'Checks';
    default:
      return 'Initial';
  }
}

/**
 * Run tab: the card's time and Claude usage, totals on one line (every run
 * of the card), and the recent runs on expand (first run, follow-ups, fix
 * rounds, checks on request).
 */
export function UsagePanel({ totals, runs }: { totals: UsageTotals | null; runs: RunDto[] }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  if (!totals || (!totals.durationMs && !totals.tokens)) return null;
  const finished = runs.map((run, i) => ({ run, number: runs.length - i })).filter(({ run }) => isFinishedRun(run));

  return (
    <section aria-label="Time and usage" className="rounded-xl border bg-fill-faint">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-left outline-none hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Timer1 className="size-4 text-muted-foreground" aria-hidden />
          Time and usage
        </span>
        <span className="order-last flex basis-full flex-wrap gap-x-1.5 font-mono text-[11.5px] text-muted-foreground sm:order-none sm:basis-auto">
          <span className="whitespace-nowrap">{formatDuration(totals.durationMs)}</span>
          <span className="whitespace-nowrap">· {formatTokens(totals.tokens)} tokens</span>
          <span className="whitespace-nowrap" title={COST_NOTE}>
            · ≈ {formatCost(totals.costUsd)} API-equivalent
          </span>
        </span>
        <ArrowRight2 aria-hidden className={cn('ml-auto size-3.5 shrink-0 text-subtle-foreground transition-transform', open && 'rotate-90')} />
      </button>
      {open ? (
        <div id={id} className="flex flex-col gap-4 border-t px-4 py-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total time" value={formatDuration(totals.durationMs)} hint={totals.checksMs ? `checks ${formatDuration(totals.checksMs)}` : undefined} />
            <Stat label="Claude runs" value={String(totals.runs)} hint={totals.fixRounds ? plural(totals.fixRounds, 'fix round') : undefined} />
            <Stat
              label="Tokens"
              value={formatTokens(totals.tokens)}
              hint={`${formatTokens(totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens)} in · ${formatTokens(totals.outputTokens)} out`}
            />
            <Stat label="API-equivalent" value={formatCost(totals.costUsd)} hint="reported by Claude Code" />
          </dl>

          <ol className="flex flex-col divide-y rounded-lg border bg-background/40" aria-label="Runs">
            {finished.map(({ run, number }) => (
              <li key={run.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">
                    #{number} {runKindLabel(run)}
                  </span>
                  <RunStatusPill status={run.status} />
                  <span className="ml-auto font-mono text-[11.5px] text-foreground">{run.durationMs !== null ? formatDuration(run.durationMs) : '—'}</span>
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                  {run.checksMs ? <span>checks {formatDuration(run.checksMs)}</span> : null}
                  {run.kind !== 'CHECKS' ? (
                    <>
                      <span>{formatTokens(tokensOf({ inputTokens: run.inputTokens ?? 0, outputTokens: run.outputTokens ?? 0, cacheReadTokens: run.cacheReadTokens ?? 0, cacheWriteTokens: run.cacheWriteTokens ?? 0 }))} tokens</span>
                      <span>≈ {formatCost(run.costUsd ?? 0)}</span>
                      {run.numTurns ? <span>{plural(run.numTurns, 'turn')}</span> : null}
                      {run.model ? <span className="break-all">{run.model}</span> : null}
                    </>
                  ) : (
                    <span>no Claude usage</span>
                  )}
                </p>
              </li>
            ))}
          </ol>
          <p className="text-xs leading-relaxed text-subtle-foreground">{COST_NOTE} A run stopped while Claude works reports no usage.</p>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="eyebrow text-subtle-foreground">{label}</dt>
      <dd className="font-mono text-[15px] text-foreground">{value}</dd>
      {hint ? <dd className="truncate text-[11px] text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}
