'use client';

import * as React from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { motion, useReducedMotion } from 'motion/react';
import { STATUS_META } from '~/constants/statuses';
import { planMove, positionBetween } from '~/lib/workflow';
import { cardScopeGate } from '~/lib/scope-card';
import { CARD_STATUSES, type CardStatus } from '~/schemas/common';
import type { BoardDto, CardDto } from '~/types/card';
import type { ProjectDto } from '~/types/project';
import { BoardColumn } from './board-column';
import { CardTile } from './card-tile';
import { useCardMover } from './use-card-mover';

type Items = Record<CardStatus, string[]>;

/** What dropping a card on a column will do, shown while hovering it. */
function dropHint(card: CardDto, to: CardStatus, project: ProjectDto): string | null {
  const sharedBranch = project.workMode === 'SHARED_BRANCH';
  const plan = planMove({
    from: card.status,
    to,
    hasActiveRun: Boolean(card.activeRun),
    hasWork: Boolean(card.branchName || card.hasWorktree),
    prOpened: Boolean(card.prUrl),
    repoConfigured: Boolean(project.repoPath),
    sharedBranch,
  });
  switch (plan.kind) {
    case 'start': {
      const gate = cardScopeGate(card, project);
      if (gate.kind === 'check' || gate.kind === 'wait') return 'Drop to check the scope first: it starts if it’s in scope';
      if (gate.kind === 'confirm') return `${gate.title}: drop to decide`;
      return sharedBranch ? `Drop to start a run on ${project.sharedBranch || project.baseBranch}` : 'Drop to create a branch and start a run';
    }
    case 'out-of-scope':
      return 'Drop to set it aside until the client agrees to new work';
    case 'back-in-scope':
      return 'Drop when the client agreed to the new work';
    case 'request-changes':
      return 'Drop to request changes';
    case 'discard':
      return sharedBranch ? 'Drop to discard the uncommitted changes' : 'Drop to discard the work';
    case 'invalid':
      return plan.message;
    default:
      return null;
  }
}

/** The side column for out-of-scope cards shows when the project checks scope, or holds cards. */
export function visibleStatuses(board: BoardDto): CardStatus[] {
  return CARD_STATUSES.filter((s) => s !== 'OUT_OF_SCOPE' || board.project.scopeCheck || board.columns.OUT_OF_SCOPE.length > 0);
}

/**
 * The Kanban canvas (spec §11.3): four columns (five with Out of scope), drag and drop across and
 * within them with a lifted overlay, keyboard dragging and screen-reader
 * announcements. Every drop goes through useCardMover (workflow rules).
 */
