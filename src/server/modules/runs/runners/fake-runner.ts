import 'server-only';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { gitTry } from '~/server/modules/git/git.client';
import { failedChecksFromPrompt, followUpTextFromPrompt } from '../prompt';
import { addUsage, type AgentUsage } from '~/lib/usage';
import { UsageLimitError } from '~/server/modules/claude/usage.service';
import { CLIENT_UPDATE_HEADING, PREVIEW_HEADING, QUESTIONS_HEADING } from '~/lib/summary';
import type { Runner, RunnerContext } from './types';

/**
 * Scripted runs for building the UI and workflow without spending tokens
 * (spec §7.6, `RUNNER=fake`). It streams the same event types as the real
 * runner and makes a small, clearly labelled change in the worktree, so the
 * diff, commit, push and pull request steps have something to work with.
 */
export const FAKE_FILE = 'TICKET2PR_FAKE_RUN.md';
const STEP_MS = Number(process.env.FAKE_RUNNER_STEP_MS ?? 900);
/**
 * Test switches in a card description: `[fake:limit]` hits the usage limit once, `[fake:questions]` asks the client,
 * `[fake:ui /contact /menu]` names pages for screenshots (`[fake:ui]` alone: the home page),
 * `[fake:checks-fail-once]` makes the first check fail until the first fix round, `[fake:checks-fail]` until the end.
 */
const LIMIT_RESET_SEC = Number(process.env.FAKE_LIMIT_RESET_SEC ?? 45);

/** The Trello part of the prompt (comments, attachments, client updates), to show it arrived. */
function trelloContextOf(prompt: string) {
  const markers = ['## Updates from the client on Trello', 'Comments on the card', 'Attachments:'];
  const at = Math.min(...markers.map((m) => prompt.indexOf(m)).filter((i) => i >= 0));
  return Number.isFinite(at) ? prompt.slice(at).trim() : null;
}

/** Written in FAKE_FILE while a simulated check failure is on; the checks read it in fake mode. */
const CHECK_FAILURE_MARK = 'Simulated check failure: on';

/** Fake mode: does the folder carry a simulated check failure? (`[fake:checks-fail…]`) */
export async function fakeCheckFailure(folder: string) {
  const text = await readFile(path.join(folder, FAKE_FILE), 'utf8').catch(() => '');
  return text.includes(CHECK_FAILURE_MARK);
}

/** Plausible usage for the number of turns, priced like Claude Code reports it (Sonnet list prices). */
function fakeUsage(turns: number): AgentUsage {
  const between = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
  const inputTokens = turns * between(8, 20);
  const outputTokens = turns * between(250, 600);
  const cacheReadTokens = turns * between(14_000, 22_000);
  const cacheWriteTokens = between(6_000, 12_000) + turns * between(500, 1_500);
  const costUsd = (inputTokens * 3 + outputTokens * 15 + cacheReadTokens * 0.3 + cacheWriteTokens * 3.75) / 1_000_000;
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd: Math.round(costUsd * 1e6) / 1e6, models: ['fake-sonnet'] };
}

function finish(ctx: RunnerContext, result: { summary: string; numTurns: number; sessionId: string }) {
  const usage = fakeUsage(result.numTurns);
  return { ...result, isError: false, usage, sessionUsage: addUsage(ctx.resumeSessionId ? ctx.sessionUsage : null, usage) };
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Run stopped'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('Run stopped'));
      },
      { once: true },
    );
  });
}

