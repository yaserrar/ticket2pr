'use client';

import * as React from 'react';
import { Play, Refresh2, ShieldCross, ShieldSearch, ShieldSecurity, ShieldTick, ArrowCircleLeft } from 'iconsax-react';
import { toast } from 'sonner';
import { RelativeTime } from '~/components/shared/relative-time';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useCheckScope, useMoveCard } from '~/hooks/cards';
import { useBoard } from '~/hooks/projects';
import { SCOPE_KIND_LABEL, SCOPE_SIZE_LABEL } from '~/lib/scope';
import { positionBetween } from '~/lib/workflow';
import { cn } from '~/lib/utils';
import type { CardStatus } from '~/schemas/common';
import type { CardDto } from '~/types/card';
import { OutOfScopeDialog } from './out-of-scope-dialog';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

const TONE_BOX: Record<Tone, string> = {
  neutral: 'border-border',
  success: 'border-success/25',
  warning: 'border-warning/30',
  danger: 'border-danger/25',
};
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-foreground',
  success: 'text-success-muted',
  warning: 'text-warning-muted',
  danger: 'text-danger-muted',
};

/** The headline of a card's scope check. */
export function scopeHeadline(card: CardDto): { title: string; tone: Tone; icon: typeof ShieldTick } | null {
  const { scope } = card;
  if (card.status === 'OUT_OF_SCOPE') return { title: 'Waiting for a new agreement with the client', tone: 'danger', icon: ShieldCross };
  switch (scope.status) {
    case 'CHECKING':
      return { title: 'Checking the scope…', tone: 'neutral', icon: ShieldSearch };
    case 'IN_SCOPE':
      return { title: 'In scope: covered by maintenance', tone: 'success', icon: ShieldTick };
    case 'OUT_OF_SCOPE':
      return { title: 'Out of scope: looks like new work', tone: 'danger', icon: ShieldCross };
    case 'UNSURE':
      return { title: 'Claude isn’t sure this is in scope', tone: 'warning', icon: ShieldSecurity };
    case 'FAILED':
      return { title: 'The scope check failed', tone: 'danger', icon: ShieldSecurity };
    default:
      return null;
  }
}

/**
 * Details tab, new and out-of-scope cards: Claude's verdict on whether the
 * card is covered by maintenance, and the developer's decision (start it,
 * set it aside for the project manager, bring it back once the client agreed).
 */
