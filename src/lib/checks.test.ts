import { describe, expect, it } from 'vitest';
import { checksMarkdown, cleanOutput, failingNames, mergeChecks, outputTail, overallStatus, suggestChecks, type RepoCheckSources } from './checks';

const repo = (over: Partial<RepoCheckSources>): RepoCheckSources => ({
  files: [],
  packageManager: 'npm',
  packageJson: null,
  makefile: null,
  pyproject: null,
  ...over,
});

const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: 'site', scripts });

describe('suggestChecks', () => {
  it('suggests typecheck, lint and tests from package.json scripts, fastest first', () => {
    const checks = suggestChecks(repo({ packageJson: pkg({ test: 'vitest run', lint: 'eslint', typecheck: 'tsc --noEmit', dev: 'next dev' }) }));
    expect(checks).toEqual([
      { name: 'Typecheck', command: 'npm run typecheck', timeoutMin: 10 },
      { name: 'Lint', command: 'npm run lint', timeoutMin: 10 },
      { name: 'Tests', command: 'npm test', timeoutMin: 10 },
    ]);
  });

  it('uses the package manager of the lockfile, and never `bun test` for a script', () => {
    expect(suggestChecks(repo({ packageManager: 'pnpm', packageJson: pkg({ 'type-check': 'tsc', test: 'jest' }) })).map((c) => c.command)).toEqual([
      'pnpm run type-check',
      'pnpm test',
    ]);
    expect(suggestChecks(repo({ packageManager: 'bun', packageJson: pkg({ test: 'vitest run' }) }))[0]!.command).toBe('bun run test');
  });

  it('skips watch scripts and npm’s placeholder test script', () => {
    const checks = suggestChecks(repo({ packageJson: pkg({ test: 'echo "Error: no test specified" && exit 1', lint: 'eslint --watch' }) }));
    expect(checks).toEqual([]);
    expect(suggestChecks(repo({ packageJson: pkg({ test: 'jest --watch', 'test:ci': 'jest --ci' }) }))[0]!.command).toBe('npm run test:ci');
  });

  it.each(['jest --watchAll', 'vitest --watch=true', 'vitest watch', 'tsc -w', 'npm run test:watch', 'vitest --watch --coverage'])(
    'treats `%s` as watch mode',
    (test) => {
      expect(suggestChecks(repo({ packageJson: pkg({ test }) }))).toEqual([]);
    },
  );

  it.each(['vitest --watch=false', 'jest --watchAll=false', 'vitest run --no-watch', 'jest -w 4', 'jest --ci', 'node scripts/watchdog-test.js'])(
    'keeps `%s`, which ends on its own',
    (test) => {
      expect(suggestChecks(repo({ packageJson: pkg({ test }) })).map((c) => c.command)).toEqual(['npm test']);
    },
  );

  it('falls back to Makefile targets, then pyproject tools', () => {
    const makefile = '.PHONY: lint test\nVAR := 1\nlint:\n\truff check .\ntest: deps\n\tpytest\n';
    expect(suggestChecks(repo({ makefile })).map((c) => c.command)).toEqual(['make lint', 'make test']);

    const pyproject = '[project]\ndependencies = ["fastapi"]\n[dependency-groups]\ndev = ["pytest>=8", "mypy"]\n[tool.ruff]\nline-length = 100\n';
    expect(suggestChecks(repo({ pyproject, files: ['uv.lock'] })).map((c) => c.command)).toEqual(['uv run mypy .', 'uv run ruff check .', 'uv run pytest']);
    expect(suggestChecks(repo({ pyproject: '[tool.pytest.ini_options]\naddopts = "-q"\n' })).map((c) => c.command)).toEqual(['pytest']);
  });

  it('prefers package.json over the Makefile for the same kind of check', () => {
    const checks = suggestChecks(repo({ packageJson: pkg({ lint: 'eslint' }), makefile: 'lint:\n\tnpm run lint\ntest:\n\tgo test ./...\n' }));
    expect(checks.map((c) => c.command)).toEqual(['npm run lint', 'make test']);
  });

  it('ignores a package.json it cannot read', () => {
    expect(suggestChecks(repo({ packageJson: '{ not json' }))).toEqual([]);
  });
});

describe('mergeChecks', () => {
  it('adds only the suggestions whose command is not configured yet', () => {
    const current = [{ name: 'Unit tests', command: 'npm test', timeoutMin: 5 }];
    const merged = mergeChecks(current, [
      { name: 'Lint', command: 'npm run lint', timeoutMin: 10 },
      { name: 'Tests', command: 'npm test', timeoutMin: 10 },
    ]);
    expect(merged).toEqual([current[0], { name: 'Lint', command: 'npm run lint', timeoutMin: 10 }]);
  });
});

describe('overallStatus', () => {
  it('fails on a failure or a timeout, and says when the run was stopped', () => {
    expect(overallStatus(['PASSED', 'PASSED'], false)).toBe('PASSED');
    expect(overallStatus(['PASSED', 'TIMED_OUT'], false)).toBe('FAILED');
    expect(overallStatus(['FAILED', 'SKIPPED'], true)).toBe('STOPPED');
  });
});

describe('output for Claude', () => {
  it('drops colours and progress-bar redraws', () => {
    expect(cleanOutput('\u001b[31mFAIL\u001b[39m src/a.test.ts\n10%\r50%\r100%')).toBe('FAIL src/a.test.ts\n100%');
  });

  it('keeps the end of long output and says it was trimmed', () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const tail = outputTail(text, { maxLines: 5 });
    expect(tail).toBe('… (earlier output trimmed)\nline 195\nline 196\nline 197\nline 198\nline 199');
    expect(outputTail('short\noutput\n')).toBe('short\noutput');
    const wide = outputTail(`${'x'.repeat(50)}\n${'y'.repeat(50)}`, { maxChars: 60 });
    expect(wide).toBe(`… (earlier output trimmed)\n${'y'.repeat(50)}`);
  });
});

describe('checks for review', () => {
  const checks = [
    { name: 'Typecheck', status: 'PASSED' as const },
    { name: 'Tests', status: 'FAILED' as const },
    { name: 'E2E', status: 'TIMED_OUT' as const },
  ];

  it('names the failing checks and lists them for the pull request', () => {
    expect(failingNames(checks)).toBe('Tests, E2E');
    expect(checksMarkdown('FAILED', checks)).toBe('## Checks: failing\n- Typecheck: passed\n- Tests: failed\n- E2E: timed out');
  });
});
