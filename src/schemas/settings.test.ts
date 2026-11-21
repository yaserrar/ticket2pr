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
  const repo = { repoPath: '', baseBranch: 'main', setupCommand: '', extraInstructions: '', workMode: 'BRANCH_PER_CARD' as const, sharedBranch: '', sharedInRepo: true, trelloInProgressListId: null, trelloReviewListId: null, trelloDoneListId: null, trelloNeedsInfoListId: null, scopeCheck: false, scopeRules: '', trelloOutOfScopeListId: null, riskPaths: '', previewEnabled: false, previewCommand: '', previewUrl: '', checksEnabled: false, checks: [], checksAutoFix: true, checksMaxFixRounds: 2 };

  it('explains a missing board before an invalid id', () => {
    const result = projectBody.safeParse({ ...repo, name: 'Site', trelloBoardId: '', trelloSourceListId: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.find((i) => i.path[0] === 'trelloBoardId')?.message).toBe('Pick a Trello board');
  });

  it('accepts Trello ids', () => {
    const id = '5abbe4b7ddc1b351ef961414';
    expect(projectBody.parse({ ...repo, name: ' Site ', trelloBoardId: id, trelloSourceListId: id }).name).toBe('Site');
  });

  it('needs a start command for screenshots, and a local app address', () => {
    const id = '5abbe4b7ddc1b351ef961414';
    const base = { ...repo, name: 'Site', trelloBoardId: id, trelloSourceListId: id };
    const noCommand = projectBody.safeParse({ ...base, previewEnabled: true });
    expect(noCommand.error?.issues[0]?.path).toEqual(['previewCommand']);
    expect(projectBody.safeParse({ ...base, previewEnabled: true, previewCommand: 'npm run dev', previewUrl: 'https://example.com' }).success).toBe(false);
    expect(projectBody.safeParse({ ...base, previewEnabled: true, previewCommand: 'npm run dev', previewUrl: 'http://localhost:$PORT/app' }).success).toBe(true);
  });

  it('needs at least one check when checks are on, each with a name, a command and a timeout', () => {
    const id = '5abbe4b7ddc1b351ef961414';
    const base = { ...repo, name: 'Site', trelloBoardId: id, trelloSourceListId: id };
    expect(projectBody.safeParse({ ...base, checksEnabled: true }).error?.issues[0]?.path).toEqual(['checks']);
    const check = { name: 'Tests', command: 'npm test', timeoutMin: 10 };
    expect(projectBody.safeParse({ ...base, checksEnabled: true, checks: [check] }).success).toBe(true);
    const bad = projectBody.safeParse({ ...base, checksEnabled: true, checks: [{ ...check, command: ' ', timeoutMin: 0 }] });
    expect(bad.error?.issues.map((i) => i.path.join('.'))).toEqual(['checks.0.command', 'checks.0.timeoutMin']);
    expect(projectBody.safeParse({ ...base, checksMaxFixRounds: 9 }).success).toBe(false);
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
