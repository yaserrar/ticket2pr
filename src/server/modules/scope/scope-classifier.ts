import 'server-only';
import os from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { env } from '~/server/config/env';
import { logger } from '~/server/config/logger';
import { claudeEnv, claudeExecutable, explainClaudeError } from '~/server/modules/claude/claude.client';
import { settingsService } from '~/server/modules/settings/settings.service';
import { UsageLimitError, usageService } from '~/server/modules/claude/usage.service';
import { mapSdkMessage } from '~/server/modules/runs/runners/claude-messages';
import { scopeResultSchema, type ScopeResult } from '~/lib/scope';
import { SCOPE_OUTPUT_SCHEMA } from './scope-prompt';

/**
 * Asks Claude whether a card is in scope. Read-only: the only tools are Read,
 * Glob and Grep, in the project's repository folder (never written to).
 * Short: a few turns, five minutes at most.
 */
export type ScopeClassifierInput = {
  prompt: string;
  /** The repository folder, or null to judge from the card alone. */
  cwd: string | null;
  /** The card text, for the fake classifier's test switches. */
  cardText: string;
};

const MAX_TURNS = 15;
const TIMEOUT_MS = 5 * 60_000;

const claudeClassifier = async (input: ScopeClassifierInput): Promise<ScopeResult> => {
  const settings = await settingsService.row();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const stderr: string[] = [];
  let fatal: string | null = null;
  let resetsAt: number | null = null;
  let output: unknown = null;
  let failure: string | null = null;

  try {
    const stream = query({
      prompt: input.prompt,
      options: {
        cwd: input.cwd ?? os.tmpdir(),
        abortController: controller,
        model: settings.claudeModel ?? undefined,
        maxTurns: MAX_TURNS,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        // The repository's CLAUDE.md helps judge the size of a change; personal settings don't apply.
        settingSources: input.cwd ? ['project'] : [],
        strictMcpConfig: true,
        mcpServers: {},
        tools: input.cwd ? ['Read', 'Glob', 'Grep'] : [],
        allowedTools: input.cwd ? ['Read', 'Glob', 'Grep'] : [],
        canUseTool: async (toolName) => ({ behavior: 'deny', message: `${toolName} is not available during a scope check: only reading.` }),
        outputFormat: { type: 'json_schema', schema: SCOPE_OUTPUT_SCHEMA },
        env: claudeEnv(),
        pathToClaudeCodeExecutable: claudeExecutable(),
        stderr: (data) => {
          stderr.push(data);
          if (stderr.length > 20) stderr.shift();
        },
      },
    });

    for await (const message of stream) {
      const mapped = mapSdkMessage(message);
      if (mapped.usage) {
        if (mapped.usage.resetsAt) resetsAt = mapped.usage.resetsAt;
        await usageService.record(mapped.usage).catch(() => undefined);
      }
      if (mapped.fatal) fatal = mapped.fatal;
      if (message.type === 'result') {
        if (message.subtype === 'success' && !message.is_error) output = message.structured_output;
        else failure = mapped.result?.error ?? 'Claude stopped before answering.';
      }
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The scope check took longer than 5 minutes and was stopped.');
    if (fatal === 'rate_limit') throw new UsageLimitError(resetsAt, null);
    const raw = [error instanceof Error ? error.message : String(error), ...stderr.slice(-5)].join('\n');
    if (/usage limit|rate_limit|limit reached/i.test(raw)) throw new UsageLimitError(resetsAt, null);
    logger.warn({ err: error, stderr: stderr.slice(-5) }, 'Scope check failed');
    throw new Error(explainClaudeError(fatal ?? raw));
  } finally {
    clearTimeout(timeout);
  }

  if (fatal === 'rate_limit' && !output) throw new UsageLimitError(resetsAt, null);
  if (fatal && !output) throw new Error(explainClaudeError(fatal));
  const parsed = scopeResultSchema.safeParse(output);
  if (!parsed.success) throw new Error(failure ?? 'Claude’s answer was not in the expected format. Check again.');
  return parsed.data;
};

/**
 * `RUNNER=fake`: no tokens. In scope unless the card text says otherwise:
 * `[fake:out-of-scope]`, `[fake:unsure]`, `[fake:scope-fail]`.
 */
const STEP_MS = Number(process.env.FAKE_RUNNER_STEP_MS ?? 900);

const fakeClassifier = async (input: ScopeClassifierInput): Promise<ScopeResult> => {
  await new Promise((resolve) => setTimeout(resolve, STEP_MS * 2));
  const text = input.cardText;
  if (text.includes('[fake:scope-fail]')) throw new Error('Simulated failure of the scope check.');
  if (text.includes('[fake:out-of-scope]')) {
    return {
      verdict: 'OUT_OF_SCOPE',
      kind: 'NEW_FEATURE',
      size: 'LARGE',
      reason: 'Simulated verdict: this asks for a new feature that doesn’t exist in the code yet, which the agreement lists as new work.',
      clientNote:
        'Thank you for your request. What you describe is a new feature, beyond the maintenance we cover today. Our project manager will contact you to discuss it.',
    };
  }
  if (text.includes('[fake:unsure]')) {
    return {
      verdict: 'UNSURE',
      kind: 'OTHER',
      size: 'MEDIUM',
      reason: 'Simulated verdict: the request is vague; it could be a small change or a new screen.',
      clientNote: 'Thank you for your request. We need a little more detail to know whether it is covered by maintenance. Our project manager will contact you.',
    };
  }
  return {
    verdict: 'IN_SCOPE',
    kind: 'SMALL_CHANGE',
    size: 'SMALL',
    reason: 'Simulated verdict: a small change to something that already exists.',
    clientNote: '',
  };
};

export const getScopeClassifier = () => (env.RUNNER === 'fake' ? fakeClassifier : claudeClassifier);
