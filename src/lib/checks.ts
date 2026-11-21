import { z } from 'zod';

/**
 * Checks before review: the project's own commands (typecheck, lint, tests…)
 * that Ticket2PR runs in the card's folder after Claude finishes. A failing
 * check goes back to Claude with its output (auto-fix rounds); still failing,
 * the card reaches Review flagged. Pure, so the suggestions are unit-tested.
 */
export const MAX_CHECKS = 8;
export const MAX_FIX_ROUNDS = 5;
export const DEFAULT_CHECK_TIMEOUT_MIN = 10;
export const MAX_CHECK_TIMEOUT_MIN = 120;

/** One check (`RunCheck.status`). SKIPPED: not run, because the run was stopped or the folder couldn't be prepared. */
export const CHECK_STATUSES = ['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'TIMED_OUT', 'SKIPPED'] as const;
export const checkStatusSchema = z.enum(CHECK_STATUSES);
export type CheckStatus = z.infer<typeof checkStatusSchema>;

/** All the checks of a run, and the card's latest (`Run.checksStatus`, `Card.checksStatus`). */
export const CHECKS_STATUSES = ['RUNNING', 'PASSED', 'FAILED', 'STOPPED'] as const;
export const checksStatusSchema = z.enum(CHECKS_STATUSES);
export type ChecksStatus = z.infer<typeof checksStatusSchema>;

export const checkConfigSchema = z.object({
  name: z.string().trim().min(1, 'Name the check').max(40, 'Keep it under 40 characters'),
  command: z.string().trim().min(1, 'Type the command').max(500, 'Keep it under 500 characters'),
  timeoutMin: z
    .number({ error: 'Give a number of minutes' })
    .int('Whole minutes')
    .min(1, 'At least 1 minute')
    .max(MAX_CHECK_TIMEOUT_MIN, `At most ${MAX_CHECK_TIMEOUT_MIN} minutes`),
});
export type CheckConfig = z.infer<typeof checkConfigSchema>;
export const checkConfigsSchema = z.array(checkConfigSchema).max(MAX_CHECKS, `${MAX_CHECKS} checks at most`);

/** The card's latest checks, for the board (`Card.checksJson`). */
export const checkSummarySchema = z.array(z.object({ name: z.string(), status: checkStatusSchema }));
export type CheckSummary = z.infer<typeof checkSummarySchema>;

/** A failing check: the run goes back to Claude, or the card is flagged. */
export const isCheckFailure = (status: CheckStatus) => status === 'FAILED' || status === 'TIMED_OUT';

/** Everything that ran passed; a stopped run counts as stopped, whatever ran before. */
export function overallStatus(statuses: CheckStatus[], stopped: boolean): Exclude<ChecksStatus, 'RUNNING'> {
  if (stopped) return 'STOPPED';
  return statuses.some(isCheckFailure) ? 'FAILED' : 'PASSED';
}

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  PENDING: 'Waiting',
  RUNNING: 'Running',
  PASSED: 'Passed',
  FAILED: 'Failed',
  TIMED_OUT: 'Timed out',
  SKIPPED: 'Skipped',
};

// ─── Suggestions from the repository ──────────────────────────────────────

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type RepoCheckSources = {
  /** File names at the repository root. */
  files: string[];
  packageManager: PackageManager;
  packageJson: string | null;
  makefile: string | null;
  pyproject: string | null;
};

type Kind = 'typecheck' | 'lint' | 'test';
const KINDS: { kind: Kind; name: string; scripts: string[] }[] = [
  { kind: 'typecheck', name: 'Typecheck', scripts: ['typecheck', 'type-check', 'types', 'tsc', 'check-types'] },
  { kind: 'lint', name: 'Lint', scripts: ['lint'] },
  { kind: 'test', name: 'Tests', scripts: ['test', 'test:unit', 'test:ci'] },
];

/** `npm test`, `pnpm run lint`… (`bun test` would run Bun's own runner, not the script). */
function scriptCommand(pm: PackageManager, script: string) {
  if (script === 'test' && pm !== 'bun') return `${pm} test`;
  return `${pm} run ${script}`;
}

/**
 * Watch mode turned on: `--watch`, `--watchAll` (not `=false`), `-w` (not
 * Jest's `-w 4` workers), or a bare `watch` (`vitest watch`, `test:watch`).
 * `--no-watch` and `--watch=false` force a single run and are fine.
 */
