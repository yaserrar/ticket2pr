'use client';

import * as React from 'react';
import { ArrowCircleDown, ArrowCircleUp, Broom, ExportSquare, Hierarchy, Send2, TickCircle, Trash } from 'iconsax-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormError, FormField } from '~/components/forms/form-field';
import { confirm } from '~/components/shared/confirm-dialog';
import { CopyButton } from '~/components/shared/copy-button';
import { EmptyState } from '~/components/shared/empty-state';
import { ReasonButton } from '~/components/shared/reason-button';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useCleanupCard, useCommit, useDiscardCard, useGitStatus, useMoveCard, useOpenPr, usePush, useUpdateBase } from '~/hooks/cards';
import { getErrorMessage } from '~/lib/api-errors';
import { plural } from '~/lib/format';
import { cn } from '~/lib/utils';
import { z } from 'zod';
import { useBoard } from '~/hooks/projects';
import { positionBetween } from '~/lib/workflow';
import { commitBody, pullRequestBody, type CommitInput } from '~/schemas/card';
import type { CardDto } from '~/types/card';
import type { GitStatusDto } from '~/types/git';

/**
 * Git tab (spec §8.4–8.6, §11.4): branch and worktree, commit, push, pull
 * request, discard. Humans do these: the agent never commits or pushes.
 */
