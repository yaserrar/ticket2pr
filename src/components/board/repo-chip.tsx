'use client';

import { ArrowCircleDown, Broom, Hierarchy, Refresh2, Warning2 } from 'iconsax-react';
import { toast } from 'sonner';
import { CopyButton } from '~/components/shared/copy-button';
import { ReasonButton } from '~/components/shared/reason-button';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { useBoard, useCleanupDone, usePullRepo, useRefreshRepoStatus, useRepoStatus } from '~/hooks/projects';
import { getErrorMessage } from '~/lib/api-errors';
import { plural } from '~/lib/format';
import { cn } from '~/lib/utils';
import type { ProjectDto } from '~/types/project';

/**
 * The developer's repository folder at a glance: its branch and whether it is
 * behind GitHub, with a safe Pull (fast-forward only) and, for branch-per-card
 * projects, cleanup of Done cards' worktrees.
 */
export function RepoChip({ project }: { project: ProjectDto }) {
  const status = useRepoStatus(project.id, Boolean(project.repoPath));
  const refresh = useRefreshRepoStatus(project.id);
  const pull = usePullRepo(project.id);
  const cleanup = useCleanupDone(project.id);
  const board = useBoard(project.id);

  if (!project.repoPath) return null;
  const repo = status.data;
  const shared = project.workMode === 'SHARED_BRANCH';
  const sharedBranch = project.sharedBranch || project.baseBranch;
  const doneWithWorktree = (board.data?.columns.DONE ?? []).filter((c) => c.hasWorktree).length;
  const wrongBranch = shared && project.sharedInRepo && repo?.branch && repo.branch !== sharedBranch;
  const attention = Boolean(repo && (repo.behind > 0 || wrongBranch));

  const label = !repo
    ? status.isError
      ? 'Repository'
      : null
    : repo.behind > 0
      ? `${repo.branch} · ${repo.behind} behind`
      : `${repo.branch ?? 'detached'}${repo.uncommittedFiles ? ` · ${repo.uncommittedFiles} changed` : ''}`;

  const pullReason = !repo
    ? 'Checking the repository…'
    : !repo.branch
      ? 'The folder is not on a branch.'
      : !repo.hasUpstream
        ? `${repo.branch} doesn't exist on origin.`
        : repo.behind === 0
          ? 'Already up to date.'
          : null;

  const onPull = () =>
    pull.mutate(undefined, {
      onSuccess: (res) => toast.success(res.pulled ? `Pulled ${plural(res.pulled, 'commit')} into ${res.branch}` : `${res.branch} is up to date`),
      onError: (e) => toast.error('Pull failed', { description: getErrorMessage(e) }),
    });

  const onCleanup = () =>
    cleanup.mutate(undefined, {
      onSuccess: (res) => {
        const text = `Removed ${plural(res.cleaned, 'worktree')}${res.deletedBranches ? `, deleted ${plural(res.deletedBranches, 'pushed branch', 'pushed branches')}` : ''}`;
        if (res.skipped.length) toast.warning(text, { description: res.skipped.map((s) => `${s.title}: ${s.reason}`).join('\n') });
        else toast.success(text);
      },
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('max-w-56 gap-2', attention && 'border-warning/30 text-warning-muted')}
          aria-label="Repository status"
        >
          {status.isPending ? <Spinner className="size-3.5" /> : attention ? <Warning2 className="size-4 text-warning" /> : <Hierarchy className="size-4" />}
          <span className="truncate font-mono text-xs">{label ?? (status.isPending ? 'Checking…' : 'Repository')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">Your repository folder</p>
            <p className="truncate font-mono text-xs text-muted-foreground" title={project.repoPath}>
              {project.repoPath}
            </p>
          </div>
          <CopyButton value={project.repoPath} size="icon-xs" label="Copy path" />
        </div>

        {status.isPending ? (
          <div className="flex flex-col gap-2" aria-label="Checking the repository">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : status.isError ? (
          <p className="text-[13px] text-danger-muted">{getErrorMessage(status.error)}</p>
        ) : repo ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">Branch</dt>
            <dd className="font-mono text-xs text-foreground">{repo.branch ?? 'detached HEAD'}</dd>
            <dt className="text-muted-foreground">Origin</dt>
            <dd className={cn('text-foreground', repo.behind > 0 && 'text-warning-muted')}>
              {!repo.hasUpstream
                ? 'Not on origin'
                : repo.behind || repo.ahead
                  ? [repo.behind ? `${repo.behind} to pull` : null, repo.ahead ? `${repo.ahead} not pushed` : null].filter(Boolean).join(', ')
                  : 'Up to date'}
            </dd>
            <dt className="text-muted-foreground">Local</dt>
            <dd className="text-foreground">{repo.uncommittedFiles ? `${plural(repo.uncommittedFiles, 'file')} not committed` : 'Clean'}</dd>
          </dl>
        ) : null}

        {repo?.fetchError ? <p className="text-xs text-warning-muted">Couldn’t reach origin: {repo.fetchError}</p> : null}
        {wrongBranch ? (
          <p className="text-xs text-warning-muted">
            Cards in this project work on <span className="font-mono">{sharedBranch}</span>. Run{' '}
            <span className="font-mono text-foreground">git switch {sharedBranch}</span> in this folder before starting one.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <ReasonButton size="sm" loading={pull.isPending} reason={pullReason} onClick={onPull}>
            <ArrowCircleDown className="size-4" />
            Pull
          </ReasonButton>
          <Button size="sm" variant="ghost" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            <Refresh2 className="size-4" />
            Check again
          </Button>
        </div>
        <p className="text-xs text-subtle-foreground">Pull only fast-forwards. It never merges, rebases or touches files you changed.</p>

        {!shared || doneWithWorktree ? (
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {doneWithWorktree
                ? `${plural(doneWithWorktree, 'Done card')} still ${doneWithWorktree === 1 ? 'has its' : 'have their'} worktree. Cleaning up removes the folders and deletes local branches that are already pushed.`
                : 'No Done cards to clean up.'}
            </p>
            <div>
              <ReasonButton
                size="sm"
                variant="outline"
                loading={cleanup.isPending}
                reason={doneWithWorktree ? null : 'Nothing to clean up.'}
                onClick={onCleanup}
              >
                <Broom className="size-4" />
                Clean up Done cards
              </ReasonButton>
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
