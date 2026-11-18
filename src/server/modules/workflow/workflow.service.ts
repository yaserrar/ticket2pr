import 'server-only';
import { prisma } from '~/server/config/prisma';
import { HttpError, invalidTransition, notFound } from '~/server/http/errors';
import { cardChecklistsSchema, cardLabelsSchema, type CreateRunInput, type MoveCardInput, type OutOfScopeInput } from '~/schemas/card';
import { cardStatusSchema, type CardStatus } from '~/schemas/common';
import { isActiveRunStatus, planMove } from '~/lib/workflow';
import { cardsService } from '~/server/modules/cards/cards.service';
import { parseJson } from '~/server/presenters/card.presenter';
import { resetChanges } from '~/server/modules/git/changes';
import { branchNameFor } from '~/server/modules/git/remote';
import { isWorktree, removeWorktree } from '~/server/modules/git/worktree';
import { gitTry } from '~/server/modules/git/git.client';
import { isSharedCard, sharedBranchOf, sharedWorktreePath } from '~/server/modules/git/shared-checkout';
import { buildFollowUpPrompt, buildInitialPrompt } from '~/server/modules/runs/prompt';
import { kickQueue } from '~/server/modules/runs/run-queue';
import { runnerName } from '~/server/modules/runs/runners';
import { claudeStatus } from '~/server/modules/claude/claude.client';
import { runsService } from '~/server/modules/runs/runs.service';
import { writeBackService } from '~/server/modules/trello/write-back.service';
import { removeAttachments } from '~/server/modules/trello/card-context.service';
import { scopeGate, scopeStatusSchema } from '~/lib/scope';
import { scopeService } from '~/server/modules/scope/scope.service';
import { scopeContentKey } from '~/server/modules/scope/scope-content';

/**
 * The card state machine (spec §9). Every status change goes through here:
 * no route or component writes `status` directly. Rules come from the shared
 * `planMove()`, so the board and the server always agree.
 */
const POSITION_STEP = 1000;

async function loadCard(cardId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      project: true,
      runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true } },
    },
  });
  if (!card) throw notFound('Card');
  return card;
}
type LoadedCard = Awaited<ReturnType<typeof loadCard>>;

const activeRunOf = (card: LoadedCard) => (card.runs[0] && isActiveRunStatus(card.runs[0].status) ? card.runs[0] : null);

async function endOfColumn(projectId: string, status: CardStatus) {
  const last = await prisma.card.aggregate({ where: { projectId, status }, _max: { position: true } });
  return (last._max.position ?? 0) + POSITION_STEP;
}

const confirmationRequired = (message: string) => new HttpError(409, message, 'CONFIRMATION_REQUIRED');

const worksOnSharedBranch = (card: LoadedCard) => isSharedCard(card, card.project);

/** Shared branch: one card at a time, or their changes would mix. */
async function assertBranchFree(card: LoadedCard) {
  const branch = sharedBranchOf(card.project);
  const other = await prisma.card.findFirst({
    where: { projectId: card.projectId, id: { not: card.id }, status: { in: ['IN_PROGRESS', 'REVIEW'] }, branchName: branch },
    select: { title: true, status: true },
  });
  if (other) {
    throw invalidTransition(
      `“${other.title}” is still ${other.status === 'REVIEW' ? 'in Review' : 'In progress'} on ${branch}. ` +
        'On a shared branch cards go one at a time: push it (or move it to Done or back to New) first.',
    );
  }
}

/** spec §9.2: a card starts only when Claude Code is signed in (checked without using the plan, cached). */
async function assertRunnerReady() {
  if (runnerName() !== 'claude') return;
  const status = await claudeStatus();
  if (!status.ok) throw new HttpError(409, status.error ?? 'Claude Code is not ready.', 'CLAUDE_NOT_READY');
}

/** The scope gate for starting this card (same rules as the board). */
function gateOf(card: LoadedCard) {
  return scopeGate({
    enabled: card.project.scopeCheck,
    status: scopeStatusSchema.nullable().catch(null).parse(card.scopeStatus),
    stale: Boolean(card.scopeContentKey) && card.scopeContentKey !== scopeContentKey(card),
    approved: card.scopeApproved,
    reason: card.scopeReason,
    error: card.scopeError,
  });
}

function initialPrompt(card: LoadedCard, branchName: string) {
  return buildInitialPrompt({
    card: {
      shortLink: card.trelloShortLink,
      title: card.title,
      description: card.description,
      labels: parseJson(card.labelsJson, cardLabelsSchema, []),
      checklists: parseJson(card.checklistsJson, cardChecklistsSchema, []),
    },
    branchName,
    baseBranch: card.project.baseBranch,
    extraInstructions: card.project.extraInstructions,
  });
}