export function GitTab({ card }: { card: CardDto }) {
  const status = useGitStatus(card.id, card.hasWorktree);
  const running = card.activeRun?.status === 'RUNNING';

  if (!card.hasWorktree) {
    const cleanedUp = card.status === 'DONE' && card.branchName;
    return (
      <div className="flex flex-col gap-5">
        <EmptyState
          size="sm"
          icon={Hierarchy}
          title={cleanedUp ? 'Work finished' : card.status === 'IN_PROGRESS' ? 'Getting ready' : 'No branch yet'}
          description={
            cleanedUp
              ? `The work is on ${card.branchName}${card.prUrl ? ' and in its pull request' : ''}.`
              : card.status === 'IN_PROGRESS'
                ? 'The first run prepares the branch. Its git status shows here once it starts.'
                : 'Drag the card to In progress to start work on it.'
          }
        />
        {card.status === 'IN_PROGRESS' || card.status === 'REVIEW' ? <DiscardSection card={card} /> : null}
      </div>
    );
  }
  if (status.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (status.error || !status.data) {
    return (
      <EmptyState
        size="sm"
        title="Git status could not be read"
        description={getErrorMessage(status.error)}
        action={<Button size="sm" onClick={() => status.refetch()}>Retry</Button>}
      />
    );
  }

  const git = status.data;
  const busy = running ? 'Wait for the run to finish, or stop it first.' : null;
  const shared = git.workMode === 'SHARED_BRANCH';

  return (
    <div className="flex flex-col gap-4">
      <BranchSection card={card} git={git} busy={busy} />
      <CommitSection key={`${git.branchName}-${git.suggestedCommitMessage.length}`} card={card} git={git} busy={busy} />
      <PushSection card={card} git={git} busy={busy} />
      {shared ? <ReleaseSection git={git} /> : <PullRequestSection card={card} git={git} busy={busy} />}
      {card.status === 'DONE' && !shared ? <CleanupSection card={card} /> : null}
      {card.status === 'IN_PROGRESS' || card.status === 'REVIEW' ? <DiscardSection card={card} git={git} /> : null}
    </div>
  );
}

function Section({ title, aside, children, tone }: { title: string; aside?: React.ReactNode; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-xl border bg-fill-faint p-4', tone === 'danger' && 'border-danger/20')}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="eyebrow font-medium text-subtle-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium',
        ok ? 'border-success/25 bg-success-subtle text-success-muted' : 'border-border-strong bg-fill text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

function BranchSection({ card, git, busy }: { card: CardDto; git: GitStatusDto; busy: string | null }) {
  const shared = git.workMode === 'SHARED_BRANCH';
  const update = useUpdateBase(card.projectId, card.id);
  const [error, setError] = React.useState<string | null>(null);
  const canUpdate = !shared && git.behindBase > 0 && card.status !== 'DONE';

  return (
    <Section title={shared ? 'Shared branch' : 'Branch'}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-muted-foreground">Branch</dt>
        <dd className="truncate font-mono text-xs text-foreground" title={git.branchName}>
          {git.branchName}
        </dd>
        <CopyButton value={git.branchName} size="icon-xs" label="Copy branch name" />
        <dt className="text-muted-foreground">{git.inRepoFolder ? 'Folder' : 'Worktree'}</dt>
        <dd className="truncate font-mono text-xs text-foreground" title={git.worktreePath}>
          {git.worktreePath}
        </dd>
        <CopyButton value={git.worktreePath} size="icon-xs" label="Copy worktree path" />
        {shared && git.branchName === git.baseBranch ? null : (
          <>
            <dt className="text-muted-foreground">Base</dt>
            <dd className="col-span-2 font-mono text-xs text-foreground">{git.baseBranch}</dd>
          </>
        )}
      </dl>
      {shared ? (
        <p className="text-xs text-subtle-foreground">
          {git.inRepoFolder ? 'Claude works in your repository folder. ' : ''}Changes and commits below are only this card’s, since it started.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Chip ok={git.uncommittedFiles === 0}>
          {git.uncommittedFiles ? `${plural(git.uncommittedFiles, 'file')} not committed` : 'Everything committed'}
        </Chip>
        <Chip ok={git.commitsAhead > 0}>
          {shared ? `${plural(git.commitsAhead, 'commit')} for this card` : `${plural(git.commitsAhead, 'commit')} ahead of ${git.baseBranch}`}
        </Chip>
        {!shared && git.behindBase > 0 ? <Chip ok={false}>{git.behindBase} behind {git.baseBranch}</Chip> : null}
        <Chip ok={git.remoteBranchExists && git.unpushedCommits === 0 && (!shared || git.commitsAhead > 0)}>
          {!git.hasRemote
            ? 'No remote'
            : shared && git.commitsAhead === 0
              ? 'Nothing to push yet'
              : !git.remoteBranchExists
                ? 'Not pushed'
                : git.unpushedCommits
                  ? `${git.unpushedCommits} to push`
                  : 'Pushed'}
        </Chip>
      </div>
      {canUpdate ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-[13px] text-muted-foreground">
            {git.baseBranch} has {plural(git.behindBase, 'new commit')} since this branch started. Updating merges them in; on a conflict nothing
            changes.
          </p>
          {error ? (
            <pre role="alert" className="overflow-x-auto rounded-lg border border-danger/25 bg-danger-subtle p-3 font-mono text-[11.5px] whitespace-pre-wrap text-danger-muted">
              {error}
            </pre>
          ) : null}
          <div>
            <ReasonButton
              size="sm"
              variant="outline"
              loading={update.isPending}
              reason={busy ?? (git.uncommittedFiles > 0 ? 'Commit or reset the changes first.' : null)}
              onClick={() => {
                setError(null);
                update.mutate(undefined, {
                  onSuccess: (res) => toast.success(res.merged ? `Merged ${plural(res.merged, 'commit')} from ${res.baseRef}` : 'Already up to date'),
                  onError: (e) => setError(getErrorMessage(e)),
                });
              }}
            >
              <ArrowCircleDown className="size-4" />
              Update from {git.baseBranch}
            </ReasonButton>
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function CommitSection({ card, git, busy }: { card: CardDto; git: GitStatusDto; busy: string | null }) {
  const commit = useCommit(card.projectId, card.id);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<CommitInput>({ resolver: zodResolver(commitBody), defaultValues: { message: git.suggestedCommitMessage } });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    commit.mutate(values, {
      onSuccess: ({ sha }) => toast.success(`Committed ${sha.slice(0, 7)}`),
      onError: (e) => setError(getErrorMessage(e)),
    });
  });

  return (
    <Section title="Commit">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <FormField control={form.control} name="message" type="textarea" label="Message" className="[&_textarea]:font-mono [&_textarea]:text-xs" />
        <FormError message={error} />
        <div>
          <ReasonButton
            type="submit"
            size="sm"
            loading={commit.isPending}
            reason={busy ?? (git.uncommittedFiles === 0 ? 'Nothing to commit: every change is already committed.' : null)}
          >
            <TickCircle className="size-4" />
            Commit {git.uncommittedFiles ? plural(git.uncommittedFiles, 'file') : ''}
          </ReasonButton>
        </div>
      </form>
    </Section>
  );
}

function PushSection({ card, git, busy }: { card: CardDto; git: GitStatusDto; busy: string | null }) {
  const push = usePush(card.projectId, card.id);
  const [error, setError] = React.useState<string | null>(null);
  const reason =
    busy ??
    (!git.hasRemote
      ? 'This repository has no origin remote.'
      : git.uncommittedFiles > 0
        ? 'Commit your changes before pushing.'
        : git.commitsAhead === 0
          ? 'Nothing to push: commit first.'
          : git.remoteBranchExists && git.unpushedCommits === 0
            ? 'Already pushed.'
            : null);

  return (
    <Section title="Push">
      <p className="text-[13px] text-muted-foreground">
        Runs <code className="rounded-sm bg-fill-raised px-1 font-mono text-xs">git push -u origin {git.branchName}</code> with your own git
        credentials.{git.workMode === 'SHARED_BRANCH' ? ' The card then moves to Done, and the next card can start.' : ''}
      </p>
      {error ? (
        <pre role="alert" className="overflow-x-auto rounded-lg border border-danger/25 bg-danger-subtle p-3 font-mono text-[11.5px] whitespace-pre-wrap text-danger-muted">
          {error}
        </pre>
      ) : null}
      <div>
        <ReasonButton
          size="sm"
          variant="outline"
          loading={push.isPending}
          reason={reason}
          onClick={() => {
            setError(null);
            push.mutate(undefined, {
              onSuccess: ({ branchName, done }) => toast.success(done ? `Pushed ${branchName}. The card is Done.` : `Pushed ${branchName}`),
              onError: (e) => setError(getErrorMessage(e)),
            });
          }}
        >
          <ArrowCircleUp className="size-4" />
          Push
        </ReasonButton>
      </div>
    </Section>
  );
}

const prForm = pullRequestBody.extend({ body: z.string().max(20000) });

function PullRequestSection({ card, git, busy }: { card: CardDto; git: GitStatusDto; busy: string | null }) {
  const openPr = useOpenPr(card.projectId, card.id);
  const move = useMoveCard(card.projectId);
  const board = useBoard(card.projectId);
  const [error, setError] = React.useState<string | null>(null);
  const [compareOpened, setCompareOpened] = React.useState(false);
  const form = useForm<z.infer<typeof prForm>>({ resolver: zodResolver(prForm), defaultValues: git.suggestedPr });

  const markDone = () => {
    const done = board.data?.columns.DONE ?? [];
    const position = positionBetween(done.at(-1)?.position);
    move.mutate({ card, status: 'DONE', position, confirmed: true }, { onSuccess: () => toast.success('Marked as done') });
  };

  if (git.prUrl) {
    return (
      <Section title="Pull request">
        <a
          href={git.prUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-success-muted underline-offset-4 hover:underline"
        >
          <TickCircle className="size-4" />
          {git.prUrl.replace('https://github.com/', '')}
          <ExportSquare className="size-3.5" />
        </a>
        {card.status === 'REVIEW' ? (
          <div>
            <Button size="sm" variant="outline" onClick={markDone} loading={move.isPending}>
              Mark as done
            </Button>
          </div>
        ) : null}
      </Section>
    );
  }

  const reason =
    busy ??
    (!git.github
      ? 'Pull requests need a github.com origin remote.'
      : !git.remoteBranchExists || git.unpushedCommits > 0 || git.uncommittedFiles > 0
        ? 'Commit and push the branch first.'
        : null);

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    openPr.mutate(values, {
      onSuccess: (res) => {
        if (res.prUrl) toast.success('Pull request opened. The card moved to Done.');
        else if (res.compareUrl) {
          window.open(res.compareUrl, '_blank', 'noopener');
          setCompareOpened(true);
        }
      },
      onError: (e) => setError(getErrorMessage(e)),
    });
  });

  return (
    <Section title="Pull request">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <FormField control={form.control} name="title" label="Title" />
        <FormField control={form.control} name="body" type="textarea" label="Description" className="[&_textarea]:min-h-28 [&_textarea]:text-xs" />
        {!git.githubTokenSet && git.github ? (
          <p className="text-xs text-subtle-foreground">
            No GitHub token saved: this opens GitHub’s “compare” page with the branch selected. Add a token in Settings to open it from here.
          </p>
        ) : null}
        <FormError message={error} />
        <div className="flex flex-wrap items-center gap-2">
          <ReasonButton type="submit" size="sm" loading={openPr.isPending} reason={reason}>
            {git.githubTokenSet ? <Send2 className="size-4" /> : <ExportSquare className="size-4" />}
            {git.githubTokenSet ? 'Open pull request' : 'Open on GitHub'}
          </ReasonButton>
          {compareOpened && card.status === 'REVIEW' ? (
            <Button type="button" size="sm" variant="outline" onClick={markDone} loading={move.isPending}>
              I opened it: mark as done
            </Button>
          ) : null}
        </div>
      </form>
    </Section>
  );
}

/** Shared branch other than the base: when it's ready, a pull request into the base ships it. */
function ReleaseSection({ git }: { git: GitStatusDto }) {
  if (!git.releaseCompareUrl) return null;
  return (
    <Section title="Release">
      <p className="text-[13px] text-muted-foreground">
        No pull request per card on a shared branch. When <span className="font-mono text-xs">{git.branchName}</span> is ready to ship, open one
        into <span className="font-mono text-xs">{git.baseBranch}</span>.
      </p>
      <div>
        <Button size="sm" variant="outline" asChild>
          <a href={git.releaseCompareUrl} target="_blank" rel="noreferrer noopener">
            <ExportSquare className="size-4" />
            Compare {git.branchName} → {git.baseBranch} on GitHub
          </a>
        </Button>
      </div>
    </Section>
  );
}

/** Done card: remove the worktree folder, and the local branch once pushed. */
function CleanupSection({ card }: { card: CardDto }) {
  const cleanup = useCleanupCard(card.projectId, card.id);
  return (
    <Section title="Clean up">
      <p className="text-[13px] text-muted-foreground">
        Removes this card’s worktree folder. The local branch is deleted too if GitHub already has all of it.
      </p>
      <div>
        <Button
          size="sm"
          variant="outline"
          loading={cleanup.isPending}
          onClick={() =>
            cleanup.mutate(undefined, {
              onSuccess: (res) =>
                toast.success(res.deletedBranch ? 'Worktree removed and local branch deleted' : 'Worktree removed', {
                  description: res.keptBranchReason ? `Branch kept: ${res.keptBranchReason}.` : undefined,
                }),
            })
          }
        >
          <Broom className="size-4" />
          Clean up
        </Button>
      </div>
    </Section>
  );
}

function DiscardSection({ card, git }: { card: CardDto; git?: GitStatusDto }) {
  const discard = useDiscardCard(card.projectId, card.id);
  const shared = git?.workMode === 'SHARED_BRANCH';
  return (
    <Section title="Danger zone" tone="danger">
      <p className="text-[13px] text-muted-foreground">
        {shared
          ? `Stops any run, throws away the uncommitted changes in ${git.inRepoFolder ? 'your repository folder' : 'the shared folder'}, and moves the card back to New. Commits already made stay on ${git.branchName}.`
          : 'Stops any run, deletes the worktree and the branch (with uncommitted and unpushed work), and moves the card back to New.'}
      </p>
      <div>
        <Button
          size="sm"
          variant="destructive"
          loading={discard.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: 'Discard this work?',
              description: shared
                ? `Uncommitted changes in ${git.worktreePath} are thrown away. This can't be undone.`
                : `The branch ${card.branchName ?? ''} and its worktree are deleted. This can't be undone.`,
              confirmLabel: 'Discard work',
              destructive: true,
            });
            if (ok) discard.mutate(undefined, { onSuccess: () => toast.success('Work discarded. The card is back in New.') });
          }}
        >
          <Trash className="size-4" />
          Discard work
        </Button>
      </div>
    </Section>
  );
}
