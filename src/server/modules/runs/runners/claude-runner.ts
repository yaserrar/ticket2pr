import 'server-only';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { logger } from '~/server/config/logger';
import { claudeEnv, claudeExecutable, explainClaudeError } from '~/server/modules/claude/claude.client';
import { settingsService } from '~/server/modules/settings/settings.service';
import { UsageLimitError } from '~/server/modules/claude/usage.service';
import { mapSdkMessage, type ClaudeResult } from './claude-messages';
import { buildToolPolicy, denialMessage, detectPackageManager } from './tool-policy';
import type { Runner } from './types';

/**
 * Real runs: Claude Code through the Agent SDK `query()` loop (spec §7.2),
 * inside the card's worktree, signed in with the developer's Claude
 * subscription. Edits are auto-approved inside the worktree, the project's
 * checks may run, git writes and network tools are denied, and anything else
 * is refused with an explanation (no human is there to approve it).
 */
const RUN_TIMEOUT_MS = 45 * 60_000;

async function projectScripts(worktreePath: string) {
  const files = await readdir(worktreePath).catch(() => [] as string[]);
  let scripts: string[] = [];
  try {
    const pkg = JSON.parse(await readFile(path.join(worktreePath, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    scripts = Object.keys(pkg.scripts ?? {});
  } catch {
    // Not a Node project: only read-only git and the direct checks are allowed.
  }
  return { scripts, packageManager: detectPackageManager(files) };
}

export const claudeRunner: Runner = async (ctx) => {
  const { emit, signal, worktreePath } = ctx;
  const settings = await settingsService.row();
  const policy = buildToolPolicy(await projectScripts(worktreePath));

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, RUN_TIMEOUT_MS);
  const stderr: string[] = [];

  await emit({
    type: 'info',
    message: [
      `Model: ${settings.claudeModel ?? 'Claude Code default'} · up to ${settings.maxTurns} turns`,
      `Allowed checks: ${policy.allowedScripts.length ? policy.allowedScripts.join(', ') : 'none found in package.json'}, read-only git`,
      'Blocked: git commit / push / branch changes, network and web tools',
    ].join('\n'),
  });

  let sessionId = ctx.resumeSessionId;
  let result: ClaudeResult | null = null;
  let fatal: string | null = null;
  let resetsAt: number | null = null;
  let lastText = '';

  try {
    const stream = query({
      prompt: ctx.prompt,
      options: {
        cwd: worktreePath,
        abortController: controller,
        resume: ctx.resumeSessionId ?? undefined,
        model: settings.claudeModel ?? undefined,
        maxTurns: settings.maxTurns,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        // The repository's CLAUDE.md and project settings; not the developer's personal ones.
        settingSources: ['project'],
        strictMcpConfig: true,
        mcpServers: {},
        permissionMode: 'acceptEdits',
        // Trello attachments (screenshots, PDFs) downloaded outside the worktree.
        additionalDirectories: ctx.attachmentsDir ? [ctx.attachmentsDir] : undefined,
        allowedTools: policy.allowedTools,
        disallowedTools: policy.disallowedTools,
        canUseTool: async (toolName, input) => {
          const message = denialMessage(toolName, input);
          await emit({ type: 'info', message: `Refused ${toolName}${typeof input.command === 'string' ? `: ${input.command}` : typeof input.file_path === 'string' ? `: ${input.file_path}` : ''}` });
          return { behavior: 'deny', message };
        },
        env: claudeEnv(),
        pathToClaudeCodeExecutable: claudeExecutable(),
        stderr: (data) => {
          stderr.push(data);
          if (stderr.length > 50) stderr.shift();
        },
      },
    });

    for await (const message of stream) {
      const mapped = mapSdkMessage(message);
      if (mapped.sessionId) sessionId = mapped.sessionId;
      for (const event of mapped.events) {
        if (event.type === 'assistant_text') lastText = event.text;
        await emit(event);
      }
      if (mapped.usage) {
        if (mapped.usage.resetsAt) resetsAt = mapped.usage.resetsAt;
        await ctx.onUsage(mapped.usage).catch(() => undefined);
      }
      if (mapped.fatal) fatal = mapped.fatal;
      if (mapped.result) result = mapped.result;
    }
  } catch (error) {
    if (signal.aborted) throw error;
    if (controller.signal.aborted) throw new Error('The run took longer than 45 minutes and was stopped.');
    if (fatal === 'rate_limit') throw new UsageLimitError(resetsAt, sessionId);
    const raw = [error instanceof Error ? error.message : String(error), ...stderr.slice(-5)].join('\n');
    if (/usage limit|rate_limit|limit reached/i.test(raw)) throw new UsageLimitError(resetsAt, sessionId);
    logger.warn({ err: error, stderr: stderr.slice(-5) }, 'Claude run failed');
    throw new Error(explainClaudeError(fatal ?? raw));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }

  if (fatal === 'rate_limit' && (!result || result.isError)) throw new UsageLimitError(resetsAt, sessionId);
  if (fatal && (!result || result.isError)) throw new Error(explainClaudeError(fatal));
  if (!result) throw new Error(explainClaudeError(stderr.slice(-5).join('\n') || 'Claude Code ended without a result.'));

  return {
    summary: result.summary || lastText || '(Claude gave no summary.)',
    numTurns: result.numTurns,
    costUsd: result.costUsd,
    sessionId,
    isError: result.isError,
    error: result.error,
  };
};