export function ScopeSection({ card }: { card: CardDto }) {
  const board = useBoard(card.projectId);
  const project = board.data?.project;
  const check = useCheckScope(card.projectId);
  const move = useMoveCard(card.projectId);
  const [aside, setAside] = React.useState(false);
  const { scope } = card;

  if (card.status !== 'NEW' && card.status !== 'OUT_OF_SCOPE') return null;
  if (!project?.scopeCheck && !scope.status && card.status === 'NEW') return null;

  const endOf = (status: CardStatus) => {
    const cards = board.data?.columns[status] ?? [];
    return positionBetween(cards.at(-1)?.position);
  };
  const start = (confirmed: boolean) =>
    move.mutate(
      { card, status: 'IN_PROGRESS', position: endOf('IN_PROGRESS'), confirmed },
      { onSuccess: () => toast.success(`Started “${card.title}”`) },
    );
  const recheck = () => check.mutate({ cardId: card.id, start: false }, { onSuccess: () => toast.info('Checking the scope again') });

  const headline = scopeHeadline(card);
  const checking = scope.status === 'CHECKING';
  const verdictNo = scope.status === 'OUT_OF_SCOPE' || scope.status === 'UNSURE' || scope.status === 'FAILED';
  const canCheck = Boolean(project?.scopeCheck) && !checking;

  return (
    <section
      aria-label="Scope"
      className={cn('flex flex-col gap-3 rounded-xl border bg-fill-faint p-4', TONE_BOX[headline?.tone ?? 'neutral'])}
    >
      <h3 className={cn('flex items-center gap-2 text-[13px] font-medium', TONE_TEXT[headline?.tone ?? 'neutral'])}>
        {checking ? <Spinner className="size-4" /> : headline ? <headline.icon className="size-4 shrink-0" /> : <ShieldSearch className="size-4 shrink-0" />}
        {headline?.title ?? 'Scope not checked yet'}
      </h3>

      {scope.kind || scope.size ? (
        <div className="flex flex-wrap gap-1.5">
          {scope.kind ? <Chip>{SCOPE_KIND_LABEL[scope.kind]}</Chip> : null}
          {scope.size ? <Chip>{SCOPE_SIZE_LABEL[scope.size]}</Chip> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-muted-foreground">
        {checking ? (
          <p>
            Claude is reading the card{project?.repoPath ? ' and looking through the repository (read-only)' : ''}.
            {scope.startWhenInScope ? ' It starts on its own if it’s in scope.' : ''}
          </p>
        ) : null}
        {!checking && scope.status === 'FAILED' && scope.error ? <p className="text-danger-muted">{scope.error}</p> : null}
        {!checking && scope.reason ? <p className="text-foreground/90">{scope.reason}</p> : null}
        {!checking && scope.status !== 'FAILED' && scope.error ? <p className="text-danger-muted">{scope.error}</p> : null}
        {!scope.status && card.status === 'NEW' ? <p>Claude reads each new card and says whether maintenance covers it.</p> : null}
        {scope.stale && !checking ? <p className="text-warning-muted">The card changed on Trello since this check.</p> : null}
        {scope.approved && card.status === 'NEW' ? <p>You approved this card: it starts without asking again.</p> : null}
        {card.status === 'OUT_OF_SCOPE' ? (
          <p>
            {scope.notePostedAt ? (
              <>
                The client was told on Trello <RelativeTime date={scope.notePostedAt} />.{' '}
              </>
            ) : (
              'Nothing was posted for the client. '
            )}
            Move it back to New once they agree to the new work. Moving it back to the source list on Trello does the same.
          </p>
        ) : null}
        {scope.checkedAt && !checking ? (
          <p className="text-xs text-subtle-foreground">
            Checked <RelativeTime date={scope.checkedAt} />
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {card.status === 'OUT_OF_SCOPE' ? (
          <Button
            size="sm"
            loading={move.isPending}
            onClick={() =>
              move.mutate(
                { card, status: 'NEW', position: endOf('NEW') },
                { onSuccess: () => toast.success('Back in New', { description: 'It can start now.' }) },
              )
            }
          >
            <ArrowCircleLeft className="size-4" />
            Client agreed: back to New
          </Button>
        ) : null}

        {card.status === 'NEW' && verdictNo && !scope.approved && !checking ? (
          <>
            <Button size="sm" onClick={() => setAside(true)}>
              <ShieldCross className="size-4" />
              Set aside as out of scope
            </Button>
            {project?.repoPath ? (
              <Button size="sm" variant="outline" loading={move.isPending} onClick={() => start(true)}>
                <Play className="size-4" />
                Start anyway
              </Button>
            ) : null}
          </>
        ) : null}

        {card.status === 'NEW' && (scope.status === 'IN_SCOPE' || scope.approved) && !checking && !scope.stale && project?.repoPath ? (
          <Button size="sm" loading={move.isPending} onClick={() => start(false)}>
            <Play className="size-4" />
            Start
          </Button>
        ) : null}

        {canCheck ? (
          <Button size="sm" variant={scope.status && !scope.stale ? 'ghost' : 'outline'} loading={check.isPending} onClick={recheck}>
            <Refresh2 className="size-4" />
            {scope.status ? 'Check again' : 'Check scope'}
          </Button>
        ) : null}
      </div>

      <OutOfScopeDialog card={aside ? card : null} onOpenChange={(open) => !open && setAside(false)} />
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-full border bg-fill px-2.5 text-xs text-foreground">{children}</span>;
}
