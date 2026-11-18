import 'server-only';
import { existsSync } from 'node:fs';
import { prisma } from '~/server/config/prisma';
import { logger } from '~/server/config/logger';
import { ensureWorktree, runSetupCommand } from '~/server/modules/git/worktree';
import { isSharedCard, prepareSharedCheckout } from '~/server/modules/git/shared-checkout';
import { UsageLimitError, usageService } from '~/server/modules/claude/usage.service';
import { attachmentsDir, cardContextService } from '~/server/modules/trello/card-context.service';
import { postedIdsOf, writeBackService } from '~/server/modules/trello/write-back.service';
import { splitSummary } from '~/lib/summary';
import { formatTime } from '~/lib/format';
import type { Card, Run } from '~/generated/prisma/client';
import type { RunEventPayload, RunKind } from '~/types/run';
import { buildResumePrompt } from './prompt';
import { riskService } from '~/server/modules/risk/risk.service';
import { RISK_META } from '~/lib/risk';
import { cardPreviewService } from '~/server/modules/preview/card-preview.service';
import { appendRunEvent, endRunStream } from './run-events';
import { runRegistry } from './run-registry';
import { getRunner, runnerName } from './runners';
import { contentChanges, contentOf, parseContent, renderFollowUpContext, renderInitialContext } from './trello-context';

const POSITION_STEP = 1000;

/**
 * Executes one claimed run (status already RUNNING, registered with its
 * AbortController): prepare the worktree (first time) → run the setup command
 * → add the Trello context → run the agent → store the result → move the
 * card to Review on success. At the Claude usage limit the queue pauses and
 * the card continues automatically after the reset. Always ends the stream
 * and frees the slot for the next queued run.
 */
