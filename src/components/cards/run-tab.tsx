'use client';

import * as React from 'react';
import { Repeat, StopCircle } from 'iconsax-react';
import { toast } from 'sonner';
import { confirm } from '~/components/shared/confirm-dialog';
import { EmptyState } from '~/components/shared/empty-state';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { Switch } from '~/components/ui/switch';
import { useCardRuns, useCreateRun } from '~/hooks/cards';
import { useCancelRun, useRunStream } from '~/hooks/runs';
import { formatDuration, formatRelative } from '~/lib/format';
import { isActiveRunStatus } from '~/lib/workflow';
import type { CardDto } from '~/types/card';
import type { RunDto } from '~/types/run';
import { RequestChangesForm } from './request-changes';
import { RunLog } from './run-log';
import { RUN_STATUS_META, RunStatusPill } from './run-state';
import { runKindLabel, UsagePanel } from './usage-panel';

/** Run tab (spec §11.4): live log, Stop, run history, Retry, Request changes. */
export function RunTab({ card }: { card: CardDto }) {
  const runs = useCardRuns(card.id);
  const [picked, setPicked] = React.useState<string | null>(null);
  const list = runs.data ?? [];
  // Follow the newest run unless the user picked an older one.
  const selected = list.find((r) => r.id === picked) ?? list[0] ?? null;
  const live = Boolean(selected && isActiveRunStatus(selected.status));
  const stream = useRunStream(selected?.id ?? null, { projectId: card.projectId, cardId: card.id });
  const cancel = useCancelRun(card.projectId, card.id);

  // A new run (retry, follow-up) appears: show it.
  const newest = list[0]?.id;
  const [lastNewest, setLastNewest] = React.useState(newest);
  if (newest !== lastNewest) {
    setLastNewest(newest);
    setPicked(null);
  }

  if (runs.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  const canRetry = card.status === 'IN_PROGRESS' && !card.activeRun;

  return (
    <div className="flex flex-col gap-5">
      <UsagePanel totals={card.usage} runs={list} />
      {selected ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selected.id} onValueChange={setPicked}>
              <SelectTrigger size="sm" className="min-w-0 max-w-full flex-1 sm:max-w-80" aria-label="Run">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {list.map((run, i) => (
                  <SelectItem key={run.id} value={run.id}>
                    {runLabel(run, list.length - i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RunStatusPill status={selected.status} />
            {live ? (
              <Button
                size="sm"
                variant="destructive"
                className="ml-auto"
                loading={cancel.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Stop this run?',
                    description: 'The agent stops now. Changes it already made stay in the worktree.',
                    confirmLabel: 'Stop run',
                    destructive: true,
                  });
                  if (ok)
                    cancel.mutate(selected.id, {
                      onSuccess: (run) =>
                        run.status === 'RUNNING'
                          ? toast.info('Stopping the run', { description: 'It ends as soon as its processes have exited.' })
                          : toast.success('Run stopped'),
                    });
                }}
              >
                <StopCircle className="size-4" />
                Stop
              </Button>
            ) : null}
          </div>
          {selected.status === 'QUEUED' ? (
            <p className="text-[13px] text-muted-foreground">
              Waiting for a free slot. Runs start in order; change how many run at once in Settings.
            </p>
          ) : null}
          <RunLog events={stream.events} live={live && !stream.ended} />
        </>
      ) : (
        <EmptyState
          size="sm"
          icon={Repeat}
          title="No runs yet"
          description="Drag the card to In progress to create its branch and start a run."
        />
      )}

      {canRetry && selected ? <RetryPanel card={card} lastStatus={selected.status} /> : null}

      {card.status === 'REVIEW' ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-fill-faint p-4">
          <h3 className="eyebrow font-medium text-subtle-foreground">Request changes</h3>
          <RequestChangesForm card={card} />
        </section>
      ) : null}
    </div>
  );
}

function runLabel(run: RunDto, number: number) {
  const parts = [
    `#${number}`,
    runKindLabel(run),
    RUN_STATUS_META[run.status].label,
    run.durationMs ? formatDuration(run.durationMs) : null,
    formatRelative(run.createdAt),
  ].filter(Boolean);
  return parts.join(' · ');
}

function RetryPanel({ card, lastStatus }: { card: CardDto; lastStatus: RunDto['status'] }) {
  const createRun = useCreateRun(card.projectId, card.id);
  const [reset, setReset] = React.useState(false);
  const failed = ['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(lastStatus);
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-fill-faint p-4">
      <div>
        <h3 className="text-sm font-medium">{failed ? 'Try again' : 'Run again'}</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Starts a new run on the same branch and worktree.</p>
      </div>
      <div className="flex items-center gap-2.5">
        <Switch id={`reset-${card.id}`} checked={reset} onCheckedChange={setReset} />
        <Label htmlFor={`reset-${card.id}`} className="text-[13px] font-normal text-muted-foreground">
          Reset uncommitted changes first
        </Label>
      </div>
      <div>
        <Button
          size="sm"
          loading={createRun.isPending}
          onClick={() =>
            createRun.mutate({ kind: 'INITIAL', resetFirst: reset }, { onSuccess: () => toast.success('Run queued') })
          }
        >
          <Repeat className="size-4" />
          Retry
        </Button>
      </div>
    </section>
  );
}
