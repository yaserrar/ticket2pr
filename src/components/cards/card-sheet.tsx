'use client';

import * as React from 'react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { ExportSquare, Trello } from 'iconsax-react';
import { Kbd } from '~/components/shared/kbd';
import { Button } from '~/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '~/components/ui/sheet';
import { Skeleton } from '~/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { findInBoard, useCard } from '~/hooks/cards';
import { useBoard } from '~/hooks/projects';
import { useHotkey } from '~/hooks/use-hotkey';
import type { CardDto } from '~/types/card';
import { ChangesTab } from './changes-tab';
import { ClientTab, clientNeedsAttention } from './client-tab';
import { DetailsTab } from './details-tab';
import { GitTab } from './git-tab';
import { LabelChip } from './label-chip';
import { CardRunState } from './run-state';
import { RunTab } from './run-tab';
import { StatusPill } from './status-dot';

export const TABS = ['details', 'run', 'changes', 'git', 'client'] as const;
type Tab = (typeof TABS)[number];

/** The tab that matters most for where the card is. */
function defaultTab(card: CardDto): Tab {
  if (card.clientRepliedAt || (card.status === 'REVIEW' && card.clientQuestions && !card.waitingSince)) return 'client';
  if (card.status === 'IN_PROGRESS') return 'run';
  if (card.status === 'REVIEW') return 'changes';
  if (card.status === 'DONE' && card.hasWorktree) return 'git';
  return 'details';
}

/**
 * Card panel (spec §11.4): Details · Run · Changes · Git, with a Raycast-style
 * action bar footer. The card comes from the (polled) board, so its state stays
 * live while a run works. `?tab=` keeps the tab in the URL.
 */
export function CardSheet({
  projectId,
  cardId,
  sourceListName,
  onClose,
}: {
  projectId: string;
  cardId: string | null;
  sourceListName: string;
  onClose: () => void;
}) {
  const board = useBoard(projectId);
  const fromBoard = cardId ? findInBoard(board.data, cardId) : undefined;
  const fallback = useCard(projectId, fromBoard ? null : cardId);
  const card = fromBoard ?? fallback.data;
  const open = Boolean(cardId);

  useHotkey('o', () => card && window.open(card.trelloUrl, '_blank', 'noopener'), { enabled: open && Boolean(card), inDialogs: true });

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="window gap-0 p-0 data-[side=right]:w-full sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-2xl sm:data-[side=right]:max-w-[640px]"
      >
        {card ? (
          <CardPanel card={card} sourceListName={sourceListName} />
        ) : (
          <>
            <SheetTitle className="sr-only">Card</SheetTitle>
            <SheetDescription className="sr-only">Card details</SheetDescription>
            {fallback.isPending ? (
              <PanelSkeleton />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">This card could not be loaded. It may have been deleted.</p>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CardPanel({ card, sourceListName }: { card: CardDto; sourceListName: string }) {
  const [tabParam, setTab] = useQueryState('tab', parseAsStringLiteral(TABS));
  const tab = tabParam ?? defaultTab(card);

  return (
    <Tabs value={tab} onValueChange={(v) => void setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex flex-col gap-3 border-b px-5 pt-5 pr-14 pb-4">
        <div className="flex items-center gap-2">
          <Trello className="size-4 text-info" aria-hidden />
          <span className="font-mono text-[11px] tracking-wide text-subtle-foreground">{card.shortLink}</span>
          <StatusPill status={card.status} />
          <CardRunState card={card} className="ml-1" />
        </div>
        <SheetTitle className="text-lg leading-snug font-semibold tracking-tight [overflow-wrap:anywhere]">{card.title}</SheetTitle>
        <SheetDescription className="sr-only">Trello card, agent runs, changes and git actions</SheetDescription>
        {card.labels.length ? (
          <div className="flex flex-wrap gap-1.5">
            {card.labels.map((l) => (
              <LabelChip key={l.id} label={l} />
            ))}
          </div>
        ) : null}
        <TabsList className="mt-1 h-8! w-full justify-start bg-fill sm:w-fit">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="run" className="gap-1.5">
            Run
            {card.activeRun?.status === 'RUNNING' ? <span aria-label="running" className="dot-running size-1.5 rounded-full" /> : null}
          </TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="git">Git</TabsTrigger>
          <TabsTrigger value="client" className="gap-1.5">
            Client
            {clientNeedsAttention(card) ? <span aria-label="needs attention" className="size-1.5 rounded-full bg-warning" /> : null}
          </TabsTrigger>
        </TabsList>
      </div>

      <div data-scroll-root className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
        <TabsContent value="details">
          <DetailsTab card={card} sourceListName={sourceListName} />
        </TabsContent>
        <TabsContent value="run">
          <RunTab card={card} />
        </TabsContent>
        <TabsContent value="changes">
          <ChangesTab card={card} />
        </TabsContent>
        <TabsContent value="git">
          <GitTab card={card} />
        </TabsContent>
        <TabsContent value="client">
          <ClientTab card={card} />
        </TabsContent>
      </div>

      <footer className="flex h-14 shrink-0 items-center justify-between gap-3 border-t bg-fill-faint px-4">
        <Button size="sm" asChild className="gap-2 pr-1.5">
          <a href={card.trelloUrl} target="_blank" rel="noreferrer noopener">
            <ExportSquare className="size-4" />
            Open in Trello
            <Kbd className="border-black/10 bg-black/10 text-primary-foreground/70 shadow-none">O</Kbd>
          </a>
        </Button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Close <Kbd>esc</Kbd>
        </span>
      </footer>
    </Tabs>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-8 w-72" />
      <div className="mt-4 flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}
