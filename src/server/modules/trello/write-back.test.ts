import { describe, expect, it } from 'vitest';
import { postedIdsOf, targetList } from './write-back.service';

const lists = {
  trelloSourceListId: 'source',
  trelloInProgressListId: 'doing',
  trelloReviewListId: 'review',
  trelloDoneListId: 'done',
  trelloNeedsInfoListId: 'needs-info',
  trelloOutOfScopeListId: 'out-of-scope',
};

describe('targetList', () => {
  it('maps each status to its list, and waiting cards to "Needs info"', () => {
    expect(targetList({ status: 'IN_PROGRESS', waitingSince: null }, lists)).toBe('doing');
    expect(targetList({ status: 'REVIEW', waitingSince: null }, lists)).toBe('review');
    expect(targetList({ status: 'REVIEW', waitingSince: new Date() }, lists)).toBe('needs-info');
    expect(targetList({ status: 'DONE', waitingSince: null }, lists)).toBe('done');
    expect(targetList({ status: 'NEW', waitingSince: null }, lists)).toBe('source');
    expect(targetList({ status: 'OUT_OF_SCOPE', waitingSince: null }, lists)).toBe('out-of-scope');
  });

  it('moves out-of-scope cards, and back to the source list, with only that list set', () => {
    const only = { trelloSourceListId: 'source', trelloInProgressListId: null, trelloReviewListId: null, trelloDoneListId: null, trelloNeedsInfoListId: null, trelloOutOfScopeListId: 'oos' };
    expect(targetList({ status: 'OUT_OF_SCOPE', waitingSince: null }, only)).toBe('oos');
    expect(targetList({ status: 'NEW', waitingSince: null }, only)).toBe('source');
    expect(targetList({ status: 'IN_PROGRESS', waitingSince: null }, only)).toBeNull();
  });

  it('leaves cards alone when no list is set', () => {
    const none = { trelloSourceListId: 'source', trelloInProgressListId: null, trelloReviewListId: null, trelloDoneListId: null, trelloNeedsInfoListId: null, trelloOutOfScopeListId: null };
    expect(targetList({ status: 'DONE', waitingSince: null }, none)).toBeNull();
    expect(targetList({ status: 'NEW', waitingSince: null }, none)).toBeNull();
    expect(targetList({ status: 'REVIEW', waitingSince: new Date() }, { ...lists, trelloNeedsInfoListId: null })).toBe('review');
  });
});

describe('postedIdsOf', () => {
  it('reads the stored ids and survives bad JSON', () => {
    expect(postedIdsOf('["a","b"]')).toEqual(['a', 'b']);
    expect(postedIdsOf('oops')).toEqual([]);
  });
});
