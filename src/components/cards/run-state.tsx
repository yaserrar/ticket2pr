import { Clock, CloseCircle, Danger, TickCircle, Warning2 } from 'iconsax-react';
import { cn } from '~/lib/utils';
import type { CardDto } from '~/types/card';
import type { RunStatus } from '~/types/run';

/** 1 → "1st", 2 → "2nd", 11 → "11th". */
export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export const RUN_STATUS_META: Record<RunStatus, { label: string; tone: 'brand' | 'muted' | 'success' | 'danger' | 'warning' }> = {
  QUEUED: { label: 'Queued', tone: 'muted' },
  RUNNING: { label: 'Running', tone: 'brand' },
  SUCCEEDED: { label: 'Succeeded', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Stopped', tone: 'warning' },
  INTERRUPTED: { label: 'Interrupted', tone: 'danger' },
};

/** Run state on a board card (spec §9.3): running, queued (2nd), failed / stopped / interrupted, PR opened. */
export function CardRunState({ card, className }: { card: CardDto; className?: string }) {
  const run = card.activeRun;
  if (run?.status === 'RUNNING') {
    return (
      <span className={cn('flex items-center gap-2 text-[11.5px] font-medium', className)}>
        <span aria-hidden className="dot-running size-1.5 rounded-full" />
        <span className="text-shimmer">Agent working…</span>
      </span>
    );
  }
  if (run?.status === 'QUEUED') {
    return (
      <span className={cn('flex items-center gap-1.5 text-[11.5px] text-muted-foreground', className)}>
        <Clock className="size-3.5" aria-hidden />
        Queued{run.queuePosition ? ` (${ordinal(run.queuePosition)})` : ''}
      </span>
    );
  }
  const last = card.lastRun;
  if (card.status === 'IN_PROGRESS' && last && ['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(last.status)) {
    const meta = RUN_STATUS_META[last.status];
    const Icon = last.status === 'CANCELLED' ? CloseCircle : last.status === 'INTERRUPTED' ? Warning2 : Danger;
    return (
      <span
        className={cn(
          'flex items-center gap-1.5 text-[11.5px] font-medium',
          last.status === 'CANCELLED' ? 'text-warning-muted' : 'text-danger-muted',
          className,
        )}
        title={last.error ?? undefined}
      >
        <Icon className="size-3.5" aria-hidden />
        {meta.label} · open to retry
      </span>
    );
  }
  if (card.prUrl) {
    return (
      <span className={cn('flex items-center gap-1.5 text-[11.5px] font-medium text-success-muted', className)}>
        <TickCircle className="size-3.5" aria-hidden />
        Pull request opened
      </span>
    );
  }
  return null;
}

const TONE_CLASS = {
  brand: 'border-brand-border bg-brand-subtle text-brand-muted',
  muted: 'border-border-strong bg-fill text-muted-foreground',
  success: 'border-success/30 bg-success-subtle text-success-muted',
  danger: 'border-danger/30 bg-danger-subtle text-danger-muted',
  warning: 'border-warning/30 bg-warning-subtle text-warning-muted',
} as const;

export function RunStatusPill({ status, className }: { status: RunStatus; className?: string }) {
  const meta = RUN_STATUS_META[status];
  return (
    <span className={cn('inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium', TONE_CLASS[meta.tone], className)}>
      {status === 'RUNNING' ? <span aria-hidden className="dot-running size-1.5 rounded-full" /> : null}
      {meta.label}
    </span>
  );
}
