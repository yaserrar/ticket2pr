import { ArchiveSlash, ArrowSwapHorizontal, Danger, Edit2, MessageQuestion, TickCircle, Timer1 } from 'iconsax-react';
import { cn } from '~/lib/utils';
import type { CardDto } from '~/types/card';

/**
 * Trello-side state of a card (spec §9.3): updated after work started,
 * removed, moved; the questions loop with the client; write-back failures.
 */
export function CardBadges({ card, className }: { card: CardDto; className?: string }) {
  const badges = [
    card.removedFromTrello
      ? { key: 'removed', icon: ArchiveSlash, label: 'Removed from Trello', tone: 'border-border-strong bg-fill text-muted-foreground' }
      : null,
    card.clientRepliedAt
      ? { key: 'replied', icon: TickCircle, label: 'Client replied', tone: 'border-success/30 bg-success-subtle text-success-muted' }
      : card.waitingSince
        ? { key: 'waiting', icon: Timer1, label: 'Waiting for client', tone: 'border-info/25 bg-info-subtle text-info-muted' }
        : card.clientQuestions && card.status === 'REVIEW'
          ? { key: 'questions', icon: MessageQuestion, label: 'Questions for client', tone: 'border-info/25 bg-info-subtle text-info-muted' }
          : null,
    card.changedOnTrello && !card.removedFromTrello && !card.clientRepliedAt
      ? { key: 'changed', icon: Edit2, label: 'Updated on Trello', tone: 'border-warning/30 bg-warning-subtle text-warning-muted' }
      : null,
    card.trelloError
      ? { key: 'trello-error', icon: Danger, label: 'Trello update failed', tone: 'border-danger/25 bg-danger-subtle text-danger-muted', title: card.trelloError }
      : null,
    !card.inSourceList && !card.removedFromTrello && card.status === 'NEW'
      ? { key: 'moved', icon: ArrowSwapHorizontal, label: 'Moved on Trello', tone: 'border-info/25 bg-info-subtle text-info-muted' }
      : null,
  ].filter((b) => b !== null);

  if (!badges.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {badges.map(({ key, icon: Icon, label, tone, ...rest }) => (
        <span
          key={key}
          title={'title' in rest ? rest.title : undefined}
          className={cn('inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10.5px] font-medium', tone)}
        >
          <Icon className="size-3" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
