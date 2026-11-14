import { STATUS_META } from '~/constants/statuses';
import { cn } from '~/lib/utils';
import type { CardStatus } from '~/schemas/common';

const TONE_DOT = {
  neutral: 'bg-subtle-foreground',
  brand: 'bg-brand shadow-[0_0_10px_0] shadow-brand/60',
  warning: 'bg-warning',
  success: 'bg-success',
} as const;

export function StatusDot({ status, className }: { status: CardStatus; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', TONE_DOT[STATUS_META[status].tone], className)} />;
}

export function StatusPill({ status }: { status: CardStatus }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-fill px-2.5 text-xs font-medium text-foreground">
      <StatusDot status={status} className="size-1.5" />
      {STATUS_META[status].label}
    </span>
  );
}
