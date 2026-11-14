'use client';

import * as React from 'react';
import { Edit2, ExportSquare, MessageQuestion, MessageText1, Messages2, Send2, TickCircle } from 'iconsax-react';
import { toast } from 'sonner';
import { EmptyState } from '~/components/shared/empty-state';
import { ReasonButton } from '~/components/shared/reason-button';
import { RelativeTime } from '~/components/shared/relative-time';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { Textarea } from '~/components/ui/textarea';
import { useClientComment, useCreateRun, useDismissTrelloUpdates, useTrelloUpdates } from '~/hooks/cards';
import { useBoard } from '~/hooks/projects';
import { getErrorMessage } from '~/lib/api-errors';
import { plural } from '~/lib/format';
import { cn } from '~/lib/utils';
import type { CardDto } from '~/types/card';
import type { ContentChange, TrelloCommentDto } from '~/types/client-loop';

/** The tab deserves attention: something new from the client, or questions to send. */
export function clientNeedsAttention(card: CardDto) {
  return Boolean(card.clientRepliedAt || card.changedOnTrello || (card.clientQuestions && !card.waitingSince && card.status === 'REVIEW'));
}

/**
 * Client tab: everything between you and the client on Trello. What changed
 * since Claude last saw the card (send it, or mark it seen), Claude's
 * questions (ask them on Trello, then continue with the answer), the
 * plain-language update to post, and the conversation itself.
 */
export function ClientTab({ card }: { card: CardDto }) {
  const updates = useTrelloUpdates(card.id, !card.removedFromTrello);
  const newComments = updates.data?.comments.filter((c) => c.isNew) ?? [];
  const showNews = Boolean(card.changedOnTrello || card.clientRepliedAt);

  return (
    <div className="flex flex-col gap-4">
      {card.trelloError ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger-subtle px-3 py-2.5 text-[13px] text-danger-muted">
          {card.trelloError} Ticket2PR tries again with the next status change.
        </p>
      ) : null}
      {showNews ? <NewOnTrello card={card} changes={updates.data?.changes ?? []} comments={newComments} loading={updates.isPending} /> : null}
      {card.clientQuestions ? <QuestionsSection key={card.clientQuestions} card={card} /> : null}
      {card.clientUpdate ? <UpdateSection key={card.clientUpdate} card={card} /> : null}
      <Conversation card={card} comments={updates.data?.comments ?? []} loading={updates.isPending} error={updates.error} />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'warning' | 'success' | 'info';
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-fill-faint p-4',
        tone === 'warning' && 'border-warning/25',
        tone === 'success' && 'border-success/25',
        tone === 'info' && 'border-info/25',
      )}
    >
      <h3
        className={cn(
          'flex items-center gap-2 text-[13px] font-medium',
          tone === 'warning' ? 'text-warning-muted' : tone === 'success' ? 'text-success-muted' : tone === 'info' ? 'text-info-muted' : 'text-foreground',
        )}
      >
        <Icon className="size-4 shrink-0" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Why a follow-up can't start right now, or null. */
function followUpBlocked(card: CardDto) {
  if (card.activeRun) return 'Wait for the current run to finish.';
  if (card.status !== 'REVIEW' && card.status !== 'IN_PROGRESS') return 'Only cards In progress or in Review can continue.';
  return null;
}

