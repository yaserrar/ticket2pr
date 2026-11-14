import 'server-only';
import os from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { env } from '~/server/config/env';
import { logger } from '~/server/config/logger';
import type { ClaudeStatusDto } from '~/types/claude';

/**
 * Claude Code through the Agent SDK, signed in with the developer's own
 * Claude subscription (the `claude` /login), never an API key: the key
 * variables are removed from the environment Claude Code starts with.
 */
export function claudeEnv(): Record<string, string | undefined> {
  const vars: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'ticket2pr' };
  delete vars.ANTHROPIC_API_KEY;
  delete vars.ANTHROPIC_AUTH_TOKEN;
  return vars;
}

export const claudeExecutable = () => env.CLAUDE_CODE_PATH;

const SIGN_IN_HELP = 'Open a terminal, run `claude`, type /login and sign in with your Claude account. Then check again.';

/** Turns SDK/CLI failures into something a developer can act on. */
export function explainClaudeError(raw: string): string {
  if (/not logged in|please run \/login|authentication_failed|invalid api key|oauth|401/i.test(raw)) {
    return `Claude Code is not signed in. ${SIGN_IN_HELP}`;
  }
  if (/rate_limit|usage limit|limit reached|429/i.test(raw)) return 'Your Claude usage limit is reached. Try again when it resets.';
  if (/overloaded|529/i.test(raw)) return 'Claude is overloaded right now. Try again in a few minutes.';
  if (/Native CLI binary .* not found|ENOENT/i.test(raw)) {
    return 'The Claude Code binary was not found. Reinstall dependencies (npm install) or set CLAUDE_CODE_PATH.';
  }
  return raw;
}

const STATUS_TTL_MS = 5 * 60_000;
const g = globalThis as unknown as { t2pClaudeStatus?: { at: number; value: ClaudeStatusDto } };

/**
 * Starts Claude Code, completes the initialize handshake and reads the account,
 * then closes it. No prompt is sent, so it uses nothing from the plan.
 * Cached for 5 minutes.
 */
export async function claudeStatus({ refresh = false } = {}): Promise<ClaudeStatusDto> {
  const cached = g.t2pClaudeStatus;
  if (!refresh && cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.value;

  const base = { runner: env.RUNNER, checkedAt: new Date().toISOString() } as const;
  let release: () => void = () => undefined;
  const idle = new Promise<void>((resolve) => (release = resolve));
  async function* noPrompt(): AsyncGenerator<never> {
    await idle;
  }

  let value: ClaudeStatusDto;
  const q = query({
    prompt: noPrompt(),
    options: {
      cwd: os.tmpdir(),
      env: claudeEnv(),
      settingSources: [],
      strictMcpConfig: true,
      pathToClaudeCodeExecutable: claudeExecutable(),
    },
  });
  try {
    const init = await Promise.race([
      q.initializationResult(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Claude Code did not start within 30 seconds.')), 30_000)),
    ]);
    const account = init.account ?? {};
    const signedIn = Boolean(account.email || account.subscriptionType || account.tokenSource);
    value = {
      ...base,
      ok: signedIn,
      email: account.email ?? null,
      subscriptionType: account.subscriptionType ?? null,
      usingSubscription: !account.apiKeySource || account.apiKeySource === 'none',
      claudeCodeVersion: init.claude_code_version ?? null,
      models: (init.models ?? []).map((m) => m.value),
      error: signedIn ? null : `Claude Code is not signed in. ${SIGN_IN_HELP}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error }, 'Claude status check failed');
    value = {
      ...base,
      ok: false,
      email: null,
      subscriptionType: null,
      usingSubscription: false,
      claudeCodeVersion: null,
      models: [],
      error: explainClaudeError(message),
    };
  } finally {
    release();
    q.close();
  }

  g.t2pClaudeStatus = { at: Date.now(), value };
  return value;
}
