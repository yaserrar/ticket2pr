import { describe, expect, it } from 'vitest';
import type { CardStatus } from '~/schemas/common';
import { CARD_STATUSES } from '~/schemas/common';
import { planMove, positionBetween, type MoveContext } from './workflow';

const ctx = (from: CardStatus, to: CardStatus, extra: Partial<MoveContext> = {}): MoveContext => ({
  from,
  to,
  hasActiveRun: false,
  hasWork: false,
  prOpened: false,
  repoConfigured: true,
  ...extra,
});

describe('planMove', () => {
  it('reorders inside a column', () => {
    for (const s of CARD_STATUSES) expect(planMove(ctx(s, s)).kind).toBe('reorder');
  });

  it('starts work from New when a repository is set', () => {
    expect(planMove(ctx('NEW', 'IN_PROGRESS')).kind).toBe('start');
    expect(planMove(ctx('NEW', 'IN_PROGRESS', { repoConfigured: false }))).toMatchObject({ kind: 'invalid' });
  });

  it('allows manual review only without an active run', () => {
    expect(planMove(ctx('IN_PROGRESS', 'REVIEW')).kind).toBe('review');
    expect(planMove(ctx('IN_PROGRESS', 'REVIEW', { hasActiveRun: true })).kind).toBe('invalid');
  });

  it('discards back to New, confirming only when something is lost', () => {
    expect(planMove(ctx('IN_PROGRESS', 'NEW'))).toEqual({ kind: 'discard', confirm: null });
    const plan = planMove(ctx('REVIEW', 'NEW', { hasWork: true, hasActiveRun: true }));
    expect(plan.kind).toBe('discard');
    expect(plan.kind === 'discard' && plan.confirm).toMatch(/stops the current run and deletes the branch/);
  });

  it('on a shared branch, discard keeps the branch and Done needs no PR', () => {
    const plan = planMove(ctx('REVIEW', 'NEW', { hasWork: true, sharedBranch: true }));
    expect(plan.kind === 'discard' && plan.confirm).toMatch(/uncommitted changes on the shared branch/);
    expect(plan.kind === 'discard' && plan.confirm).not.toMatch(/deletes/);
    expect(planMove(ctx('REVIEW', 'DONE', { sharedBranch: true }))).toEqual({ kind: 'done', confirm: null });
  });

  it('routes Review → In progress to "Request changes"', () => {
    expect(planMove(ctx('REVIEW', 'IN_PROGRESS')).kind).toBe('request-changes');
  });

  it('confirms Done without a pull request', () => {
    expect(planMove(ctx('REVIEW', 'DONE', { prOpened: true }))).toEqual({ kind: 'done', confirm: null });
    expect(planMove(ctx('REVIEW', 'DONE'))).toMatchObject({ kind: 'done', confirm: expect.any(String) });
    expect(planMove(ctx('DONE', 'REVIEW')).kind).toBe('reopen');
  });

  it('rejects every other move', () => {
    const rejected: [CardStatus, CardStatus][] = [
      ['NEW', 'REVIEW'],
      ['NEW', 'DONE'],
      ['IN_PROGRESS', 'DONE'],
      ['DONE', 'NEW'],
      ['DONE', 'IN_PROGRESS'],
    ];
    for (const [from, to] of rejected) expect(planMove(ctx(from, to)).kind).toBe('invalid');
  });
});

describe('positionBetween', () => {
  it('places cards between, after, before or alone', () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionBetween(1000)).toBe(2000);
    expect(positionBetween(undefined, 1000)).toBe(0);
    expect(positionBetween()).toBe(1000);
  });
});
