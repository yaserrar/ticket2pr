'use client';

import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CardStatus } from '~/schemas/common';
import type { CardDto } from '~/types/card';
import { CardTile } from './card-tile';

/**
 * A draggable card: pointer, touch and keyboard (Space lifts, arrows move,
 * Space drops). Click or Enter opens the card panel.
 */
export const SortableCardTile = React.memo(function SortableCardTile({
  card,
  status,
  selected,
  onOpen,
}: {
  card: CardDto;
  status: CardStatus;
  selected: boolean;
  onOpen: (cardId: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { status },
  });

  return (
    <CardTile
      ref={setNodeRef}
      card={card}
      selected={selected}
      placeholder={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable card"
      aria-label={`${card.title}. Press Enter to open, Space to move.`}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen(card.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
    />
  );
});