export async function executeRun(runId: string, controller: AbortController, onSettled: () => void) {
  const started = Date.now();
  const emit = (event: RunEventPayload) => appendRunEvent(runId, event);
  let succeeded = false;
  let basePrompt: string | null = null;

  try {
    const run = await prisma.run.findUniqueOrThrow({ where: { id: runId }, include: { card: { include: { project: true } } } });
    const { card } = run;
    const { project } = card;
    basePrompt = run.prompt;
    await emit({ type: 'system', message: `Run started (${run.kind === 'FOLLOW_UP' ? 'follow-up' : 'initial'}, ${runnerName()} runner)` });

    if (!project.repoPath) throw new Error('This project has no repository. Add it in Project settings.');

    const log = (message: string) => emit({ type: 'info', message });
    let worktree: { branchName: string; worktreePath: string; created: boolean };
    if (isSharedCard(card, project)) {
      const checkout = await prepareSharedCheckout({ project: { ...project, repoPath: project.repoPath }, card, log });
      worktree = { branchName: checkout.branchName, worktreePath: checkout.folder, created: checkout.created };
      if (checkout.startSha !== card.startSha) {
        await prisma.card.update({ where: { id: card.id }, data: { startSha: checkout.startSha } });
      }
    } else {
      worktree = await ensureWorktree({ repoPath: project.repoPath, baseBranch: project.baseBranch, projectId: project.id, card, log });
    }
    if (worktree.branchName !== card.branchName || worktree.worktreePath !== card.worktreePath) {
      await prisma.card.update({
        where: { id: card.id },
        data: { branchName: worktree.branchName, worktreePath: worktree.worktreePath },
      });
    }
    if (worktree.created && project.setupCommand) {
      await emit({ type: 'info', message: `$ ${project.setupCommand}` });
      await runSetupCommand(project.setupCommand, worktree.worktreePath, (message) => emit({ type: 'info', message }), controller.signal);
    }

    const prompt = run.prompt + (await trelloContext(run, card, log));
    if (prompt !== run.prompt) await prisma.run.update({ where: { id: runId }, data: { prompt } });
    const dir = attachmentsDir(card.id);

    const result = await getRunner()({
      runId,
      kind: run.kind as RunKind,
      prompt,
      resumeSessionId: run.kind === 'FOLLOW_UP' ? card.lastSessionId : null,
      card: { shortLink: card.trelloShortLink, title: card.title, description: card.description, trelloUrl: card.trelloUrl },
      worktreePath: worktree.worktreePath,
      attachmentsDir: existsSync(dir) ? dir : null,
      signal: controller.signal,
      emit,
      onUsage: (report) => usageService.record(report),
    });
    if (controller.signal.aborted) throw new Error('Run stopped');

    const durationMs = Date.now() - started;
    await emit({
      type: 'result',
      summary: result.summary,
      numTurns: result.numTurns,
      durationMs,
      costUsd: result.costUsd,
      isError: result.isError,
      costIsEstimate: runnerName() === 'claude',
    });
    succeeded = !result.isError;
    const sections = splitSummary(result.summary);
    if (succeeded) await afterChanges({ runId, cardId: card.id, previewPages: sections.previewPages, log, signal: controller.signal });
    await prisma.$transaction([
      prisma.run.update({
        where: { id: runId },
        data: {
          status: succeeded ? 'SUCCEEDED' : 'FAILED',
          summary: result.summary,
          error: succeeded ? null : (result.error ?? 'The agent reported an error.'),
          costUsd: result.costUsd,
          numTurns: result.numTurns,
          durationMs,
          sessionId: result.sessionId,
          endedAt: new Date(),
        },
      }),
      prisma.card.update({
        where: { id: card.id },
        data: {
          lastSessionId: result.sessionId,
          ...(succeeded
            ? { clientQuestions: sections.questions, clientUpdate: sections.clientUpdate, clientUpdatePostedAt: null }
            : {}),
        },
      }),
    ]);
  } catch (error) {
    const cancelled = controller.signal.aborted;
    if (!cancelled && error instanceof UsageLimitError) {
      await pauseAndRequeue(runId, error, basePrompt, started).catch((err) => logger.error({ err, runId }, 'Re-queueing after the usage limit failed'));
    } else {
      const message = cancelled ? 'Stopped by you.' : error instanceof Error ? error.message : String(error);
      if (!cancelled) logger.warn({ runId, err: error }, 'Run failed');
      await emit({ type: 'error', message }).catch(() => undefined);
      await prisma.run
        .update({
          where: { id: runId },
          data: { status: cancelled ? 'CANCELLED' : 'FAILED', error: message, durationMs: Date.now() - started, endedAt: new Date() },
        })
        .catch(() => undefined);
    }
  } finally {
    runRegistry.unregister(runId);
    if (succeeded) await moveToReview(runId).catch((err) => logger.error({ err, runId }, 'Moving the card to Review failed'));
    await endRunStream(runId);
    onSettled();
  }
}

/**
 * After a successful run, before Review: the risk flag of the changes, then
 * (screenshots on) the app started on the pages Claude named. Neither can
 * fail the run: problems are logged and stored on the card.
 */
async function afterChanges(input: { runId: string; cardId: string; previewPages: string[]; log: (m: string) => Promise<void>; signal: AbortSignal }) {
  const card = await prisma.card.findUnique({ where: { id: input.cardId }, include: { project: true } });
  if (!card) return;
  try {
    const risk = await riskService.refresh(card);
    if (risk) {
      const areas = risk.areas.map((a) => a.label).join(', ');
      await input.log(`Risk: ${RISK_META[risk.level].label} · ${RISK_META[risk.level].review.toLowerCase()}${areas ? ` (${areas})` : ''}`);
    }
  } catch (error) {
    logger.warn({ err: error, cardId: card.id }, 'Risk assessment failed');
  }
  if (card.project.previewEnabled && card.project.previewCommand?.trim()) {
    await cardPreviewService.capture({ cardId: card.id, prefix: input.runId, pages: input.previewPages, log: input.log, signal: input.signal });
  }
}

