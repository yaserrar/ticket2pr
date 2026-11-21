'use client';

import Link from 'next/link';
import { ExportSquare, Refresh, Timer1, Trello, Warning2 } from 'iconsax-react';
import { Kbd } from '~/components/shared/kbd';
import { RelativeTime } from '~/components/shared/relative-time';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { formatInterval } from '~/lib/format';
import { cn } from '~/lib/utils';
import type { ProjectDto } from '~/types/project';
import { RepoChip } from './repo-chip';

/**
 * Board header (spec §11.3): project and Trello source on the left; sync
 * status ("Synced 2 min ago"), polling interval, the repository chip, time
 * and usage, and Refresh on the right.
 */
export function BoardToolbar({
  project,
  syncing,
  pollIntervalSec,
  onRefresh,
}: {
  project: ProjectDto;
  syncing: boolean;
  pollIntervalSec?: number;
  onRefresh: () => void;
}) {
  const failed = Boolean(project.lastSyncError) && !syncing;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-5 pb-4 sm:px-5">
      <div className="min-w-0">
        <h1 className="truncate text-xl tracking-tight">{project.name}</h1>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <Trello className="size-4 shrink-0 text-info" aria-hidden />
          {project.trelloBoardUrl ? (
            <a
              href={project.trelloBoardUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-w-0 items-center gap-1 truncate underline-offset-4 hover:text-foreground hover:underline"
            >
              {project.trelloBoardName}
              <ExportSquare className="size-3 shrink-0" aria-hidden />
            </a>
          ) : (
            <span className="truncate">{project.trelloBoardName}</span>
          )}
          <span aria-hidden className="text-subtle-foreground">›</span>
          <span className="truncate">{project.trelloSourceListName}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
          {syncing ? (
            <>
              <Spinner className="size-3" />
              <span>Syncing with Trello…</span>
            </>
          ) : failed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-1.5 text-danger-muted">
                  <Warning2 className="size-3.5" />
                  Sync failed
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{project.lastSyncError}</TooltipContent>
            </Tooltip>
          ) : project.lastSyncedAt ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              <span>
                Synced <RelativeTime date={project.lastSyncedAt} />
              </span>
            </span>
          ) : (
            <span>Not synced yet</span>
          )}
          {pollIntervalSec ? (
            <span className="hidden text-subtle-foreground md:inline">· auto every {formatInterval(pollIntervalSec)}</span>
          ) : null}
        </div>
        <RepoChip project={project} />
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Phones reach it from the project menu and ⌘K: the toolbar stays on one line. */}
            <Button variant="outline" size="icon-sm" asChild className="hidden sm:inline-flex">
              <Link href={`/projects/${project.id}/usage`} aria-label="Time and usage">
                <Timer1 className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Time and usage</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={syncing} className={cn('gap-2 pr-1.5')}>
          <Refresh className={cn('size-4', syncing && 'animate-spin motion-reduce:animate-none')} />
          Refresh
          <Kbd>R</Kbd>
        </Button>
      </div>
    </div>
  );
}

/** Callout under the toolbar when the last sync failed, with the fix. */
export function SyncErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const credentials = /key or token|token has no access|Connect Trello/i.test(message);
  return (
    <div role="alert" className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-danger/25 bg-danger-subtle px-3 py-2.5 text-[13px] text-danger-muted sm:mx-5">
      <Warning2 className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">Last sync failed. {message}</span>
      {credentials ? (
        <Button size="xs" variant="outline" asChild>
          <Link href="/settings">Open settings</Link>
        </Button>
      ) : null}
      <Button size="xs" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
