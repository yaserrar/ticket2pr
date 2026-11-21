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
import { formatDuration, formatTime } from '~/lib/format';
import { parseUsage, tokensOf } from '~/lib/usage';
import { checksService, enabledChecks, type ChecksOutcome } from '~/server/modules/checks/checks.service';
import type { Card, Run } from '~/generated/prisma/client';
import type { RunEventPayload, RunKind } from '~/types/run';
import { buildFixPrompt, buildResumePrompt } from './prompt';
import { riskService } from '~/server/modules/risk/risk.service';
import { RISK_META } from '~/lib/risk';
import { cardPreviewService, parsePages } from '~/server/modules/preview/card-preview.service';
import { appendRunEvent, endRunStream } from './run-events';
import { runRegistry } from './run-registry';
import { getRunner, runnerName } from './runners';
import { contentChanges, contentOf, parseContent, renderFollowUpContext, renderInitialContext } from './trello-context';

const POSITION_STEP = 1000;

const KIND_LABEL: Record<RunKind, string> = { INITIAL: 'initial', FOLLOW_UP: 'follow-up', FIX: 'fix round', CHECKS: 'checks only' };

/**
 * Executes one claimed run (status already RUNNING, registered with its
 * AbortController): prepare the worktree (first time) → run the setup command
 * → add the Trello context → run the agent → run the project's checks → store
 * the result → move the card to Review on success. Failing checks go back to
 * Claude in a fix run (same session, same slot) while rounds remain; still
 * failing, the card reaches Review flagged. At the Claude usage limit the
 * queue pauses and the card continues automatically after the reset. Always
 * ends the stream and frees the slot for the next queued run.
 */
export async function executeRun(runId: string, controller: AbortController, onSettled: () => void) {
  const started = Date.now();
  const emit = (event: RunEventPayload) => appendRunEvent(runId, event);
  let succeeded = false;
  let basePrompt: string | null = null;
  let fixRunId: string | null = null;

  try {
    const run = await prisma.run.findUniqueOrThrow({ where: { id: runId }, include: { card: { include: { project: true } } } });
    const { card } = run;
    const { project } = card;
    const kind = run.kind as RunKind;
    basePrompt = run.prompt;
    const label = kind === 'FIX' ? `fix round ${run.fixRound ?? 1}` : KIND_LABEL[kind];
    await emit({ type: 'system', message: `Run started (${label}, ${runnerName()} runner)` });

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

    const checks = enabledChecks(project);
    const runChecks = () =>
      checksService.run({
        runId,
        cardId: card.id,
        folder: worktree.worktreePath,
        repoPath: project.repoPath!,
        checks,
        signal: controller.signal,
        emit,
      });

    // The checks alone, on request (the developer changed the code by hand).
    if (kind === 'CHECKS') {
      if (!checks.length) throw new Error('This project has no checks. Add them in Project settings.');
      await logChecks(await runChecks(), log);
      await prisma.run.update({ where: { id: runId }, data: { status: 'SUCCEEDED', durationMs: Date.now() - started, endedAt: new Date() } });
      return;
    }

    const fix = kind === 'FIX';
    const prompt = fix ? run.prompt : run.prompt + (await trelloContext(run, card, log));
    if (prompt !== run.prompt) await prisma.run.update({ where: { id: runId }, data: { prompt } });
    const dir = attachmentsDir(card.id);
    const resumeSessionId = kind === 'FOLLOW_UP' || fix ? card.lastSessionId : null;

    const result = await getRunner()({
      runId,
      kind,
      prompt,
      resumeSessionId,
      sessionUsage: resumeSessionId ? await sessionUsageOf(card.id, resumeSessionId) : null,
      fixRound: run.fixRound,
      card: { shortLink: card.trelloShortLink, title: card.title, description: card.description, trelloUrl: card.trelloUrl },
      worktreePath: worktree.worktreePath,
      attachmentsDir: existsSync(dir) ? dir : null,
      signal: controller.signal,
      emit,
      onUsage: (report) => usageService.record(report),
    });
    if (controller.signal.aborted) throw new Error('Run stopped');

    // Claude's part is stored now, so stopping during the checks keeps it.
    const { usage } = result;
    await prisma.$transaction([
      prisma.run.update({
        where: { id: runId },
        data: {
          summary: result.summary,
          sessionId: result.sessionId,
          numTurns: result.numTurns,
          costUsd: usage.costUsd,
          model: usage.models.join(', ') || null,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          sessionUsageJson: JSON.stringify(result.sessionUsage),
        },
      }),
      prisma.card.update({ where: { id: card.id }, data: { lastSessionId: result.sessionId } }),
    ]);
    await emit({
      type: 'result',
      summary: result.summary,
      numTurns: result.numTurns,
      durationMs: Date.now() - started,
      costUsd: usage.costUsd,
      isError: result.isError,
      costIsEstimate: runnerName() === 'claude',
      tokens: tokensOf(usage),
    });
    if (result.isError) {
      await prisma.run.update({
        where: { id: runId },
        data: { status: 'FAILED', error: result.error ?? 'The agent reported an error.', durationMs: Date.now() - started, endedAt: new Date() },
      });
      return;
    }

    const sections = splitSummary(result.summary);
    // A fix round keeps the client texts and pages of the work it fixes, unless it wrote new ones.
    const clientTexts = fix
      ? sections.clientUpdate
        ? { clientUpdate: sections.clientUpdate, clientUpdatePostedAt: null }
        : {}
      : { clientQuestions: sections.questions, clientUpdate: sections.clientUpdate, clientUpdatePostedAt: null };
    const previewPages = fix && !sections.previewPages.length ? parsePages(card.previewPagesJson) : sections.previewPages;

    let outcome: ChecksOutcome | null = null;
    if (checks.length && sections.questions && !fix) await log('Checks skipped: Claude asked the client questions instead of changing the code.');
    else if (checks.length) {
      outcome = await runChecks();
      await logChecks(outcome, log);
    }

    const round = fix ? (run.fixRound ?? 1) : 0;
    if (outcome?.status === 'FAILED' && project.checksAutoFix && round < project.checksMaxFixRounds) {
      const next = round + 1;
      await log(`Sending the failing output back to Claude: fix round ${next} of ${project.checksMaxFixRounds}.`);
      const [fixRun] = await prisma.$transaction([
        prisma.run.create({
          data: {
            cardId: card.id,
            kind: 'FIX',
            fixRound: next,
            runner: runnerName(),
            prompt: buildFixPrompt(outcome.failed, { round: next, maxRounds: project.checksMaxFixRounds, previewPages: project.previewEnabled }),
          },
        }),
        prisma.run.update({ where: { id: runId }, data: { status: 'SUCCEEDED', durationMs: Date.now() - started, endedAt: new Date() } }),
        prisma.card.update({ where: { id: card.id }, data: { ...clientTexts, previewPagesJson: JSON.stringify(previewPages) } }),
      ]);
      fixRunId = fixRun.id;
      return;
    }
    if (outcome?.status === 'FAILED') {
      await log(
        project.checksAutoFix && round > 0
          ? `Checks still failing after ${round} fix round${round === 1 ? '' : 's'}. The card goes to Review flagged “Checks failing”.`
          : 'The card goes to Review flagged “Checks failing”.',
      );
    }

    succeeded = true;
    await afterChanges({ runId, cardId: card.id, previewPages, log, signal: controller.signal });
    await prisma.$transaction([
      prisma.run.update({ where: { id: runId }, data: { status: 'SUCCEEDED', error: null, durationMs: Date.now() - started, endedAt: new Date() } }),
      prisma.card.update({ where: { id: card.id }, data: clientTexts }),
    ]);
  } catch (error) {
    succeeded = false;
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
    const next = fixRunId ? await claimFixRun(fixRunId, controller.signal).catch(() => null) : null;
    runRegistry.unregister(runId);
    if (succeeded) await moveToReview(runId).catch((err) => logger.error({ err, runId }, 'Moving the card to Review failed'));
    await endRunStream(runId);
    if (next && fixRunId) void executeRun(fixRunId, next, onSettled);
    else onSettled();
  }
}

