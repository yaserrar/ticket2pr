import { describe, expect, it } from 'vitest';
import type { TrelloCard, TrelloChecklist, TrelloComment } from '~/server/modules/trello/trello.schemas';
import { contentFromTrello, groupChecklistsByCard, planCommentFlags, planSync, refreshCard, type CommentCard, type LocalCard } from './sync.plan';

const SOURCE = 'list-source';
const OTHER = 'list-other';

function remote(overrides: Partial<TrelloCard> = {}): TrelloCard {
  return {
    id: 'c1',
    name: 'Fix the footer link',
    desc: 'The privacy link is broken.',
    idList: SOURCE,
    labels: [],
    url: 'https://trello.com/c/abc123/1-fix',
    shortLink: 'abc123',
    dateLastActivity: '2026-11-10T10:00:00.000Z',
    pos: 1000,
    ...overrides,
  };
}

function local(card: TrelloCard, overrides: Partial<LocalCard> = {}): LocalCard {
  const content = contentFromTrello(card, []);
  return {
    id: `local-${card.id}`,
    trelloCardId: card.id,
    status: 'NEW',
    ...content,
    trelloListId: card.idList,
    trelloLastActivity: new Date(card.dateLastActivity),
    removedFromTrello: false,
    ...overrides,
  };
}