function NewOnTrello({ card, changes, comments, loading }: { card: CardDto; changes: ContentChange[]; comments: TrelloCommentDto[]; loading: boolean }) {
  const createRun = useCreateRun(card.projectId, card.id);
  const dismiss = useDismissTrelloUpdates(card.projectId, card.id);
  const replied = Boolean(card.clientRepliedAt);

  const send = () =>
    createRun.mutate(
      {
        kind: 'FOLLOW_UP',
        followUpText: replied
          ? 'The client answered your questions on Trello (their comments are below). Continue the task with their answers.'
          : 'The client updated the card on Trello. Apply their latest changes (listed below).',
      },
      { onSuccess: () => toast.success(replied ? 'Claude continues with the client’s answer.' : 'Sent to Claude.') },
    );

  return (
    <Section title={replied ? 'The client replied' : 'New on Trello'} icon={replied ? TickCircle : Edit2} tone={replied ? 'success' : 'warning'}>
      <p className="text-[13px] text-muted-foreground">
        {replied
          ? 'They commented on the card after your questions. Claude gets their answer, and continues the work.'
          : 'The client changed the card after Claude started. Send the changes to Claude, or mark them as seen if they don’t matter.'}
      </p>
      {loading ? <Skeleton className="h-12 w-full" /> : null}
      {changes.length ? (
        <ul className="flex flex-col gap-2 text-[13px]">
          {changes.map((c) => (
            <li key={c.field} className="rounded-lg border bg-fill px-3 py-2">
              <ChangeLine change={c} />
            </li>
          ))}
        </ul>
      ) : null}
      {comments.length ? (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <ReasonButton size="sm" loading={createRun.isPending} reason={followUpBlocked(card)} onClick={send}>
          <Send2 className="size-4" />
          {replied ? 'Continue with the answer' : 'Send to Claude'}
        </ReasonButton>
        <Button size="sm" variant="ghost" loading={dismiss.isPending} onClick={() => dismiss.mutate()}>
          Mark as seen
        </Button>
      </div>
    </Section>
  );
}

function ChangeLine({ change }: { change: ContentChange }) {
  switch (change.field) {
    case 'title':
      return (
        <p>
          <span className="text-muted-foreground">Title: </span>
          <span className="text-subtle-foreground line-through">{change.before}</span> → <span className="text-foreground">{change.after}</span>
        </p>
      );
    case 'description':
      return (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Description is now:</span>
          <p className="line-clamp-6 whitespace-pre-wrap text-foreground">{change.after || '(empty)'}</p>
        </div>
      );
    case 'labels':
      return (
        <p>
          <span className="text-muted-foreground">Labels: </span>
          {[...change.added.map((l) => `+ ${l}`), ...change.removed.map((l) => `− ${l}`)].join(', ')}
        </p>
      );
    case 'checklist':
      return (
        <p>
          <span className="text-muted-foreground">Checklist: </span>
          {[
            ...change.added.map((i) => `added “${i}”`),
            ...change.removed.map((i) => `removed “${i}”`),
            ...change.completed.map((i) => `checked “${i}”`),
            ...change.reopened.map((i) => `unchecked “${i}”`),
          ].join(', ')}
        </p>
      );
  }
}

function QuestionsSection({ card }: { card: CardDto }) {
  const [text, setText] = React.useState(card.clientQuestions ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const post = useClientComment(card.projectId, card.id);
  const board = useBoard(card.projectId);
  const needsInfoList = board.data?.project.trelloNeedsInfoListId;

  if (card.waitingSince) {
    return (
      <Section title="Waiting for the client" icon={MessageQuestion} tone="info">
        <p className="text-[13px] text-muted-foreground">
          You asked Claude’s questions on Trello <RelativeTime date={card.waitingSince} />.{' '}
          {card.clientRepliedAt ? 'They replied: continue above.' : 'When the client answers, the card shows “Client replied” and you get notified.'}
        </p>
        <p className="rounded-lg border bg-fill px-3 py-2 text-[13px] whitespace-pre-wrap text-foreground">{card.clientQuestions}</p>
      </Section>
    );
  }

  return (
    <Section title="Claude has questions for the client" icon={MessageQuestion} tone="info">
      <p className="text-[13px] text-muted-foreground">
        The request wasn’t clear enough to start. Edit the questions if needed, then ask them on the Trello card
        {needsInfoList ? ', which moves to your “Needs info” list' : ''}.
      </p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-28 text-[13px]" aria-label="Questions for the client" />
      {error ? <p className="text-[13px] text-danger-muted">{error}</p> : null}
      <div>
        <ReasonButton
          size="sm"
          loading={post.isPending}
          reason={card.removedFromTrello ? 'This card was removed from Trello.' : !text.trim() ? 'Write the questions first.' : null}
          onClick={() => {
            setError(null);
            post.mutate(
              { kind: 'QUESTIONS', text },
              { onSuccess: () => toast.success('Asked on Trello. You’ll see the reply here.'), onError: (e) => setError(getErrorMessage(e)) },
            );
          }}
        >
          <Send2 className="size-4" />
          Ask on Trello
        </ReasonButton>
      </div>
    </Section>
  );
}

function UpdateSection({ card }: { card: CardDto }) {
  const [text, setText] = React.useState(card.clientUpdate ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const post = useClientComment(card.projectId, card.id);

  return (
    <Section title="Update for the client" icon={MessageText1}>
      <p className="text-[13px] text-muted-foreground">
        Written by Claude in plain words. Edit it, then post it on the Trello card when the work is ready for them.
      </p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-20 text-[13px]" aria-label="Update for the client" />
      {error ? <p className="text-[13px] text-danger-muted">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <ReasonButton
          size="sm"
          variant={card.clientUpdatePostedAt ? 'outline' : 'default'}
          loading={post.isPending}
          reason={card.removedFromTrello ? 'This card was removed from Trello.' : !text.trim() ? 'Write the message first.' : null}
          onClick={() => {
            setError(null);
            post.mutate({ kind: 'UPDATE', text }, { onSuccess: () => toast.success('Posted on Trello'), onError: (e) => setError(getErrorMessage(e)) });
          }}
        >
          <Send2 className="size-4" />
          {card.clientUpdatePostedAt ? 'Post again' : 'Post on Trello'}
        </ReasonButton>
        {card.clientUpdatePostedAt ? (
          <span className="flex items-center gap-1.5 text-xs text-success-muted">
            <TickCircle className="size-3.5" />
            Posted <RelativeTime date={card.clientUpdatePostedAt} />
          </span>
        ) : null}
      </div>
    </Section>
  );
}

function Conversation({ card, comments, loading, error }: { card: CardDto; comments: TrelloCommentDto[]; loading: boolean; error: unknown }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="eyebrow font-medium text-subtle-foreground">Conversation on Trello</h3>
        <a
          href={card.trelloUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Reply on Trello
          <ExportSquare className="size-3" />
        </a>
      </div>
      {card.removedFromTrello ? (
        <p className="text-[13px] text-subtle-foreground">This card was removed from Trello.</p>
      ) : loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : error ? (
        <p className="text-[13px] text-danger-muted">{getErrorMessage(error)}</p>
      ) : comments.length ? (
        <>
          <ul className="flex flex-col gap-2">
            {comments.map((c) => (
              <CommentItem key={c.id} comment={c} />
            ))}
          </ul>
          <p className="text-xs text-subtle-foreground">
            {plural(comments.length, 'comment')}. Claude gets the client’s comments with every run; your posts from Ticket2PR are left out.
          </p>
        </>
      ) : (
        <EmptyState size="sm" icon={Messages2} title="No comments yet" description="Comments the client writes on the Trello card show up here and go to Claude." />
      )}
    </section>
  );
}

function CommentItem({ comment }: { comment: TrelloCommentDto }) {
  return (
    <li className={cn('flex flex-col gap-1 rounded-lg border px-3 py-2', comment.fromTicket2pr ? 'bg-fill-faint' : 'bg-fill')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="font-medium text-foreground">{comment.author}</span>
        <span className="text-subtle-foreground">
          <RelativeTime date={comment.date} />
        </span>
        {comment.fromTicket2pr ? <span className="text-subtle-foreground">· from Ticket2PR</span> : null}
        {comment.isNew ? (
          <span className="rounded-full border border-warning/30 bg-warning-subtle px-1.5 text-[10.5px] font-medium text-warning-muted">new</span>
        ) : null}
      </div>
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{comment.text}</p>
    </li>
  );
}