const WATCH_ON = /--watch(?:All)?(?![\w-])(?!=(?:false|0)\b)|(?:^|\s)-w(?![\w-])(?!\s*=?\s*\d)|(?:^|[\s:;&|'"])watch(?![\w-])/;

/** Scripts that never end on their own, or npm's placeholder that always fails. */
function usableScript(body: string) {
  return !WATCH_ON.test(body) && !/no test specified/i.test(body);
}

function fromPackageJson(source: string | null, pm: PackageManager): Partial<Record<Kind, string>> {
  if (!source) return {};
  let scripts: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(source) as { scripts?: Record<string, unknown> };
    scripts = parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  } catch {
    return {};
  }
  const out: Partial<Record<Kind, string>> = {};
  for (const { kind, scripts: names } of KINDS) {
    const script = names.find((n) => typeof scripts[n] === 'string' && usableScript(scripts[n] as string));
    if (script) out[kind] = scriptCommand(pm, script);
  }
  return out;
}

function fromMakefile(source: string | null): Partial<Record<Kind, string>> {
  if (!source) return {};
  const targets = new Set(
    source
      .split('\n')
      .map((line) => line.match(/^([A-Za-z0-9_.-]+)\s*:(?!=)/)?.[1])
      .filter((t): t is string => Boolean(t)),
  );
  const pick = (names: string[]) => names.find((n) => targets.has(n));
  const out: Partial<Record<Kind, string>> = {};
  const typecheck = pick(['typecheck', 'type-check', 'types', 'mypy']);
  const lint = pick(['lint']);
  const test = pick(['test', 'tests']);
  if (typecheck) out.typecheck = `make ${typecheck}`;
  if (lint) out.lint = `make ${lint}`;
  if (test) out.test = `make ${test}`;
  return out;
}

/** Ruff, mypy and pytest configured in pyproject.toml, through uv or Poetry when the project uses them. */
function fromPyproject(source: string | null, files: string[]): Partial<Record<Kind, string>> {
  if (!source) return {};
  const prefix = files.includes('uv.lock') ? 'uv run ' : files.includes('poetry.lock') ? 'poetry run ' : '';
  const has = (re: RegExp) => re.test(source);
  const out: Partial<Record<Kind, string>> = {};
  if (has(/^\[tool\.mypy\]/m) || has(/["']mypy[\s"'<>=~^]/)) out.typecheck = `${prefix}mypy .`;
  else if (has(/^\[tool\.pyright\]/m)) out.typecheck = `${prefix}pyright`;
  if (has(/^\[tool\.ruff/m) || has(/["']ruff[\s"'<>=~^]/)) out.lint = `${prefix}ruff check .`;
  if (has(/^\[tool\.pytest/m) || has(/["']pytest[\s"'<>=~^]/)) out.test = `${prefix}pytest`;
  return out;
}

/**
 * Typecheck, lint and tests, from package.json scripts first, then the
 * Makefile, then pyproject.toml. Fast checks first, so failures show early.
 */
export function suggestChecks(sources: RepoCheckSources): CheckConfig[] {
  const found = [
    fromPackageJson(sources.packageJson, sources.packageManager),
    fromMakefile(sources.makefile),
    fromPyproject(sources.pyproject, sources.files),
  ];
  return KINDS.flatMap(({ kind, name }) => {
    const command = found.map((f) => f[kind]).find(Boolean);
    return command ? [{ name, command, timeoutMin: DEFAULT_CHECK_TIMEOUT_MIN }] : [];
  });
}

/** Adds suggested checks whose command isn't configured yet. */
export function mergeChecks(current: CheckConfig[], suggested: CheckConfig[]): CheckConfig[] {
  const commands = new Set(current.map((c) => c.command.trim()));
  return [...current, ...suggested.filter((s) => !commands.has(s.command))].slice(0, MAX_CHECKS);
}

// ─── Output for Claude ─────────────────────────────────────────────────────

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

/** Terminal colours and carriage-return progress bars out, so the text reads like a log. */
export function cleanOutput(text: string) {
  return text
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.split('\r').filter(Boolean).at(-1) ?? '')
    .join('\n');
}

/** The end of a command's output: the last `maxLines` lines, at most `maxChars` characters. */
export function outputTail(text: string, { maxLines = 80, maxChars = 6000 } = {}) {
  const lines = cleanOutput(text).replace(/^(\s*\n)+/, '').trimEnd().split('\n');
  let tail = lines.slice(-maxLines).join('\n');
  let cut = lines.length > maxLines;
  if (tail.length > maxChars) {
    tail = tail.slice(-maxChars);
    tail = tail.slice(tail.indexOf('\n') + 1);
    cut = true;
  }
  return cut ? `… (earlier output trimmed)\n${tail}` : tail;
}

/** The checks for a pull request description. */
export function checksMarkdown(status: ChecksStatus, checks: CheckSummary) {
  const title = status === 'PASSED' ? 'passed' : status === 'FAILED' ? 'failing' : status === 'STOPPED' ? 'stopped before the end' : 'running';
  return [`## Checks: ${title}`, ...checks.map((c) => `- ${c.name}: ${CHECK_STATUS_LABEL[c.status].toLowerCase()}`)].join('\n');
}

/** The names of the failing checks: "Tests, Lint". */
export const failingNames = (checks: CheckSummary) =>
  checks
    .filter((c) => isCheckFailure(c.status))
    .map((c) => c.name)
    .join(', ');
