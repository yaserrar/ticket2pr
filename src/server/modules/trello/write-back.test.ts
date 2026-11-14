import { describe, expect, it } from 'vitest';
import { postedIdsOf, targetList } from './write-back.service';

const lists = {
  trelloSourceListId: 'source',
  trelloInProgressListId: 'doing',
  trelloReviewListId: 'review',
  trelloDoneListId: 'done',
  trelloNeedsInfoListId: 'needs-info',
};

describe('targetList', () => {
  it('maps each status to its list, and waiting cards to "Needs info"', () => {
    expect(targetList({ status: 'IN_PROGRESS', waitingSince: null }, lists)).toBe('doing');
    expect(targetList({ status: 'REVIEW', waitingSince: null }, lists)).toBe('review');
    expect(targetList({ status: 'REVIEW', waitingSince: new Date() }, lists)).toBe('needs-info');
    expect(targetList({ status: 'DONE', waitingSince: null }, lists)).toBe('done');
    expect(targetList({ status: 'NEW', waitingSince: null }, lists)).toBe('source');
  });

  it('leaves cards alone when no list is set', () => {
    const none = { trelloSourceListId: 'source', trelloInProgressListId: null, trelloReviewListId: null, trelloDoneListId: null, trelloNeedsInfoListId: null };
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
