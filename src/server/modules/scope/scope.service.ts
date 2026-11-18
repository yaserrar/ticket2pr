import 'server-only';
import { existsSync } from 'node:fs';
import { prisma } from '~/server/config/prisma';
import { logger } from '~/server/config/logger';
import { invalidTransition, notFound } from '~/server/http/errors';
import { cardChecklistsSchema, cardLabelsSchema } from '~/schemas/card';
import { parseJson } from '~/server/presenters/card.presenter';
import { cardsService } from '~/server/modules/cards/cards.service';
import { UsageLimitError, usageService } from '~/server/modules/claude/usage.service';
import type { Card, Project } from '~/generated/prisma/client';
import { getScopeClassifier } from './scope-classifier';
import { scopeContentKey } from './scope-content';
import { buildScopePrompt } from './scope-prompt';

/**
 * Scope checks: a small in-process queue, one card at a time. A card waits
 * with `scopeStatus = CHECKING` (so a server restart picks it up again). A
 * card dragged to In progress before its verdict starts on its own when
 * Claude says it's in scope; otherwise it stays in New for the developer.
 */
const g = globalThis as unknown as { t2pScope?: { busy: boolean; again: boolean; timer?: ReturnType<typeof setTimeout> } };
const state = (g.t2pScope ??= { busy: false, again: false });

/** Cards that can be checked: new ones, and ones set aside (the client may have narrowed the request). */
const CHECKABLE = ['NEW', 'OUT_OF_SCOPE'];

export const scopeService = {
  /** Check a card now (again). `start`: begin the work once Claude says it's in scope. */
  async request(cardId: string, { start = false } = {}) {
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { project: true } });
    if (!card) throw notFound('Card');
    if (!card.project.scopeCheck) throw invalidTransition('The scope check is off for this project. Turn it on in Project settings.');
    if (!CHECKABLE.includes(card.status)) throw invalidTransition('Only new cards are checked.');
    await prisma.card.update({
      where: { id: cardId },
      data: {
        scopeStatus: 'CHECKING',
        scopeError: null,
        scopeApproved: false,
        startWhenInScope: start && card.status === 'NEW' ? true : card.startWhenInScope,
      },
    });
    void kickScopeQueue();
    return cardsService.get(cardId);
  },

  /**
   * After a sync or a settings change: new cards without a verdict, or edited
   * on Trello since, are checked. Approved cards and failed checks of
   * unchanged cards are left alone.
   */
  async queueProject(projectId: string, { all = false } = {}) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { scopeCheck: true } });
    if (!project?.scopeCheck) return;
    const cards = await prisma.card.findMany({
      // Spelled out: `NOT { scopeStatus: 'CHECKING' }` would also drop never-checked cards (SQL NULL).
      where: {
        projectId,
        status: 'NEW',
        scopeApproved: false,
        removedFromTrello: false,
        OR: [{ scopeStatus: null }, { scopeStatus: { not: 'CHECKING' } }],
      },
      select: { id: true, scopeStatus: true, scopeContentKey: true, title: true, description: true, labelsJson: true, checklistsJson: true },
    });
    const ids = cards.filter((c) => all || !c.scopeStatus || c.scopeContentKey !== scopeContentKey(c)).map((c) => c.id);
    if (!ids.length) return;
    await prisma.card.updateMany({ where: { id: { in: ids } }, data: { scopeStatus: 'CHECKING', scopeError: null } });
    void kickScopeQueue();
  },

  /** Scope check turned off: pending checks are dropped. */
  async cancelProject(projectId: string) {
    await prisma.card.updateMany({
      where: { projectId, scopeStatus: 'CHECKING' },
      data: { scopeStatus: null, startWhenInScope: false },
    });
  },
};

export async function kickScopeQueue(): Promise<void> {
  if (state.busy) {
    state.again = true;
    return;
  }
  state.busy = true;
  try {
    do {
      state.again = false;
      await drain();
    } while (state.again);
  } catch (error) {
    logger.error({ err: error }, 'Scope queue failed');
  } finally {
    state.busy = false;
  }
}

function retryAt(at: Date) {
  if (state.timer) clearTimeout(state.timer);
  const ms = Math.min(Math.max(at.getTime() - Date.now() + 2_000, 1_000), 2 ** 31 - 1);
  state.timer = setTimeout(() => {
    state.timer = undefined;
    void kickScopeQueue();
  }, ms);
}

async function drain() {
  for (;;) {
    const pausedUntil = await usageService.pausedUntil();
    if (pausedUntil) return retryAt(pausedUntil);

    const card = await prisma.card.findFirst({
      where: { scopeStatus: 'CHECKING' },
      orderBy: { updatedAt: 'asc' },
      include: { project: true },
    });
    if (!card) return;
    if (!card.project.scopeCheck || !CHECKABLE.includes(card.status)) {
      await prisma.card.update({ where: { id: card.id }, data: { scopeStatus: null, startWhenInScope: false } });
      continue;
    }
    const stop = await checkOne(card);
    if (stop) return;
  }
}

/** Classifies one card and stores the verdict. Returns true when the queue must stop (usage limit). */
async function checkOne(card: Card & { project: Project }): Promise<boolean> {
  const key = scopeContentKey(card);
  const repo = card.project.repoPath && existsSync(card.project.repoPath) ? card.project.repoPath : null;
  const prompt = buildScopePrompt({
    card: {
      shortLink: card.trelloShortLink,
      title: card.title,
      description: card.description,
      labels: parseJson(card.labelsJson, cardLabelsSchema, []),
      checklists: parseJson(card.checklistsJson, cardChecklistsSchema, []),
    },
    rules: card.project.scopeRules,
    hasRepository: Boolean(repo),
  });

  let result;
  try {
    result = await getScopeClassifier()({ prompt, cwd: repo, cardText: `${card.title}\n${card.description}` });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      // The card stays CHECKING and is checked after the reset, like queued runs.
      retryAt(await usageService.pause(error.resetsAt));
      return true;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error, cardId: card.id }, 'Scope check failed');
    await prisma.card.updateMany({
      where: { id: card.id, scopeStatus: 'CHECKING' },
      data: { scopeStatus: 'FAILED', scopeError: message, scopeCheckedAt: new Date(), scopeContentKey: key, startWhenInScope: false },
    });
    return false;
  }

  const fresh = await prisma.card.findUnique({ where: { id: card.id } });
  // Started anyway, moved, or the check was dropped meanwhile.
  if (!fresh || fresh.scopeStatus !== 'CHECKING') return false;
  // Edited on Trello during the check: check the new content (it stays CHECKING).
  if (scopeContentKey(fresh) !== key) {
    await prisma.card.update({ where: { id: card.id }, data: { scopeContentKey: null } });
    return false;
  }

  const startNow = fresh.startWhenInScope && fresh.status === 'NEW' && result.verdict === 'IN_SCOPE';
  await prisma.card.update({
    where: { id: card.id },
    data: {
      scopeStatus: result.verdict,
      scopeKind: result.kind,
      scopeSize: result.size,
      scopeReason: result.reason,
      scopeClientNote: result.verdict === 'IN_SCOPE' ? null : result.clientNote || null,
      scopeError: null,
      scopeCheckedAt: new Date(),
      scopeContentKey: key,
      startWhenInScope: false,
    },
  });

  if (startNow) {
    try {
      const { workflowService } = await import('~/server/modules/workflow/workflow.service');
      await workflowService.startAfterScopeCheck(card.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.card.update({ where: { id: card.id }, data: { scopeError: `In scope, but it couldn’t start: ${message}` } });
    }
  }
  return false;
}
