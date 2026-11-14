import { describe, expect, it } from 'vitest';
import { buildToolPolicy, denialMessage, detectPackageManager, DENIED_TOOLS } from './tool-policy';

describe('detectPackageManager', () => {
  it('follows the lockfile', () => {
    expect(detectPackageManager(['package.json', 'pnpm-lock.yaml'])).toBe('pnpm');
    expect(detectPackageManager(['yarn.lock'])).toBe('yarn');
    expect(detectPackageManager(['bun.lock'])).toBe('bun');
    expect(detectPackageManager(['package-lock.json'])).toBe('npm');
    expect(detectPackageManager([])).toBe('npm');
  });
});

describe('buildToolPolicy', () => {
  const policy = buildToolPolicy({ scripts: ['dev', 'test', 'lint', 'build', 'deploy'], packageManager: 'pnpm' });

  it('allows only safe project scripts, with the right package manager', () => {
    expect(policy.allowedTools).toEqual(
      expect.arrayContaining(['Bash(pnpm run test*)', 'Bash(pnpm test*)', 'Bash(pnpm run lint*)', 'Bash(pnpm run build*)']),
    );
    expect(policy.allowedTools.join(' ')).not.toMatch(/deploy|run dev/);
    expect(policy.allowedScripts).toEqual(['pnpm test', 'pnpm run lint', 'pnpm run build']);
  });

  it('allows read-only git but never commit or push', () => {
    expect(policy.allowedTools).toContain('Bash(git diff*)');
    expect(policy.allowedTools.join(' ')).not.toMatch(/git (commit|push)/);
    expect(policy.disallowedTools).toEqual(expect.arrayContaining(['Bash(git commit*)', 'Bash(git push*)', 'Bash(git config*)']));
  });

  it('never allow-lists file tools by name (that would reach outside the worktree)', () => {
    for (const tool of ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash']) expect(policy.allowedTools).not.toContain(tool);
  });

  it('blocks network and web tools', () => {
    expect(DENIED_TOOLS).toEqual(expect.arrayContaining(['WebFetch', 'WebSearch', 'Bash(curl*)', 'Bash(wget*)', 'Bash(ssh*)']));
  });
});

describe('denialMessage', () => {
  it('names the refused call and what is allowed', () => {
    const msg = denialMessage('Bash', { command: 'npm install axios' });
    expect(msg).toContain('Bash (npm install axios)');
    expect(msg).toMatch(/Continue without it/);
  });
});
