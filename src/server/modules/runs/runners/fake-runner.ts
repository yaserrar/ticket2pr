import 'server-only';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { gitTry } from '~/server/modules/git/git.client';
import { followUpTextFromPrompt } from '../prompt';
import { UsageLimitError } from '~/server/modules/claude/usage.service';
import { CLIENT_UPDATE_HEADING, PREVIEW_HEADING, QUESTIONS_HEADING } from '~/lib/summary';
import type { Runner } from './types';

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
 * `[fake:ui /contact /menu]` names pages for screenshots (`[fake:ui]` alone: the home page).
 */
const LIMIT_RESET_SEC = Number(process.env.FAKE_LIMIT_RESET_SEC ?? 45);

/** The Trello part of the prompt (comments, attachments, client updates), to show it arrived. */
function trelloContextOf(prompt: string) {
  const markers = ['## Updates from the client on Trello', 'Comments on the card', 'Attachments:'];
  const at = Math.min(...markers.map((m) => prompt.indexOf(m)).filter((i) => i >= 0));
  return Number.isFinite(at) ? prompt.slice(at).trim() : null;
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

  if (card.description.includes('[fake:limit]') && !ctx.prompt.includes('stopped by the Claude usage limit')) {
    const resetsAt = Math.floor(Date.now() / 1000) + LIMIT_RESET_SEC;
    await emit({ type: 'info', message: 'Your Claude usage limit is reached (simulated).' });
    await ctx.onUsage({ status: 'rejected', utilization: 1, resetsAt, limitType: 'five_hour' });
    throw new UsageLimitError(resetsAt, sessionId);
  }

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
    return { summary, numTurns: turns, costUsd: 0, sessionId, isError: false };
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
    await writeFile(file, previous + withTrello);
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
  return { summary, numTurns: turns, costUsd: 0, sessionId, isError: false };
};
