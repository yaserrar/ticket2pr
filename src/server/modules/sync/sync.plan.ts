import type { Checklist, CardLabel } from '~/types/card';
import type { TrelloCard, TrelloChecklist, TrelloComment } from '~/server/modules/trello/trello.schemas';

/**
 * Pure sync logic (spec §6.3), kept free of I/O so it is unit-tested.
 *
 * Source of truth: Trello owns the content (title, description, labels,
 * checklists). Ticket2PR owns the status (the board column).
 */

/** The local card fields the sync reads. */
export type LocalCard = {
  id: string;
  trelloCardId: string;
  status: string;
  title: string;
  description: string;
  labelsJson: string;
  checklistsJson: string;
  trelloListId: string;
  trelloLastActivity: Date;
  removedFromTrello: boolean;
};

export type SyncPlan = {
  /** Untracked cards in the source list, in Trello order. */
  create: TrelloCard[];
  /** Tracked cards whose Trello activity date or list changed: content must be compared. */
  refresh: { local: LocalCard; remote: TrelloCard }[];
  /** Tracked cards flagged as removed that are back on Trello, with nothing else changed. */
  restore: LocalCard[];
  /** Tracked cards missing from Trello (archived or deleted), not flagged yet. */
  remove: LocalCard[];
};

export function planSync(input: { sourceListId: string; remote: TrelloCard[]; local: LocalCard[] }): SyncPlan {
  const localByTrelloId = new Map(input.local.map((c) => [c.trelloCardId, c]));
  const remoteIds = new Set(input.remote.map((c) => c.id));
  const plan: SyncPlan = { create: [], refresh: [], restore: [], remove: [] };

  for (const remote of input.remote) {
    const local = localByTrelloId.get(remote.id);
    if (!local) {
      // Cards elsewhere on the board are not ours.
      if (remote.idList === input.sourceListId) plan.create.push(remote);
      continue;
    }
    const activityChanged = new Date(remote.dateLastActivity).getTime() !== local.trelloLastActivity.getTime();
    if (activityChanged || remote.idList !== local.trelloListId) plan.refresh.push({ local, remote });
    else if (local.removedFromTrello) plan.restore.push(local);
  }

  for (const local of input.local) {
    if (!remoteIds.has(local.trelloCardId) && !local.removedFromTrello) plan.remove.push(local);
  }

  plan.create.sort((a, b) => a.pos - b.pos);
  return plan;
}

/** Trello card + its checklists → the content columns we store (deterministic JSON). */
export function contentFromTrello(card: TrelloCard, checklists: TrelloChecklist[]) {
  const labels: CardLabel[] = card.labels.map((l) => ({ id: l.id, name: l.name, color: l.color }));
  const lists: Checklist[] = [...checklists]
    .sort((a, b) => a.pos - b.pos)
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: [...c.checkItems].sort((a, b) => a.pos - b.pos).map((i) => ({ id: i.id, name: i.name, state: i.state })),
    }));
  return {
    title: card.name,
    description: card.desc,
    labelsJson: JSON.stringify(labels),
    checklistsJson: JSON.stringify(lists),
  };
}

/**
 * Update for a tracked card whose Trello activity changed. `changed` is true
 * when the board shows something new (content edited, or back from removed).
 * Content edited after work started sets `changedOnTrello` (spec §9.3).
 */
export function refreshCard(local: LocalCard, remote: TrelloCard, checklists: TrelloChecklist[]) {
  const next = contentFromTrello(remote, checklists);
  const contentChanged =
    next.title !== local.title ||
    next.description !== local.description ||
    next.labelsJson !== local.labelsJson ||
    next.checklistsJson !== local.checklistsJson;

  return {
    changed: contentChanged || local.removedFromTrello,
    data: {
      trelloListId: remote.idList,
      trelloShortLink: remote.shortLink,
      trelloUrl: remote.url,
      trelloLastActivity: new Date(remote.dateLastActivity),
      removedFromTrello: false,
      ...(contentChanged ? next : {}),
      ...(contentChanged && local.status !== 'NEW' ? { changedOnTrello: true } : {}),
    },
  };
}

export function groupChecklistsByCard(checklists: TrelloChecklist[]) {
  const byCard = new Map<string, TrelloChecklist[]>();
  for (const c of checklists) byCard.set(c.idCard, [...(byCard.get(c.idCard) ?? []), c]);
  return byCard;
}

/** The local card fields comment flags need. */
export type CommentCard = {
  id: string;
  trelloCardId: string;
  status: string;
  postedCommentIds: string[];
  sentContextAt: Date | null;
  waitingSince: Date | null;
  clientRepliedAt: Date | null;
  changedOnTrello: boolean;
};

/**
 * New Trello comments on cards being worked on (spec §9.3): the client said
 * something Claude hasn't seen, so the card shows "Updated on Trello". On a
 * card waiting for answers, it is the client's reply. Comments Ticket2PR
 * posted itself are ignored.
 */
export function planCommentFlags(comments: TrelloComment[], cards: CommentCard[]) {
  const byTrelloId = new Map(cards.map((c) => [c.trelloCardId, c]));
  const updates = new Map<string, { changedOnTrello?: true; clientRepliedAt?: Date }>();
  for (const comment of comments) {
    const card = comment.data.card ? byTrelloId.get(comment.data.card.id) : undefined;
    if (!card || card.status === 'NEW' || card.status === 'DONE' || card.postedCommentIds.includes(comment.id)) continue;
    const at = new Date(comment.date);
    if (card.sentContextAt && at <= card.sentContextAt) continue;
    const next = updates.get(card.id) ?? {};
    if (!card.changedOnTrello) next.changedOnTrello = true;
    if (card.waitingSince && at > card.waitingSince && (!card.clientRepliedAt || at > card.clientRepliedAt)) {
      if (!next.clientRepliedAt || at > next.clientRepliedAt) next.clientRepliedAt = at;
    }
    if (next.changedOnTrello || next.clientRepliedAt) updates.set(card.id, next);
  }
  return updates;
}
