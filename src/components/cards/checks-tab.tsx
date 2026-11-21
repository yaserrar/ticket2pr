'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight2, Clock, CloseCircle, MinusCirlce, Refresh2, Setting4, TaskSquare, TickCircle, Timer1 } from 'iconsax-react';
import { toast } from 'sonner';
import { EmptyState } from '~/components/shared/empty-state';
import { ReasonButton } from '~/components/shared/reason-button';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useCardChecks, useRunChecks } from '~/hooks/cards';
import { useBoard } from '~/hooks/projects';
import { CHECK_STATUS_LABEL, failingNames, isCheckFailure, type CheckStatus, type ChecksStatus } from '~/lib/checks';
import { formatDuration, formatRelative, plural } from '~/lib/format';
import { cn } from '~/lib/utils';
import type { CardDto } from '~/types/card';
import type { RunCheckDto, RunChecksDto } from '~/types/checks';
import { TONE_CLASS } from './run-state';

const CHECK_TONE: Record<CheckStatus, keyof typeof TONE_CLASS> = {
  PENDING: 'muted',
  RUNNING: 'brand',
  PASSED: 'success',
  FAILED: 'danger',
  TIMED_OUT: 'danger',
  SKIPPED: 'muted',
};

const CHECK_ICON: Record<Exclude<CheckStatus, 'RUNNING'>, typeof TickCircle> = {
  PENDING: Clock,
  PASSED: TickCircle,
  FAILED: CloseCircle,
  TIMED_OUT: Timer1,
  SKIPPED: MinusCirlce,
};

export function CheckStatusChip({ status, className }: { status: CheckStatus; className?: string }) {
  const Icon = status === 'RUNNING' ? null : CHECK_ICON[status];
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium', TONE_CLASS[CHECK_TONE[status]], className)}>
      {Icon ? <Icon className="size-3" aria-hidden /> : <span aria-hidden className="dot-running size-1.5 rounded-full" />}
      {CHECK_STATUS_LABEL[status]}
    </span>
  );
}

/** "Initial run", "Fix round 1", "Checks on request". */
function roundLabel(run: Pick<RunChecksDto, 'runKind' | 'fixRound'>) {
  switch (run.runKind) {
    case 'FIX':
      return `Fix round ${run.fixRound ?? 1}`;
    case 'FOLLOW_UP':
      return 'After a follow-up';
    case 'CHECKS':
      return 'Run by you';
    default:
      return 'After the first run';
  }
}

const HEADLINE: Record<ChecksStatus, { title: string; tone: string; icon: typeof TickCircle | null }> = {
  RUNNING: { title: 'Running checks…', tone: 'border-brand-border', icon: null },
  PASSED: { title: 'All checks passed', tone: 'border-success/25', icon: TickCircle },
  FAILED: { title: 'Checks failing', tone: 'border-danger/25', icon: CloseCircle },
  STOPPED: { title: 'Checks stopped', tone: 'border-warning/30', icon: MinusCirlce },
};

/**
 * Checks tab: the project's commands run after each run, before Review. The
 * latest round first, each check expandable to the end of its output;
 * earlier rounds (before a fix) below. "Run checks" repeats them without
 * Claude, after editing the code by hand.
 */