/**
 * The fix run starts right away in the slot this run frees, so the session
 * is still warm and other queued cards don't slip in between. Stopped during
 * the hand-over: it is cancelled. Usage limit: it waits in the queue.
 */
async function claimFixRun(fixRunId: string, signal: AbortSignal): Promise<AbortController | null> {
  if (signal.aborted) {
    await prisma.run.updateMany({ where: { id: fixRunId, status: 'QUEUED' }, data: { status: 'CANCELLED', error: 'Stopped by you.', endedAt: new Date() } });
    return null;
  }
  if (await usageService.pausedUntil()) return null;
  const claimed = await prisma.run.updateMany({ where: { id: fixRunId, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: new Date() } });
  if (!claimed.count) return null;
  const controller = new AbortController();
  runRegistry.register(fixRunId, controller);
  return controller;
}

/** The session's usage as last reported, for the resumed run to tell its own part. */
async function sessionUsageOf(cardId: string, sessionId: string) {
  const last = await prisma.run.findFirst({
    where: { cardId, sessionId, sessionUsageJson: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { sessionUsageJson: true },
  });
  return parseUsage(last?.sessionUsageJson);
}

async function logChecks(outcome: ChecksOutcome, log: (message: string) => Promise<void>) {
  const time = formatDuration(outcome.durationMs);
  await log(
    outcome.status === 'PASSED'
      ? `Checks passed (${time}).`
      : `Checks failing: ${outcome.failed.map((f) => `${f.name}${f.status === 'TIMED_OUT' ? ' (timed out)' : ''}`).join(', ')} (${time}).`,
  );
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
    // A fix round stays one (same round, same failing output to fix).
    prisma.run.create({
      data:
        run.kind === 'FIX'
          ? { cardId: run.cardId, kind: 'FIX', fixRound: run.fixRound, runner: run.runner, prompt: basePrompt ?? run.prompt }
          : {
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