/**
 * Comments, attachments and (follow-ups) client edits from Trello, as a
 * prompt suffix. Only what Claude hasn't seen yet: the card remembers what
 * was sent. Trello failures are logged and the run goes on without them.
 */
async function trelloContext(run: Run, card: Card, log: (message: string) => Promise<void>) {
  const followUp = run.kind === 'FOLLOW_UP';
  const since = followUp ? card.sentContextAt : null;
  const sentAt = new Date();
  const { ctx, errors } = await cardContextService.gather(
    { id: card.id, trelloCardId: card.trelloCardId, postedCommentIds: postedIdsOf(card.postedCommentIds) },
    since,
  );
  const current = contentOf(card);
  const previous = parseContent(card.sentContentJson);
  const changes = followUp && previous ? contentChanges(previous, current) : [];
  const suffix = followUp ? renderFollowUpContext(changes, ctx) : renderInitialContext(ctx);

  const parts = [
    changes.length ? 'card changes' : null,
    ctx.comments.length ? `${ctx.comments.length} comment${ctx.comments.length === 1 ? '' : 's'}` : null,
    ctx.files.length ? `${ctx.files.length} attachment${ctx.files.length === 1 ? '' : 's'}` : null,
    ctx.links.length ? `${ctx.links.length} link${ctx.links.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  if (parts.length) await log(`From Trello: ${parts.join(', ')}${ctx.skipped.length ? ` (${ctx.skipped.length} attachment skipped)` : ''}`);
  if (errors.length) await log(`Couldn’t read everything from Trello, continuing without it:\n${errors.join('\n')}`);

  await prisma.card.update({
    where: { id: card.id },
    data: {
      sentContentJson: JSON.stringify(current),
      // Keep the old date if comments couldn't be read, so they are sent next time.
      ...(errors.length ? {} : { sentContextAt: sentAt }),
      changedOnTrello: false,
      clientRepliedAt: null,
      ...(followUp ? { waitingSince: null } : {}),
    },
  });
  return suffix ? `\n${suffix}` : '';
}

/**
 * Usage limit: pause the queue until the reset, record the run as stopped
 * by the limit, and queue its continuation (resuming the same session).
 */
async function pauseAndRequeue(runId: string, error: UsageLimitError, basePrompt: string | null, started: number) {
  const until = await usageService.pause(error.resetsAt);
  const message = `Your Claude usage limit is reached. This card continues automatically at ${formatTime(until)}.`;
  await appendRunEvent(runId, { type: 'error', message });
  const run = await prisma.run.update({
    where: { id: runId },
    data: { status: 'FAILED', error: message, durationMs: Date.now() - started, endedAt: new Date(), sessionId: error.sessionId },
  });
  const resume = Boolean(error.sessionId);
  await prisma.$transaction([
    ...(resume ? [prisma.card.update({ where: { id: run.cardId }, data: { lastSessionId: error.sessionId } })] : []),
    prisma.run.create({
      data: {
        cardId: run.cardId,
        kind: resume ? 'FOLLOW_UP' : run.kind,
        runner: run.runner,
        prompt: resume ? buildResumePrompt() : (basePrompt ?? run.prompt),
      },
    }),
  ]);
}

/** Run succeeded → the card goes to the end of Review, if it is still In progress (spec §9.2). */
async function moveToReview(runId: string) {
  const run = await prisma.run.findUnique({ where: { id: runId }, select: { card: { select: { id: true, projectId: true, status: true } } } });
  if (!run || run.card.status !== 'IN_PROGRESS') return;
  const last = await prisma.card.aggregate({
    where: { projectId: run.card.projectId, status: 'REVIEW' },
    _max: { position: true },
  });
  await prisma.card.update({
    where: { id: run.card.id },
    data: { status: 'REVIEW', position: (last._max.position ?? 0) + POSITION_STEP },
  });
  writeBackService.follow(run.card.id);
}
