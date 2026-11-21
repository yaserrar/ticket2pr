'use client';

import * as React from 'react';
import { ExportSquare, TaskSquare, TextalignLeft, Timer1 } from 'iconsax-react';
import { CardBadges } from '~/components/cards/card-badges';
import { LabelList } from '~/components/cards/label-chip';
import { CardRunState } from '~/components/cards/run-state';
import { cn } from '~/lib/utils';
import { formatDuration, plural } from '~/lib/format';
import { formatCost, formatTokens } from '~/lib/usage';
import type { CardDto } from '~/types/card';

/**
 * Board card (spec §11.3): short link, title, labels, run state, then
 * checklist progress, a description hint, time and usage, and badges.
 * Presentational: dragging and opening are wired by <SortableCardTile/>.
 */
export type CardTileProps = {
  card: CardDto;
  selected?: boolean;
  /** The source slot while the card is being dragged. */
  placeholder?: boolean;
  /** Rendered in the drag overlay (lifted). */
  overlay?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;

export const CardTile = React.forwardRef<HTMLDivElement, CardTileProps>(function CardTile(
  { card, selected, placeholder, overlay, className, ...rest },
  ref,
) {
  const { done, total } = card.checklistProgress;
  const usage = card.usage && (card.usage.durationMs > 0 || card.usage.tokens > 0) ? card.usage : null;
  const hasFooter = total > 0 || card.description.trim().length > 0 || Boolean(usage);
  const running = card.activeRun?.status === 'RUNNING';

  return (
    <div
      ref={ref}
      data-card-id={card.id}
      data-status={card.status}
      className={cn(
        'group/card relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-fill p-3 text-left outline-none select-none',
        'transition-[background-color,border-color,box-shadow,opacity] duration-150',
        'hover:border-border-strong hover:bg-fill-raised focus-visible:ring-3 focus-visible:ring-ring/50',
        running && 'border-brand-border',
        selected && 'glow-brand border-brand-border bg-fill-raised',
        card.removedFromTrello && 'opacity-60',
        placeholder && 'border-dashed bg-transparent opacity-30 shadow-none',
        overlay && 'cursor-grabbing border-border-strong bg-surface-raised shadow-xl',
        className,
      )}
      {...rest}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] tracking-wide text-subtle-foreground">{card.shortLink}</span>
        <a
          href={card.trelloUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Open “${card.title}” in Trello`}
          className="-m-1 rounded-md p-1 text-subtle-foreground opacity-0 transition-opacity outline-none group-hover/card:opacity-100 group-focus-within/card:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 [@media(hover:none)]:opacity-100"
        >
          <ExportSquare className="size-3.5" />
        </a>
      </div>

      <p className="line-clamp-3 text-[13.5px] leading-[1.4] font-medium text-foreground [overflow-wrap:anywhere]">{card.title}</p>

      <LabelList labels={card.labels} max={4} />

      <CardRunState card={card} />

      {hasFooter ? (
        <div className="flex items-center gap-3 text-[11px] text-subtle-foreground">
          {card.description.trim() ? <TextalignLeft className="size-3.5" aria-label="Has a description" /> : null}
          {total > 0 ? (
            <span
              className={cn('inline-flex items-center gap-1 font-mono', done === total && 'text-success-muted')}
              aria-label={`Checklist ${done} of ${total} done`}
            >
              <TaskSquare className="size-3.5" aria-hidden />
              {done}/{total}
            </span>
          ) : null}
          {usage ? (
            <span
              className="ml-auto inline-flex min-w-0 items-center gap-1 font-mono"
              title={`${plural(usage.runs, 'run')} · ${formatDuration(usage.durationMs)} · ${formatTokens(usage.tokens)} tokens · ≈ ${formatCost(usage.costUsd)} API-equivalent (reported by Claude Code)`}
            >
              <Timer1 className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {formatDuration(usage.durationMs)} · ≈{formatCost(usage.costUsd)}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <CardBadges card={card} />
    </div>
  );
});