export const workflowService = {
  async moveCard(cardId: string, input: Required<MoveCardInput>) {
    const card = await loadCard(cardId);
    const from = cardStatusSchema.catch('NEW').parse(card.status);
    const plan = planMove({
      from,
      to: input.status,
      hasActiveRun: Boolean(activeRunOf(card)),
      hasWork: Boolean(card.branchName || card.worktreePath),
      prOpened: Boolean(card.prUrl),
      repoConfigured: Boolean(card.project.repoPath),
      sharedBranch: worksOnSharedBranch(card),
    });

    switch (plan.kind) {
      case 'invalid':
        throw invalidTransition(plan.message);
      case 'request-changes':
        throw invalidTransition('Use “Request changes” in the card panel to tell the agent what to change.');
      case 'reorder':
        await prisma.card.update({ where: { id: cardId }, data: { position: input.position } });
        break;
      case 'start': {
        const gate = gateOf(card);
        if (gate.kind === 'check' || gate.kind === 'wait') {
          // Stays in New: starts on its own if Claude says it's in scope.
          await scopeService.request(card.id, { start: true });
          break;
        }
        if (gate.kind === 'confirm') {
          if (!input.confirmed) throw confirmationRequired(gate.message);
          await prisma.card.update({ where: { id: cardId }, data: { scopeApproved: true } });
        }
        await this.startWork(card, input.position);
        break;
      }
      case 'out-of-scope':
        throw invalidTransition('Use “Out of scope” in the card panel, to choose what the client is told.');
      case 'back-in-scope':
        await prisma.card.update({
          where: { id: cardId },
          data: { status: 'NEW', position: input.position, scopeApproved: true, startWhenInScope: false, changedOnTrello: false },
        });
        writeBackService.follow(cardId);
        break;
      case 'discard':
        if (plan.confirm && !input.confirmed) throw confirmationRequired(plan.confirm);
        await this.discard(cardId, input.position);
        break;
      case 'done':
        if (plan.confirm && !input.confirmed) throw confirmationRequired(plan.confirm);
        await prisma.card.update({
          where: { id: cardId },
          // A finished shared-branch card lets go of the folder: the next card's work isn't its diff.
          data: {
            status: 'DONE',
            position: input.position,
            waitingSince: null,
            clientRepliedAt: null,
            ...(worksOnSharedBranch(card) ? { worktreePath: null } : {}),
          },
        });
        writeBackService.follow(cardId);
        break;
      case 'reopen': {
        const shared = worksOnSharedBranch(card) && card.project.repoPath;
        if (shared) await assertBranchFree(card);
        const folder = shared
          ? card.project.sharedInRepo
            ? card.project.repoPath
            : sharedWorktreePath(card.projectId, sharedBranchOf(card.project))
          : undefined;
        // Later cards may have committed since: the reopened card's changes start from here.
        const head = folder && (await isWorktree(folder)) ? await gitTry(folder, ['rev-parse', 'HEAD']) : null;
        await prisma.card.update({
          where: { id: cardId },
          data: {
            status: input.status,
            position: input.position,
            ...(folder ? { worktreePath: folder } : {}),
            ...(head ? { startSha: head } : {}),
          },
        });
        writeBackService.follow(cardId);
        break;
      }
      case 'review':
        await prisma.card.update({ where: { id: cardId }, data: { status: input.status, position: input.position } });
        writeBackService.follow(cardId);
        break;
    }
    return cardsService.get(cardId);
  },

  /**
   * New → In progress: name the branch, queue the first run (the worktree, or
   * the shared branch's folder, is prepared by the run).
   */
  async startWork(card: LoadedCard, position: number) {
    const shared = card.project.workMode === 'SHARED_BRANCH';
    if (shared) await assertBranchFree(card);
    await assertRunnerReady();
    const branchName = shared ? sharedBranchOf(card.project) : (card.branchName ?? branchNameFor(card.trelloShortLink, card.title));
    await prisma.$transaction([
      prisma.card.update({ where: { id: card.id }, data: { status: 'IN_PROGRESS', position, branchName } }),
      prisma.run.create({
        data: { cardId: card.id, kind: 'INITIAL', runner: runnerName(), prompt: initialPrompt(card, branchName) },
      }),
    ]);
    writeBackService.follow(card.id);
    void kickQueue();
  },

  /** The scope check said "in scope" for a card dragged to In progress before its verdict. */
  async startAfterScopeCheck(cardId: string) {
    const card = await loadCard(cardId);
    if (card.status !== 'NEW' || !card.project.repoPath) return;
    await this.startWork(card, await endOfColumn(card.projectId, 'IN_PROGRESS'));
  },

  /**
   * New → Out of scope: the card waits for a new agreement with the client.
   * The note (if any) is posted on Trello first, so a failure changes nothing.
   * The card moves to the project's out-of-scope list on Trello, if one is set.
   */
  async setOutOfScope(cardId: string, input: OutOfScopeInput) {
    const card = await loadCard(cardId);
    if (card.status !== 'NEW') throw invalidTransition('Only new cards are set aside as out of scope.');
    if (input.note) await writeBackService.comment(cardId, input.note);
    await prisma.card.update({
      where: { id: cardId },
      data: {
        status: 'OUT_OF_SCOPE',
        position: await endOfColumn(card.projectId, 'OUT_OF_SCOPE'),
        startWhenInScope: false,
        scopeApproved: false,
        ...(input.note ? { scopeNotePostedAt: new Date() } : {}),
      },
    });
    writeBackService.follow(cardId);
    return cardsService.get(cardId);
  },

  /**
   * Retry (INITIAL, optionally resetting uncommitted changes first) or
   * Request changes (FOLLOW_UP, resumes the agent session, Review → In progress).
   */
  async requestRun(cardId: string, input: CreateRunInput) {
    const card = await loadCard(cardId);
    if (activeRunOf(card)) throw invalidTransition('This card already has a run in progress.');
    if (!card.project.repoPath) throw new HttpError(409, 'Add the repository in Project settings first.', 'REPO_NOT_CONFIGURED');
    await assertRunnerReady();
    const shared = worksOnSharedBranch(card);
    if (shared) await assertBranchFree(card);
    const branchName = card.branchName ?? (shared ? sharedBranchOf(card.project) : branchNameFor(card.trelloShortLink, card.title));

    if (input.kind === 'INITIAL') {
      if (card.status !== 'IN_PROGRESS') throw invalidTransition('Retry is for cards In progress.');
      // On a shared branch the folder only holds this card's work once it started (startSha).
      const ownsFolder = !shared || Boolean(card.startSha);
      if (input.resetFirst && ownsFolder && (await isWorktree(card.worktreePath))) await resetChanges(card.worktreePath!);
      await prisma.run.create({
        data: { cardId, kind: 'INITIAL', runner: runnerName(), prompt: initialPrompt(card, branchName) },
      });
    } else {
      if (card.status !== 'REVIEW' && card.status !== 'IN_PROGRESS') {
        throw invalidTransition('Request changes from Review (or In progress after a run).');
      }
      const position = card.status === 'IN_PROGRESS' ? card.position : await endOfColumn(card.projectId, 'IN_PROGRESS');
      await prisma.$transaction([
        prisma.card.update({ where: { id: cardId }, data: { status: 'IN_PROGRESS', position, branchName } }),
        prisma.run.create({
          data: { cardId, kind: 'FOLLOW_UP', runner: runnerName(), prompt: buildFollowUpPrompt(input.followUpText) },
        }),
      ]);
      writeBackService.follow(cardId);
    }
    void kickQueue();
    return cardsService.get(cardId);
  },

  /**
   * Discard work (spec §8.6): stop the run, remove the worktree, delete the
   * branch, back to New. On a shared branch: throw away the uncommitted
   * changes only (commits, the branch and the folder stay). Run history is kept.
   */
  async discard(cardId: string, position?: number) {
    const card = await loadCard(cardId);
    const active = activeRunOf(card);
    if (active) await runsService.cancel(active.id);
    if (worksOnSharedBranch(card)) {
      const folder = card.worktreePath;
      // Only a folder this card started in, still on the shared branch: never the developer's other work.
      if (card.startSha && folder && (await isWorktree(folder)) && (await gitTry(folder, ['branch', '--show-current'])) === card.branchName) {
        await resetChanges(folder);
      }
    } else if (card.project.repoPath && (card.worktreePath || card.branchName)) {
      await removeWorktree({
        repoPath: card.project.repoPath,
        worktreePath: card.worktreePath,
        branchName: card.branchName,
        deleteBranch: Boolean(card.branchName?.startsWith('t2p/')),
      });
    }
    await prisma.card.update({
      where: { id: cardId },
      data: {
        status: 'NEW',
        position: position ?? (await endOfColumn(card.projectId, 'NEW')),
        branchName: null,
        worktreePath: null,
        startSha: null,
        lastSessionId: null,
        prUrl: null,
        changedOnTrello: false,
        sentContentJson: null,
        sentContextAt: null,
        clientQuestions: null,
        clientUpdate: null,
        clientUpdatePostedAt: null,
        waitingSince: null,
        clientRepliedAt: null,
      },
    });
    await removeAttachments(cardId);
    writeBackService.follow(cardId);
    return cardsService.get(cardId);
  },

  /** Shared branch pushed → Done. Returns whether the card moved. */
  async markPushedShared(cardId: string) {
    const card = await loadCard(cardId);
    if (card.status !== 'REVIEW' && !(card.status === 'IN_PROGRESS' && !activeRunOf(card))) return false;
    await prisma.card.update({
      where: { id: cardId },
      data: { status: 'DONE', position: await endOfColumn(card.projectId, 'DONE'), worktreePath: null, waitingSince: null, clientRepliedAt: null },
    });
    writeBackService.follow(cardId);
    return true;
  },

  /** Pull request opened → Done (spec §9.2). */
  async markPrOpened(cardId: string, prUrl: string) {
    const card = await loadCard(cardId);
    const data: { prUrl: string; status?: string; position?: number } = { prUrl };
    if (card.status === 'REVIEW') {
      data.status = 'DONE';
      data.position = await endOfColumn(card.projectId, 'DONE');
    }
    await prisma.card.update({ where: { id: cardId }, data });
    writeBackService.follow(cardId);
  },
};
