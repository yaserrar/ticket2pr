/**
 * What Claude may do unattended in a card's worktree (spec §7.3). Pure, so it
 * is unit-tested.
 *
 * - File edits inside the worktree: approved by the `acceptEdits` mode, which
 *   only covers the working directory. Edit/Write/Read are deliberately NOT
 *   allow-listed by name: a bare allow rule would also approve paths outside
 *   the worktree (e.g. ~/.ssh).
 * - Allowed shell commands: the project's own test / lint / typecheck / build
 *   scripts, with the package manager its lockfile implies, and read-only git.
 * - Denied in every mode (deny rules win over project settings too): commit,
 *   push and other branch-changing git, network tools, web tools, questions.
 * - Anything else that would need approval is refused by `canUseTool`.
 */
import type { PackageManager } from '~/lib/checks';

export type { PackageManager };

const SAFE_SCRIPTS = ['test', 'test:unit', 'lint', 'lint:fix', 'typecheck', 'type-check', 'check', 'build', 'format', 'format:check'];

const READ_ONLY_GIT = ['git status', 'git diff', 'git log', 'git show', 'git blame', 'git ls-files'];

const DIRECT_TOOLS = ['npx tsc', 'npx eslint', 'npx prettier', 'npx vitest', 'npx jest', 'npx biome'];

export const DENIED_TOOLS = [
  'WebFetch',
  'WebSearch',
  'AskUserQuestion',
  'Bash(git commit*)',
  'Bash(git push*)',
  'Bash(git config*)',
  'Bash(git remote*)',
  'Bash(git checkout*)',
  'Bash(git switch*)',
  'Bash(git branch*)',
  'Bash(git reset*)',
  'Bash(git rebase*)',
  'Bash(git merge*)',
  'Bash(git worktree*)',
  'Bash(git tag*)',
  'Bash(curl*)',
  'Bash(wget*)',
  'Bash(ssh*)',
  'Bash(scp*)',
  'Bash(sudo*)',
  'Bash(npm publish*)',
];

export function detectPackageManager(files: string[]): PackageManager {
  if (files.includes('pnpm-lock.yaml')) return 'pnpm';
  if (files.includes('yarn.lock')) return 'yarn';
  if (files.includes('bun.lockb') || files.includes('bun.lock')) return 'bun';
  return 'npm';
}

export function buildToolPolicy(input: { scripts: string[]; packageManager: PackageManager }) {
  const pm = input.packageManager;
  const scripts = input.scripts.filter((s) => SAFE_SCRIPTS.includes(s));
  const scriptRules = scripts.flatMap((s) => {
    const rules = [`Bash(${pm} run ${s}*)`];
    if (s === 'test') rules.push(`Bash(${pm} test*)`);
    return rules;
  });
  return {
    allowedTools: [
      ...scriptRules,
      ...DIRECT_TOOLS.map((t) => `Bash(${t}*)`),
      ...READ_ONLY_GIT.map((t) => `Bash(${t}*)`),
    ],
    disallowedTools: DENIED_TOOLS,
    /** Shown in the run log so the reviewer knows what the agent could run. */
    allowedScripts: scripts.map((s) => (s === 'test' ? `${pm} test` : `${pm} run ${s}`)),
  };
}

/** The message Claude gets when a tool call is refused, so it adapts instead of waiting. */
export function denialMessage(toolName: string, input: Record<string, unknown>) {
  const target = typeof input.command === 'string' ? ` (${input.command.slice(0, 200)})` : typeof input.file_path === 'string' ? ` (${input.file_path})` : '';
  return (
    `Ticket2PR runs you unattended and refused ${toolName}${target}. ` +
    'Allowed: editing files inside this worktree, read-only git, and the project’s test, lint, typecheck and build scripts. ' +
    'Continue without it, and mention in your summary anything the reviewer needs to do by hand.'
  );
}