export function ChecksTab({ card }: { card: CardDto }) {
  const board = useBoard(card.projectId);
  const project = board.data?.project;
  const live = card.checks?.status === 'RUNNING' || Boolean(card.activeRun);
  const query = useCardChecks(card.id, live);
  const runChecks = useRunChecks(card.projectId, card.id);
  const configured = Boolean(project?.checksEnabled && project.checks.length);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  const rounds = query.data ?? [];
  const [latest, ...earlier] = rounds;
  const canRun = (card.status === 'IN_PROGRESS' || card.status === 'REVIEW') && card.hasWorktree;
  const runReason = card.activeRun
    ? 'Wait for the run to finish, or stop it first.'
    : !canRun
      ? 'Checks run on the card’s folder, once its first run created it.'
      : null;

  const runButton = configured ? (
    <ReasonButton
      size="sm"
      variant="outline"
      loading={runChecks.isPending}
      reason={runReason}
      onClick={() => runChecks.mutate(undefined, { onSuccess: () => toast.success('Checks queued') })}
    >
      <Refresh2 className="size-4" />
      Run checks
    </ReasonButton>
  ) : null;

  if (!latest) {
    return (
      <EmptyState
        size="sm"
        icon={TaskSquare}
        title={configured ? 'No checks yet' : 'No checks set up'}
        description={
          configured
            ? `${project!.checks.map((c) => c.name).join(', ')} run after Claude’s next run, before the card goes to Review.`
            : 'Turn on checks in Project settings: after each run, Ticket2PR runs your typecheck, lint and tests, and sends failures back to Claude.'
        }
        action={
          configured ? (
            runButton
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/projects/${card.projectId}/settings`}>
                <Setting4 className="size-4" />
                Project settings
              </Link>
            </Button>
          )
        }
      />
    );
  }

  const headline = HEADLINE[latest.status];
  const failing = failingNames(latest.checks);
  const passed = latest.checks.filter((c) => c.status === 'PASSED').length;

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Latest checks" className={cn('flex flex-col gap-3 rounded-xl border bg-fill-faint p-4', headline.tone)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3
              className={cn(
                'flex items-center gap-2 text-[13px] font-medium',
                latest.status === 'PASSED' && 'text-success-muted',
                latest.status === 'FAILED' && 'text-danger-muted',
                latest.status === 'STOPPED' && 'text-warning-muted',
              )}
            >
              {headline.icon ? <headline.icon className="size-4 shrink-0" /> : <span aria-hidden className="dot-running size-1.5 rounded-full" />}
              <span className={cn(latest.status === 'RUNNING' && 'text-shimmer')}>{headline.title}</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {roundLabel(latest)} · {passed} of {latest.checks.length} passed
              {latest.checksMs ? ` · ${formatDuration(latest.checksMs)}` : ''} · {formatRelative(latest.createdAt)}
            </p>
          </div>
          {runButton}
        </div>
        {latest.status === 'FAILED' ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {card.activeRun?.kind === 'FIX'
              ? `${failing} failed. Claude is fixing it (fix round ${card.activeRun.fixRound ?? 1}).`
              : latest.runKind === 'FIX'
                ? `${failing} still failed after ${plural(latest.fixRound ?? 1, 'fix round')}. Review it carefully: push and pull request ask you to confirm.`
                : `${failing} failed. Request changes to have Claude fix it, or fix it yourself and run the checks again.`}
          </p>
        ) : null}
        <CheckList checks={latest.checks} />
      </section>

      {project?.checksAutoFix && configured ? (
        <p className="text-xs text-subtle-foreground">
          Auto-fix is on: failing output goes back to Claude, up to {plural(project.checksMaxFixRounds, 'round')}, without turning tests or lint
          rules off.
        </p>
      ) : null}

      {earlier.length ? (
        <section aria-label="Earlier rounds" className="flex flex-col gap-2">
          <h3 className="eyebrow font-medium text-subtle-foreground">Earlier</h3>
          {earlier.map((round) => (
            <EarlierRound key={round.runId} round={round} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function CheckList({ checks }: { checks: RunCheckDto[] }) {
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-background/40">
      {checks.map((check) => (
        // A check that just failed opens: the row remounts when its status changes.
        <CheckRow key={`${check.id}-${check.status}`} check={check} />
      ))}
    </ul>
  );
}

function CheckRow({ check }: { check: RunCheckDto }) {
  const [open, setOpen] = React.useState(isCheckFailure(check.status));
  const id = React.useId();
  const hasOutput = Boolean(check.output?.trim());
  return (
    <li>
      <button
        type="button"
        aria-expanded={hasOutput ? open : undefined}
        aria-controls={hasOutput ? id : undefined}
        disabled={!hasOutput}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none enabled:hover:bg-fill focus-visible:bg-fill"
      >
        <CheckStatusChip status={check.status} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-foreground">{check.name}</span>
          <code className="truncate font-mono text-[11.5px] text-muted-foreground" title={check.command}>
            {check.command}
          </code>
        </span>
        {check.durationMs !== null ? <span className="shrink-0 font-mono text-[11px] text-subtle-foreground">{formatDuration(check.durationMs)}</span> : null}
        {hasOutput ? (
          <ArrowRight2 aria-hidden className={cn('size-3.5 shrink-0 text-subtle-foreground transition-transform', open && 'rotate-90')} />
        ) : null}
      </button>
      {hasOutput && open ? (
        <pre
          id={id}
          className="mx-3 mb-3 max-h-72 overflow-auto rounded-md border bg-fill-faint px-3 py-2 font-mono text-[11.5px] leading-5 whitespace-pre-wrap text-muted-foreground scrollbar-thin [overflow-wrap:anywhere]"
        >
          {check.output}
        </pre>
      ) : null}
    </li>
  );
}

function EarlierRound({ round }: { round: RunChecksDto }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const passed = round.checks.filter((c) => c.status === 'PASSED').length;
  return (
    <div className="rounded-xl border bg-fill-faint">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] outline-none hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowRight2 aria-hidden className={cn('size-3.5 shrink-0 text-subtle-foreground transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1 truncate text-foreground">{roundLabel(round)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {passed}/{round.checks.length} passed
        </span>
        <span
          className={cn(
            'shrink-0 text-xs font-medium',
            round.status === 'PASSED' ? 'text-success-muted' : round.status === 'FAILED' ? 'text-danger-muted' : 'text-muted-foreground',
          )}
        >
          {HEADLINE[round.status].title.replace('…', '')}
        </span>
      </button>
      {open ? (
        <div id={id} className="px-3 pb-3">
          <CheckList checks={round.checks} />
        </div>
      ) : null}
    </div>
  );
}

/** The card's latest checks failed: push and pull request ask "push anyway" each time. */
export const checksFailing = (card: CardDto) => card.checks?.status === 'FAILED';

/** Git tab, checks failing: the confirmation push and pull request need, like the high-risk one. */
export function ChecksFailingCheck({ card, checked, onChange }: { card: CardDto; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = React.useId();
  if (!checksFailing(card) || !card.checks) return null;
  return (
    <div className="flex gap-2.5 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2.5 text-[13px]">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-danger" />
      <label htmlFor={id} className="leading-relaxed text-danger-muted">
        The checks are failing ({failingNames(card.checks.checks)}). I looked at them and want to continue anyway.
      </label>
    </div>
  );
}
