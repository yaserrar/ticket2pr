import 'server-only';
import { z } from 'zod';
import { env } from '~/server/config/env';
import { HttpError } from '~/server/http/errors';

/**
 * Opens pull requests through the GitHub REST API when a token is saved
 * (spec §8.5). Plain fetch: one endpoint doesn't justify Octokit.
 */
const prSchema = z.object({ html_url: z.string(), number: z.number() });
const userSchema = z.object({ login: z.string() });

async function github(token: string, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${env.GITHUB_API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
  } catch {
    throw new HttpError(502, 'Could not reach GitHub. Check your internet connection.', 'GITHUB_ERROR');
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.status === 401) throw new HttpError(422, 'GitHub rejected the token. Check it in Settings.', 'GITHUB_UNAUTHORIZED');
  return { res, json };
}

function githubMessage(json: unknown) {
  const body = json as { message?: string; errors?: { message?: string }[] } | null;
  return [body?.message, ...(body?.errors?.map((e) => e.message) ?? [])].filter(Boolean).join(': ');
}

export async function githubLogin(token: string) {
  const { res, json } = await github(token, '/user');
  if (!res.ok) throw new HttpError(422, `GitHub refused the token (${res.status}).`, 'GITHUB_UNAUTHORIZED');
  return userSchema.parse(json).login;
}

/** Creates the PR, or returns the open one if it already exists for this branch. */
export async function openPullRequest(input: {
  token: string;
  owner: string;
  repo: string;
  head: string;
  base: string;
  title: string;
  body: string;
}): Promise<string> {
  const { token, owner, repo, head, base, title, body } = input;
  const { res, json } = await github(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, body, head, base }),
  });
  if (res.ok) return prSchema.parse(json).html_url;

  if (res.status === 422 && /already exists/i.test(githubMessage(json))) {
    const existing = await github(token, `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${head}`)}`);
    const list = z.array(prSchema).safeParse(existing.json);
    if (list.success && list.data[0]) return list.data[0].html_url;
  }
  if (res.status === 404) {
    throw new HttpError(422, `GitHub can't see ${owner}/${repo} with this token. Give it access to the repository.`, 'GITHUB_ERROR');
  }
  throw new HttpError(422, `GitHub refused the pull request. ${githubMessage(json) || res.statusText}`, 'GITHUB_ERROR');
}

/** Adds labels to a pull request (GitHub creates missing labels). */
export async function addLabels(token: string, owner: string, repo: string, prUrl: string, labels: string[]) {
  const number = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!number) return;
  const { res, json } = await github(token, `/repos/${owner}/${repo}/issues/${number}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels }),
  });
  if (!res.ok) throw new HttpError(422, `GitHub refused the labels. ${githubMessage(json) || res.statusText}`, 'GITHUB_ERROR');
}