describe('planSync', () => {
  it('creates untracked cards from the source list, in Trello order', () => {
    const plan = planSync({
      sourceListId: SOURCE,
      remote: [remote({ id: 'b', pos: 200 }), remote({ id: 'a', pos: 100 })],
      local: [],
    });
    expect(plan.create.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('ignores untracked cards in other lists', () => {
    const plan = planSync({ sourceListId: SOURCE, remote: [remote({ idList: OTHER })], local: [] });
    expect(plan.create).toEqual([]);
  });

  it('skips tracked cards whose activity date and list are unchanged', () => {
    const card = remote();
    const plan = planSync({ sourceListId: SOURCE, remote: [card], local: [local(card)] });
    expect(plan).toEqual({ create: [], refresh: [], restore: [], remove: [] });
  });

  it('refreshes tracked cards when the activity date changes', () => {
    const before = remote();
    const after = remote({ dateLastActivity: '2026-11-11T09:00:00.000Z', name: 'Fix the footer links' });
    const plan = planSync({ sourceListId: SOURCE, remote: [after], local: [local(before)] });
    expect(plan.refresh).toHaveLength(1);
  });

  it('keeps following a tracked card moved to another list', () => {
    const before = remote();
    const plan = planSync({ sourceListId: SOURCE, remote: [remote({ idList: OTHER })], local: [local(before)] });
    expect(plan.refresh).toHaveLength(1);
    expect(plan.create).toEqual([]);
  });

  it('flags tracked cards missing from Trello once', () => {
    const card = remote();
    const first = planSync({ sourceListId: SOURCE, remote: [], local: [local(card)] });
    expect(first.remove).toHaveLength(1);
    const again = planSync({ sourceListId: SOURCE, remote: [], local: [local(card, { removedFromTrello: true })] });
    expect(again.remove).toEqual([]);
  });

  it('restores a removed card that is back with nothing else changed', () => {
    const card = remote();
    const plan = planSync({ sourceListId: SOURCE, remote: [card], local: [local(card, { removedFromTrello: true })] });
    expect(plan.restore).toHaveLength(1);
  });
});

describe('refreshCard', () => {
  it('updates content and reports a change', () => {
    const before = remote();
    const after = remote({ name: 'New title', dateLastActivity: '2026-11-12T00:00:00.000Z' });
    const { changed, data } = refreshCard(local(before), after, []);
    expect(changed).toBe(true);
    expect(data).toMatchObject({ title: 'New title', trelloLastActivity: new Date('2026-11-12T00:00:00.000Z') });
    expect(data).not.toHaveProperty('changedOnTrello');
  });

  it('flags changedOnTrello only once work has started', () => {
    const before = remote();
    const after = remote({ desc: 'More details', dateLastActivity: '2026-11-12T00:00:00.000Z' });
    expect(refreshCard(local(before, { status: 'IN_PROGRESS' }), after, []).data).toMatchObject({ changedOnTrello: true });
  });

  it('treats a move without content change as no change', () => {
    const before = remote();
    const moved = remote({ idList: OTHER, dateLastActivity: '2026-11-12T00:00:00.000Z' });
    const { changed, data } = refreshCard(local(before), moved, []);
    expect(changed).toBe(false);
    expect(data).toMatchObject({ trelloListId: OTHER });
    expect(data).not.toHaveProperty('title');
  });

  it('detects checklist edits', () => {
    const card = remote();
    const checklist: TrelloChecklist = {
      id: 'cl1',
      name: 'Done when',
      idCard: card.id,
      pos: 1,
      checkItems: [{ id: 'i1', name: 'Link works', state: 'complete', pos: 1 }],
    };
    expect(refreshCard(local(card), remote({ dateLastActivity: '2026-11-12T00:00:00.000Z' }), [checklist]).changed).toBe(true);
  });
});

describe('contentFromTrello', () => {
  it('orders checklists and items by position and serialises deterministically', () => {
    const card = remote({ labels: [{ id: 'l1', name: 'Bug', color: 'red' }] });
    const checklists: TrelloChecklist[] = [
      { id: 'b', name: 'Second', idCard: card.id, pos: 2, checkItems: [] },
      {
        id: 'a',
        name: 'First',
        idCard: card.id,
        pos: 1,
        checkItems: [
          { id: 'y', name: 'Two', state: 'incomplete', pos: 2 },
          { id: 'x', name: 'One', state: 'complete', pos: 1 },
        ],
      },
    ];
    const content = contentFromTrello(card, checklists);
    expect(JSON.parse(content.labelsJson)).toEqual([{ id: 'l1', name: 'Bug', color: 'red' }]);
    expect(JSON.parse(content.checklistsJson)).toEqual([
      { id: 'a', name: 'First', items: [{ id: 'x', name: 'One', state: 'complete' }, { id: 'y', name: 'Two', state: 'incomplete' }] },
      { id: 'b', name: 'Second', items: [] },
    ]);
    expect(contentFromTrello(card, [...checklists].reverse())).toEqual(content);
  });

  it('groups checklists by card', () => {
    const grouped = groupChecklistsByCard([
      { id: '1', name: 'A', idCard: 'c1', pos: 1, checkItems: [] },
      { id: '2', name: 'B', idCard: 'c2', pos: 1, checkItems: [] },
      { id: '3', name: 'C', idCard: 'c1', pos: 2, checkItems: [] },
    ]);
    expect(grouped.get('c1')?.map((c) => c.id)).toEqual(['1', '3']);
    expect(grouped.get('c2')).toHaveLength(1);
  });
});

describe('planCommentFlags', () => {
  const comment = (id: string, cardId: string, date: string): TrelloComment => ({
    id,
    date,
    data: { text: 'hi', card: { id: cardId } },
    memberCreator: { id: 'm', fullName: 'Marie', username: 'marie' },
  });
  const card = (over: Partial<CommentCard>): CommentCard => ({
    id: 'local-1',
    trelloCardId: 't1',
    status: 'IN_PROGRESS',
    postedCommentIds: [],
    sentContextAt: new Date('2026-11-14T10:00:00Z'),
    waitingSince: null,
    clientRepliedAt: null,
    changedOnTrello: false,
    ...over,
  });

  it('flags new client comments on cards being worked on', () => {
    const flags = planCommentFlags([comment('c1', 't1', '2026-11-14T11:00:00Z')], [card({})]);
    expect(flags.get('local-1')).toEqual({ changedOnTrello: true });
  });

  it('ignores old comments, our own comments, and cards not being worked on', () => {
    const cards = [card({}), card({ id: 'local-2', trelloCardId: 't2', status: 'NEW' }), card({ id: 'local-3', trelloCardId: 't3', postedCommentIds: ['mine'] })];
    const flags = planCommentFlags(
      [comment('c0', 't1', '2026-11-14T09:00:00Z'), comment('c2', 't2', '2026-11-14T11:00:00Z'), comment('mine', 't3', '2026-11-14T11:00:00Z')],
      cards,
    );
    expect(flags.size).toBe(0);
  });

  it('records the reply on a card waiting for the client', () => {
    const waiting = card({ status: 'REVIEW', waitingSince: new Date('2026-11-14T12:00:00Z'), changedOnTrello: true });
    const flags = planCommentFlags(
      [comment('a', 't1', '2026-11-14T11:30:00Z'), comment('b', 't1', '2026-11-14T12:30:00Z'), comment('c', 't1', '2026-11-14T12:10:00Z')],
      [waiting],
    );
    expect(flags.get('local-1')).toEqual({ clientRepliedAt: new Date('2026-11-14T12:30:00Z') });
  });
});
