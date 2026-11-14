import { describe, expect, it } from 'vitest';
import { maskSecret } from '~/server/presenters/settings.presenter';
import { describeSync } from '~/lib/sync';
import { projectBody } from './project';
import { updateSettingsBody } from './settings';

describe('updateSettingsBody', () => {
  it('accepts a preferences-only update', () => {
    expect(updateSettingsBody.parse({ pollIntervalSec: '300' })).toEqual({ pollIntervalSec: 300 });
  });

  it('requires the key and the token together', () => {
    expect(updateSettingsBody.safeParse({ trelloApiKey: 'abc' }).success).toBe(false);
    expect(updateSettingsBody.safeParse({ trelloApiKey: 'abc', trelloToken: 'def' }).success).toBe(true);
  });

  it('bounds the poll interval', () => {
    expect(updateSettingsBody.safeParse({ pollIntervalSec: 10 }).success).toBe(false);
    expect(updateSettingsBody.safeParse({ pollIntervalSec: 7200 }).success).toBe(false);
  });
});

describe('projectBody', () => {
  const repo = { repoPath: '', baseBranch: 'main', setupCommand: '', extraInstructions: '', workMode: 'BRANCH_PER_CARD' as const, sharedBranch: '', sharedInRepo: true, trelloInProgressListId: null, trelloReviewListId: null, trelloDoneListId: null, trelloNeedsInfoListId: null };

  it('explains a missing board before an invalid id', () => {
    const result = projectBody.safeParse({ ...repo, name: 'Site', trelloBoardId: '', trelloSourceListId: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((i) => i.path[0] === 'trelloBoardId')?.message).toBe('Pick a Trello board');
  });

  it('accepts Trello ids', () => {
    const id = '5abbe4b7ddc1b351ef961414';
    expect(projectBody.parse({ ...repo, name: ' Site ', trelloBoardId: id, trelloSourceListId: id }).name).toBe('Site');
  });
});

describe('maskSecret', () => {
  it('keeps only the last four characters', () => {
    expect(maskSecret('abcdefghijklmnop')).toBe('••••mnop');
    expect(maskSecret('short')).toBe('••••');
    expect(maskSecret(null)).toBeNull();
  });
});

describe('describeSync', () => {
  it('summarises a sync', () => {
    expect(describeSync({ added: 2, updated: 1, removed: 0 })).toBe('2 new cards · 1 updated');
    expect(describeSync({ added: 1, updated: 0, removed: 1 })).toBe('1 new card · 1 removed from Trello');
    expect(describeSync({ added: 0, updated: 0, removed: 0 })).toBe('Already up to date');
  });
});
