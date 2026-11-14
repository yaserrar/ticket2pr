import * as React from 'react';
import { trelloLabelColor } from '~/lib/trello-colors';
import { cn } from '~/lib/utils';
import type { CardLabel } from '~/types/card';

/**
 * Trello label. The colour is user data, applied through a CSS variable and
 * mixed with theme tokens so it stays readable. Unnamed labels render as a
 * colour bar, like on Trello.
 */
export function LabelChip({ label, size = 'sm', className }: { label: CardLabel; size?: 'xs' | 'sm'; className?: string }) {
  const style = { '--label': trelloLabelColor(label.color) } as React.CSSProperties;
  if (!label.name) {
    return (
      <span
        style={style}
        aria-label={`${label.color ?? 'no colour'} label`}
        className={cn('inline-block h-1.5 w-8 rounded-full bg-(--label) opacity-80', className)}
      />
    );
  }
  return (
    <span
      style={style}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-[color-mix(in_oklch,var(--label)_28%,transparent)] bg-[color-mix(in_oklch,var(--label)_12%,transparent)] font-medium text-[color-mix(in_oklch,var(--label)_65%,var(--foreground))]',
        size === 'xs' ? 'h-[18px] px-1.5 text-[10.5px]' : 'h-5 px-2 text-[11px]',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--label)" />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/** At most `max` labels, then an overflow counter. */
export function LabelList({
  labels,
  max = 3,
  size = 'xs',
  className,
}: {
  labels: CardLabel[];
  max?: number;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  if (!labels.length) return null;
  const visible = labels.slice(0, max);
  const rest = labels.length - visible.length;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map((l) => (
        <LabelChip key={l.id} label={l} size={size} />
      ))}
      {rest > 0 ? <span className="text-[10.5px] font-medium text-subtle-foreground">+{rest}</span> : null}
    </div>
  );
}
