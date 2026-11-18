'use client';

import * as React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { StatusDot } from '~/components/cards/status-dot';
import { STATUS_META } from '~/constants/statuses';
import { cn } from '~/lib/utils';
import type { CardStatus } from '~/schemas/common';
import type { CardDto } from '~/types/card';
import { SortableCardTile } from './sortable-card-tile';

/** One Kanban column: mono header with count, a faint panel that is also the drop zone. */
export function BoardColumn({
  status,
  cards,
  selectedId,
  onOpen,
  empty,
  hint,
}: {
  status: CardStatus;
  cards: CardDto[];
  selectedId: string | null;
  onOpen: (cardId: string) => void;
  /** Overrides the default empty text (the NEW column explains how to add cards). */
  empty?: React.ReactNode;
  /** Shown while dragging over the column (what dropping will do). */
  hint?: string | null;
}) {
  const meta = STATUS_META[status];
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { type: 'column' } });
  const ids = React.useMemo(() => cards.map((c) => c.id), [cards]);

  return (
    <section aria-label={meta.label} className="flex w-[300px] shrink-0 flex-col xl:w-auto xl:min-w-[220px] xl:flex-1">
      <header className="flex h-9 items-center gap-2 px-1.5">
        <StatusDot status={status} />
        <h2 className="eyebrow font-medium text-muted-foreground">{meta.label}</h2>
        <span className="font-mono text-[11px] text-subtle-foreground">{cards.length}</span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border bg-fill-faint p-2 transition-[border-color,background-color] duration-150 scrollbar-thin',
          isOver && 'border-brand-border bg-brand-subtle/40',
        )}
      >
        <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCardTile key={card.id} card={card} status={status} selected={card.id === selectedId} onOpen={onOpen} />
          ))}
        </SortableContext>
        {!cards.length ? (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-subtle-foreground">
            {empty ?? meta.empty}
          </div>
        ) : null}
        {isOver && hint ? <p className="px-2 pt-1 text-center text-xs text-brand-muted">{hint}</p> : null}
      </div>
    </section>
  );
}