export const fakeRunner: Runner = async (ctx) => {
  const { emit, signal, worktreePath, card } = ctx;
  const sessionId = ctx.resumeSessionId ?? `fake-${randomUUID()}`;
  let turns = 0;
  const tool = async (name: string, input: Record<string, unknown>, run: () => Promise<string>) => {
    const id = randomUUID();
    turns++;
    await emit({ type: 'tool_use', id, name, input });
    await sleep(STEP_MS / 2, signal);
    try {
      const output = await run();
      await emit({ type: 'tool_result', toolUseId: id, output, isError: false });
    } catch (error) {
      await emit({ type: 'tool_result', toolUseId: id, output: error instanceof Error ? error.message : String(error), isError: true });
    }
    await sleep(STEP_MS, signal);
  };

  await emit({ type: 'system', message: 'Fake runner: a simulated agent. No tokens are used and no real code is written.' });
  await ctx.onUsage({ status: 'allowed', utilization: 0.42, resetsAt: Math.floor(Date.now() / 1000) + 3 * 3600, limitType: 'five_hour' });
  await sleep(STEP_MS, signal);

  if (ctx.kind !== 'FIX' && card.description.includes('[fake:limit]') && !ctx.prompt.includes('stopped by the Claude usage limit')) {
    const resetsAt = Math.floor(Date.now() / 1000) + LIMIT_RESET_SEC;
    await emit({ type: 'info', message: 'Your Claude usage limit is reached (simulated).' });
    await ctx.onUsage({ status: 'rejected', utilization: 1, resetsAt, limitType: 'five_hour' });
    throw new UsageLimitError(resetsAt, sessionId);
  }

  if (ctx.kind === 'FIX') return fakeFix(ctx, sessionId, tool);

  const followUp = ctx.kind === 'FOLLOW_UP' ? followUpTextFromPrompt(ctx.prompt) : null;
  turns++;
  await emit({
    type: 'assistant_text',
    text: followUp
      ? `The reviewer asked for changes: “${followUp}”. I'll update my previous work.`
      : `I'll read the request “${card.title}” and look at how the project is organised.`,
  });
  await sleep(STEP_MS, signal);

  await tool('Glob', { pattern: '*' }, async () => {
    const entries = await readdir(worktreePath, { withFileTypes: true });
    return entries
      .filter((e) => e.name !== '.git')
      .slice(0, 20)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join('\n');
  });

  await tool('Read', { file_path: 'README.md' }, async () => {
    const text = await readFile(path.join(worktreePath, 'README.md'), 'utf8');
    return text.split('\n').slice(0, 15).join('\n');
  });

  if (ctx.attachmentsDir) {
    const first = (await readdir(ctx.attachmentsDir).catch(() => [] as string[]))[0];
    if (first) await tool('Read', { file_path: path.join(ctx.attachmentsDir, first) }, async () => `[attachment ${first}]`);
  }

  if (!followUp && card.description.includes('[fake:questions]')) {
    const summary = `I didn't change anything: the request doesn't say which page the button goes on.\n\n## ${QUESTIONS_HEADING}\n- Which page should the button be on?\n- Should it call the main number or the reservations line?`;
    turns++;
    await emit({ type: 'assistant_text', text: summary });
    return finish(ctx, { summary, numTurns: turns, sessionId });
  }

  turns++;
  await emit({
    type: 'assistant_text',
    text: `To exercise the review flow, I'll write ${FAKE_FILE} describing the request. A real run would edit the code instead.`,
  });
  await sleep(STEP_MS, signal);

  const file = path.join(worktreePath, FAKE_FILE);
  await tool('Write', { file_path: FAKE_FILE }, async () => {
    const previous = await readFile(file, 'utf8').catch(() => '');
    const trello = trelloContextOf(ctx.prompt);
    const section = followUp
      ? `\n## Follow-up\n\nRequested by the reviewer: ${followUp}\n\nApplied: ${new Date().toISOString()}\n`
      : `# ${card.title}\n\nSimulated by Ticket2PR's fake runner. Trello card: ${card.trelloUrl}\n\n## Request\n\n${card.description.trim() || '(no description)'}\n\nRun at: ${new Date().toISOString()}\n`;
    const withTrello = trello ? `${section}\n## From Trello\n\n${trello}\n` : section;
    const breakChecks = !followUp && /\[fake:checks-fail(-once)?\]/.test(card.description);
    await writeFile(file, previous + withTrello + (breakChecks ? `\n${CHECK_FAILURE_MARK}\n` : ''));
    return `Wrote ${withTrello.split('\n').length} lines to ${FAKE_FILE}`;
  });

  await tool('Bash', { command: 'git status --short' }, async () => (await gitTry(worktreePath, ['status', '--short'])) || '(clean)');

  // `[fake:ui /contact]`: name pages to preview, so screenshots can be tried without tokens.
  const pages = card.description.match(/\[fake:ui((?:\s+\/\S*)*)\]/);
  const preview = pages ? `\n\n## ${PREVIEW_HEADING}\n${(pages[1]?.trim().split(/\s+/).filter(Boolean) ?? []).concat(pages[1]?.trim() ? [] : ['/']).map((p) => `- ${p}`).join('\n')}` : '';
  const summary = (followUp
    ? `Simulated follow-up: added a "Follow-up" section to ${FAKE_FILE} with the reviewer's request.\n\nFiles touched: ${FAKE_FILE}\n\nReviewer: check the diff, then commit and push.\n\n## ${CLIENT_UPDATE_HEADING}\nI made the changes you asked for on “${card.title}”.`
    : `Simulated run: created ${FAKE_FILE} describing the request. No application code was changed.\n\nFiles touched: ${FAKE_FILE}\n\nReviewer: check the diff, then try commit, push and open the pull request.\n\n## ${CLIENT_UPDATE_HEADING}\n“${card.title}” is done and ready for you to check.`) + preview;
  turns++;
  await emit({ type: 'assistant_text', text: summary });
  return finish(ctx, { summary, numTurns: turns, sessionId });
};

/**
 * A fix round: reads which checks failed from the prompt, "fixes" them by
 * noting the round in FAKE_FILE, and lifts a `[fake:checks-fail-once]`
 * failure (`[fake:checks-fail]` stays, to try a card that still fails).
 */
async function fakeFix(
  ctx: RunnerContext,
  sessionId: string,
  tool: (name: string, input: Record<string, unknown>, run: () => Promise<string>) => Promise<void>,
) {
  const failed = failedChecksFromPrompt(ctx.prompt);
  let turns = 1;
  await ctx.emit({
    type: 'assistant_text',
    text: `The checks failed (${failed.join(', ') || 'unknown'}). I'll fix the cause without turning off any test or lint rule.`,
  });
  await sleep(STEP_MS, ctx.signal);
  const file = path.join(ctx.worktreePath, FAKE_FILE);
  const fixed = ctx.card.description.includes('[fake:checks-fail-once]');
  await tool('Edit', { file_path: FAKE_FILE }, async () => {
    const text = await readFile(file, 'utf8').catch(() => '');
    const note = `\n## Fix round ${ctx.fixRound ?? 1}\n\nFailing: ${failed.join(', ') || '(none named)'}. ${fixed ? 'Fixed.' : 'Not fixed (simulated).'}\n`;
    await writeFile(file, (fixed ? text.replace(CHECK_FAILURE_MARK, 'Simulated check failure: fixed') : text) + note);
    return `Updated ${FAKE_FILE}`;
  });
  turns += 2;
  const summary = `Simulated fix round ${ctx.fixRound ?? 1}: ${fixed ? 'fixed' : 'tried to fix'} ${failed.join(', ') || 'the failing checks'} in ${FAKE_FILE}.\n\nFiles touched: ${FAKE_FILE}`;
  await ctx.emit({ type: 'assistant_text', text: summary });
  return finish(ctx, { summary, numTurns: turns, sessionId });
}
