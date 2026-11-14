import 'server-only';
import { GitError, simpleGit } from 'simple-git';
import { HttpError } from '~/server/http/errors';
import { githubRepoFromRemote } from './remote';

// Git must never wait for a password prompt on the server's terminal: fail
// fast and show the error instead. Pushes use the developer's own SSH key or
// credential helper (spec §8.4).
process.env.GIT_TERMINAL_PROMPT = '0';

/** simple-git bound to a folder, with a timeout so a stuck command can't hang a request. */
export function gitAt(baseDir: string, timeoutMs = 120_000) {
  return simpleGit({ baseDir, timeout: { block: timeoutMs } });
}

/** The useful part of a git error: its last lines of stderr. */
export function gitErrorText(error: unknown): string {
  const raw = error instanceof GitError || error instanceof Error ? error.message : String(error);
  const lines = raw
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);
  return lines.slice(-8).join('\n') || 'Unknown git error';
}

/** Git errors are shown verbatim (spec §8.4), prefixed with what we were doing. */
export function gitFail(action: string, error: unknown) {
  return new HttpError(422, `${action} failed.\n${gitErrorText(error)}`, 'GIT_ERROR');
}

/** Runs a git command and returns trimmed stdout, or null if it fails. */
export async function gitTry(baseDir: string, args: string[]): Promise<string | null> {
  try {
    return (await gitAt(baseDir, 30_000).raw(args)).trim();
  } catch {
    return null;
  }
}

/**
 * The origin's GitHub owner/repo. Reads the URL as configured first (an
 * `insteadOf` rewrite can hide it), then as git expands it.
 */
export async function originGithub(dir: string) {
  const raw = await gitTry(dir, ['config', '--get', 'remote.origin.url']);
  const expanded = await gitTry(dir, ['remote', 'get-url', 'origin']);
  return { url: raw ?? expanded, github: githubRepoFromRemote(raw) ?? githubRepoFromRemote(expanded) };
}
