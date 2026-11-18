import {
  ArchiveSlash,
  ArrowSwapHorizontal,
  Danger,
  Edit2,
  MessageQuestion,
  MessageText1,
  ShieldCross,
  ShieldSearch,
  ShieldSecurity,
  ShieldTick,
  TickCircle,
  Timer1,
  Warning2,
} from 'iconsax-react';
import { RISK_META } from '~/lib/risk';
import { cn } from '~/lib/utils';
import type { CardDto } from '~/types/card';

const SUCCESS = 'border-success/30 bg-success-subtle text-success-muted';
const DANGER = 'border-danger/25 bg-danger-subtle text-danger-muted';
const WARNING = 'border-warning/30 bg-warning-subtle text-warning-muted';
const INFO = 'border-info/25 bg-info-subtle text-info-muted';
const NEUTRAL = 'border-border-strong bg-fill text-muted-foreground';

/** The scope check on a new card: Claude's verdict, or the developer's approval. */
function scopeBadge(card: CardDto) {
  const { scope } = card;
  if (card.status === 'OUT_OF_SCOPE') {
    return scope.notePostedAt ? { key: 'scope', icon: MessageText1, label: 'Client told', tone: INFO } : null;
  }
  if (card.status !== 'NEW') return null;
  if (scope.status === 'CHECKING') {
    return { key: 'scope', icon: ShieldSearch, label: scope.startWhenInScope ? 'Checking scope, then starts' : 'Checking scope', tone: NEUTRAL };
  }
  if (scope.error && scope.status === 'IN_SCOPE') return { key: 'scope', icon: Danger, label: 'In scope, couldn’t start', tone: DANGER, title: scope.error };
  if (scope.approved) return { key: 'scope', icon: ShieldTick, label: 'Approved', tone: SUCCESS };
  switch (scope.status) {
    case 'IN_SCOPE':
      return { key: 'scope', icon: ShieldTick, label: 'In scope', tone: SUCCESS, title: scope.reason ?? undefined };
    case 'OUT_OF_SCOPE':
      return { key: 'scope', icon: ShieldCross, label: 'Out of scope?', tone: DANGER, title: scope.reason ?? undefined };
    case 'UNSURE':
      return { key: 'scope', icon: ShieldSecurity, label: 'Scope unclear', tone: WARNING, title: scope.reason ?? undefined };
    case 'FAILED':
      return { key: 'scope', icon: ShieldSecurity, label: 'Scope check failed', tone: NEUTRAL, title: scope.error ?? undefined };
    default:
      return null;
  }
}

/**
 * Trello-side state of a card (spec §9.3): updated after work started,
 * removed, moved; the questions loop with the client; write-back failures.
 * On new cards, the scope check comes first.
 */
/** After a run: how carefully the changes must be reviewed. */
function riskBadge(card: CardDto) {
  if (!card.risk || card.activeRun || (card.status !== 'IN_PROGRESS' && card.status !== 'REVIEW')) return null;
  const meta = RISK_META[card.risk.level];
  const title = `${meta.review}${card.risk.areas.length ? `: ${card.risk.areas.map((a) => a.label).join(', ')}` : ''}`;
  const tone = card.risk.level === 'HIGH' ? DANGER : card.risk.level === 'MEDIUM' ? WARNING : SUCCESS;
  const icon = card.risk.level === 'HIGH' ? Danger : card.risk.level === 'MEDIUM' ? Warning2 : ShieldTick;
  const reviewed = card.risk.level === 'HIGH' && card.risk.reviewedAt;
  return { key: 'risk', icon, label: reviewed ? 'High risk · reviewed' : meta.label, tone, title };
}

export function CardBadges({ card, className }: { card: CardDto; className?: string }) {
  const badges = [
    scopeBadge(card),
    riskBadge(card),
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
  ].filter((b) => b !== null && b !== undefined);

  if (!badges.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {badges.map(({ key, icon: Icon, label, tone, ...rest }) => (
        <span
          key={key}
          title={'title' in rest ? (rest.title as string | undefined) : undefined}
          className={cn('inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10.5px] font-medium', tone)}
        >
          <Icon className="size-3" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}
