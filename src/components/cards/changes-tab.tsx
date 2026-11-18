'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DocumentText1, Refresh, RotateLeft } from 'iconsax-react';
import { toast } from 'sonner';
import { confirm } from '~/components/shared/confirm-dialog';
import { EmptyState } from '~/components/shared/empty-state';
import { ReasonButton } from '~/components/shared/reason-button';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useChanges, useResetChanges } from '~/hooks/cards';
import { getErrorMessage } from '~/lib/api-errors';
import { plural } from '~/lib/format';
import type { CardDto } from '~/types/card';
import { DiffFileView, DiffStat } from './diff-view';
import { RiskPanel } from './risk';
import { useBoard } from '~/hooks/projects';
import { assessRisk, parseRiskPaths } from '~/lib/risk';
import { qk } from '~/lib/query-keys';

/** Changes tab (spec §8.3, §11.4): what the branch changes vs the base, file by file. */
export function ChangesTab({ card }: { card: CardDto }) {
  const running = card.activeRun?.status === 'RUNNING';
  const changes = useChanges(card.id, card.hasWorktree, running);
  const reset = useResetChanges(card.projectId, card.id);
  const board = useBoard(card.projectId);
  const qc = useQueryClient();

  // The risk of the diff on screen (same rules as the server, which stores it when it reads the diff).
  const riskPaths = board.data?.project.riskPaths;
  const risk = React.useMemo(
    () => (changes.data?.files.length ? assessRisk(changes.data.files, parseRiskPaths(riskPaths)) : null),
    [changes.data, riskPaths],
  );
  const riskKey = risk ? JSON.stringify([risk.level, risk.areas]) : null;
  const cardRiskKey = card.risk ? JSON.stringify([card.risk.level, card.risk.areas]) : null;
  React.useEffect(() => {
    // The server stored a new verdict: refresh the board (badge, push confirmation).
    if (riskKey && riskKey !== cardRiskKey) void qc.invalidateQueries({ queryKey: qk.projects.board(card.projectId) });
  }, [riskKey, cardRiskKey, qc, card.projectId]);

  if (!card.hasWorktree) {
    return (
      <EmptyState
        size="sm"
        icon={DocumentText1}
        title="No branch yet"
        description="Drag the card to In progress: Ticket2PR creates its branch and worktree, and changes show here."
      />
    );
  }
  if (changes.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    );
  }
  if (changes.error || !changes.data) {
    return (
      <EmptyState
        size="sm"
        title="Changes could not be read"
        description={getErrorMessage(changes.error)}
        action={<Button size="sm" onClick={() => changes.refetch()}>Retry</Button>}
      />
    );
  }

  const { stats, baseRef } = changes.data;
  const totalLines = stats.additions + stats.deletions;
  // High-risk files first: they deserve the closest look.
  const risky = new Set(risk?.areas.filter((a) => a.level === 'HIGH').flatMap((a) => a.files) ?? []);
  const files = risky.size ? [...changes.data.files].sort((a, b) => Number(risky.has(b.path)) - Number(risky.has(a.path))) : changes.data.files;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {files.length ? (
            <>
              <DiffStat additions={stats.additions} deletions={stats.deletions} /> in {plural(stats.files, 'file')}{' '}
              <span className="text-subtle-foreground">vs {baseRef}</span>
            </>
          ) : (
            <>No changes yet vs {baseRef}</>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => changes.refetch()} disabled={changes.isFetching} aria-label="Refresh changes">
            <Refresh className={changes.isFetching ? 'size-4 animate-spin' : 'size-4'} />
          </Button>
          <ReasonButton
            size="sm"
            variant="outline"
            reason={running ? 'Wait for the run to finish, or stop it first.' : null}
            loading={reset.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: 'Reset uncommitted changes?',
                description: 'Every change not committed yet is thrown away. Commits on the branch are kept.',
                confirmLabel: 'Reset changes',
                destructive: true,
              });
              if (ok) reset.mutate(undefined, { onSuccess: () => toast.success('Uncommitted changes reset') });
            }}
          >
            <RotateLeft className="size-4" />
            Reset changes
          </ReasonButton>
        </div>
      </div>

      {risk ? <RiskPanel risk={{ ...risk, reviewedAt: riskKey === cardRiskKey ? (card.risk?.reviewedAt ?? null) : null }} /> : null}

      {files.length ? (
        <div className="flex flex-col gap-2">
          {files.map((file, i) => (
            <DiffFileView key={file.path} file={file} defaultOpen={totalLines < 600 || i === 0 || risky.has(file.path)} />
          ))}
        </div>
      ) : (
        <EmptyState size="sm" icon={DocumentText1} title="Nothing changed yet" description="Edits made on the branch show here." />
      )}
    </div>
  );
}
