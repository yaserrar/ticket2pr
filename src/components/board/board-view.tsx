'use client';

import * as React from 'react';
import Link from 'next/link';
import { parseAsString, useQueryState } from 'nuqs';
import { InfoCircle, Warning2 } from 'iconsax-react';
import { CardSheet } from '~/components/cards/card-sheet';
import { RequestChangesDialog } from '~/components/cards/request-changes';
import { OutOfScopeDialog } from '~/components/cards/out-of-scope-dialog';
import { EmptyState } from '~/components/shared/empty-state';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { LAST_PROJECT_COOKIE } from '~/constants/site';
import { useAutoSync, useBoard } from '~/hooks/projects';
import { useSettings } from '~/hooks/settings';
import { useClaudeStatus } from '~/hooks/claude';
import { useHotkey } from '~/hooks/use-hotkey';
import { getErrorMessage, isApiError } from '~/lib/api-errors';
import { CARD_STATUSES } from '~/schemas/common';
import type { CardDto } from '~/types/card';
import { KanbanBoard } from './kanban-board';
import { BoardToolbar, SyncErrorBanner } from './board-toolbar';
import { useRefreshBoard } from './use-refresh-board';
import { UsageBanner } from './usage-banner';

/**
 * The project board (spec §11.3): toolbar with sync status, the drag and drop
 * Kanban, and the card panel driven by `?card=` (shareable, survives reloads).
 * Syncs with Trello on open, then polls every `pollIntervalSec`.
 */
export function BoardView({ projectId }: { projectId: string }) {
  const board = useBoard(projectId);
  const settings = useSettings();
  const claude = useClaudeStatus();
  const autoSync = useAutoSync(projectId, settings.data?.pollIntervalSec);
  const { refresh, isPending: refreshing } = useRefreshBoard(projectId);
  const [cardId, setCardId] = useQueryState('card', parseAsString.withOptions({ history: 'push' }));
  const [requestChangesFor, setRequestChangesFor] = React.useState<CardDto | null>(null);
  const [outOfScopeFor, setOutOfScopeFor] = React.useState<CardDto | null>(null);
  const [, setTab] = useQueryState('tab');
  // Each card opens on the tab that suits its state.
  const openCard = React.useCallback(
    (id: string) => {
      void setCardId(id);
      void setTab(null);
    },
    [setCardId, setTab],
  );

  useHotkey('r', refresh);

  React.useEffect(() => {
    document.cookie = `${LAST_PROJECT_COOKIE}=${projectId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [projectId]);

  if (board.isPending) return <BoardSkeleton />;

  if (board.error || !board.data) {
    const missing = isApiError(board.error, 'NOT_FOUND');
    return (
      <div className="p-6">
        <EmptyState
          icon={Warning2}
          title={missing ? 'This project no longer exists' : 'The board could not be loaded'}
          description={missing ? 'It may have been deleted.' : getErrorMessage(board.error)}
          action={
            missing ? (
              <Button asChild>
                <Link href="/">Back to projects</Link>
              </Button>
            ) : (
              <Button onClick={() => board.refetch()}>Retry</Button>
            )
          }
        />
      </div>
    );
  }

  const { project, columns } = board.data;

  const syncing = refreshing || autoSync.isFetching;
  const total = CARD_STATUSES.reduce((n, s) => n + columns[s].length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BoardToolbar
        project={project}
        syncing={syncing}
        pollIntervalSec={settings.data?.pollIntervalSec}
        onRefresh={refresh}
      />
      {project.lastSyncError && !syncing ? <SyncErrorBanner message={project.lastSyncError} onRetry={refresh} /> : null}

      {!project.repoPath ? <RepoMissingBanner projectId={project.id} /> : null}
      {project.repoPath && claude.data && !claude.data.ok && claude.data.runner === 'claude' ? <ClaudeMissingBanner /> : null}
      <UsageBanner />

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin">
        <KanbanBoard
          board={board.data}
          selectedId={cardId}
          onOpen={openCard}
          onRequestChanges={setRequestChangesFor}
          onOutOfScope={setOutOfScopeFor}
          emptyNew={
            total === 0 ? (
              <span className="leading-relaxed">
                No cards yet. Add a card to <span className="text-foreground">{project.trelloSourceListName}</span> on Trello,
                then press Refresh.
              </span>
            ) : undefined
          }
        />
      </div>

      <RequestChangesDialog card={requestChangesFor} onOpenChange={(open) => !open && setRequestChangesFor(null)} />
      <OutOfScopeDialog card={outOfScopeFor} onOpenChange={(open) => !open && setOutOfScopeFor(null)} />
      <CardSheet
        projectId={projectId}
        cardId={cardId}
        sourceListName={project.trelloSourceListName}
        onClose={() => {
          void setCardId(null);
          void setTab(null);
        }}
      />
    </div>
  );
}

/** Cards can't start until Claude Code is signed in (spec §9.2). */
function ClaudeMissingBanner() {
  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/25 bg-warning-subtle px-3 py-2.5 text-[13px] text-warning-muted sm:mx-5">
      <Warning2 className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">Claude Code is not signed in, so cards can’t start yet. Run claude, then /login, in a terminal.</span>
      <Button size="xs" variant="outline" asChild>
        <Link href="/settings">Open settings</Link>
      </Button>
    </div>
  );
}

/** Cards can't start without a repository: say so once, with the fix. */
function RepoMissingBanner({ projectId }: { projectId: string }) {
  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-info/25 bg-info-subtle px-3 py-2.5 text-[13px] text-info-muted sm:mx-5">
      <InfoCircle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">Add the local repository to start work on cards: each card gets its own branch.</span>
      <Button size="xs" variant="outline" asChild>
        <Link href={`/projects/${projectId}/settings`}>Add repository</Link>
      </Button>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading board">
      <div className="flex items-end justify-between px-4 pt-5 pb-4 sm:px-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-4 pb-4 sm:px-5">
        {CARD_STATUSES.filter((s) => s !== 'OUT_OF_SCOPE').map((s, i) => (
          <div key={s} className="flex w-[300px] shrink-0 flex-col gap-2 xl:w-auto xl:flex-1">
            <Skeleton className="h-4 w-24" />
            <div className="flex flex-1 flex-col gap-2 rounded-2xl border bg-fill-faint p-2">
              {Array.from({ length: i === 0 ? 3 : 1 }).map((_, j) => (
                <Skeleton key={j} className="h-24 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