export function KanbanBoard({
  board,
  selectedId,
  onOpen,
  onRequestChanges,
  onOutOfScope,
  emptyNew,
}: {
  board: BoardDto;
  selectedId: string | null;
  onOpen: (cardId: string) => void;
  onRequestChanges: (card: CardDto) => void;
  onOutOfScope: (card: CardDto) => void;
  emptyNew?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const mover = useCardMover(board.project, onRequestChanges, onOutOfScope);
  const statuses = visibleStatuses(board);

  const derived = React.useMemo<Items>(
    () => Object.fromEntries(CARD_STATUSES.map((s) => [s, board.columns[s].map((c) => c.id)])) as Items,
    [board],
  );
  const cardMap = React.useMemo(() => new Map(CARD_STATUSES.flatMap((s) => board.columns[s]).map((c) => [c.id, c])), [board]);

  const [dragItems, setDragItems] = React.useState<Items | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overColumn, setOverColumn] = React.useState<CardStatus | null>(null);
  const items = dragItems ?? derived;
  const lastOverId = React.useRef<UniqueIdentifier | null>(null);

  // After a drop, keep the local order until the board data reflects it (no flicker).
  const [settledBoard, setSettledBoard] = React.useState(board);
  if (settledBoard !== board) {
    setSettledBoard(board);
    if (dragItems && !activeId) setDragItems(null);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const findColumn = React.useCallback(
    (id: UniqueIdentifier | null | undefined): CardStatus | undefined => {
      if (id == null) return undefined;
      const key = String(id);
      if ((CARD_STATUSES as readonly string[]).includes(key)) return key as CardStatus;
      return CARD_STATUSES.find((s) => items[s].includes(key));
    },
    [items],
  );

  const collisionDetection: CollisionDetection = React.useCallback(
    (args) => {
      const pointer = pointerWithin(args);
      const intersections = pointer.length > 0 ? pointer : rectIntersection(args);
      let overId = getFirstCollision(intersections, 'id');
      if (overId != null) {
        const key = String(overId) as CardStatus;
        if (items[key]?.length) {
          overId =
            closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter((c) => c.id !== overId && items[key].includes(String(c.id))),
            })[0]?.id ?? overId;
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [items],
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setDragItems(derived);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const from = findColumn(active.id);
    const to = findColumn(over?.id);
    setOverColumn(to ?? null);
    if (!from || !to || from === to || !over) return;
    setDragItems((prev) => {
      const current = prev ?? derived;
      const toItems = [...current[to]];
      const overIndex = toItems.indexOf(String(over.id));
      const below = active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      toItems.splice(overIndex >= 0 ? overIndex + (below ? 1 : 0) : toItems.length, 0, String(active.id));
      return { ...current, [from]: current[from].filter((id) => id !== String(active.id)), [to]: toItems };
    });
  };

  const finish = () => {
    setActiveId(null);
    setOverColumn(null);
    lastOverId.current = null;
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const card = cardMap.get(id);
    const to = findColumn(over?.id);
    finish();
    if (!card || !to) return setDragItems(null);

    let ordered = items[to];
    if (over && String(over.id) !== id && ordered.includes(String(over.id)) && ordered.includes(id)) {
      ordered = arrayMove(ordered, ordered.indexOf(id), ordered.indexOf(String(over.id)));
    }
    if (!ordered.includes(id)) ordered = [...ordered, id];
    setDragItems((prev) => ({ ...(prev ?? derived), [to]: ordered }));

    const index = ordered.indexOf(id);
    const before = index > 0 ? cardMap.get(ordered[index - 1]!) : undefined;
    const after = cardMap.get(ordered[index + 1] ?? '');
    const position = positionBetween(before?.position, after?.position);
    const moved = await mover(card, to, position);
    if (!moved) setDragItems(null);
  };

  const title = (id: UniqueIdentifier) => cardMap.get(String(id))?.title ?? 'Card';
  const columnName = (id: UniqueIdentifier | undefined) => {
    const status = findColumn(id);
    return status ? STATUS_META[status].label : 'the board';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up “${title(active.id)}”.`,
    onDragOver: ({ active, over }) => (over ? `“${title(active.id)}” is over ${columnName(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `“${title(active.id)}” dropped in ${columnName(over.id)}.` : 'Dropped outside the board.'),
    onDragCancel: ({ active }) => `Moving “${title(active.id)}” was cancelled.`,
  };

  const activeCard = activeId ? cardMap.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => {
        finish();
        setDragItems(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To move a card, press Space, use the arrow keys, then press Space again to drop it. Escape cancels. Enter opens the card.',
        },
      }}
    >
      <div className="flex h-full min-w-max gap-3 px-4 pb-4 sm:px-5 xl:min-w-0">
        {statuses.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            cards={items[status].map((id) => cardMap.get(id)).filter((c): c is CardDto => Boolean(c))}
            selectedId={selectedId}
            onOpen={onOpen}
            empty={status === 'NEW' ? emptyNew : undefined}
            hint={activeCard && overColumn === status && activeCard.status !== status ? dropHint(activeCard, status, board.project) : null}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={reduce ? null : { duration: 200, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.05)' }}>
        {activeCard ? (
          <motion.div
            initial={{ rotate: 0, scale: 1 }}
            animate={{ rotate: reduce ? 0 : 2, scale: reduce ? 1 : 1.03 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <CardTile card={activeCard} overlay />
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
