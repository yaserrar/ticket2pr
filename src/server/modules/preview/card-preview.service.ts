import 'server-only';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { prisma } from '~/server/config/prisma';
import { logger } from '~/server/config/logger';
import { HttpError, notFound } from '~/server/http/errors';
import { cardsService } from '~/server/modules/cards/cards.service';
import { isWorktree } from '~/server/modules/git/worktree';
import { pruneScreenshots, screenshotPath, screenshotsSchema, takeScreenshots, type Screenshot } from './preview.service';

/**
 * A card's screenshots: taken after each run on the pages Claude named, or
 * again on request ("Retake"). They replace the previous ones, and the
 * developer picks which go to Trello with the client update.
 */
export function parseScreenshots(json: string | null): Screenshot[] {
  if (!json) return [];
  try {
    const parsed = screenshotsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function parsePages(json: string | null): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export const cardPreviewService = {
  /** Takes the screenshots and stores them on the card. Never throws: a failure is stored and logged. */
  async capture(input: { cardId: string; prefix: string; pages: string[]; log: (m: string) => Promise<void>; signal?: AbortSignal }) {
    const card = await prisma.card.findUnique({ where: { id: input.cardId }, include: { project: true } });
    if (!card) return;
    const { project } = card;
    if (!project.previewEnabled || !project.previewCommand?.trim() || !project.repoPath) return;
    if (!input.pages.length) {
      await prisma.card.update({ where: { id: card.id }, data: { previewPagesJson: '[]', screenshotsJson: '[]', screenshotError: null } });
      await pruneScreenshots(card.id, []);
      await input.log('No screenshots: Claude didn’t name a public page that shows the change.');
      return;
    }
    const folder = card.worktreePath;
    if (!folder || !(await isWorktree(folder))) return;
    try {
      const shots = await takeScreenshots({
        cardId: card.id,
        prefix: input.prefix,
        folder,
        repoPath: project.repoPath,
        command: project.previewCommand,
        urlTemplate: project.previewUrl,
        pages: input.pages,
        log: input.log,
        signal: input.signal,
      });
      await prisma.card.update({
        where: { id: card.id },
        data: {
          previewPagesJson: JSON.stringify(input.pages),
          screenshotsJson: JSON.stringify(shots),
          screenshotError: shots.length ? null : 'No page could be captured. See the run log.',
        },
      });
      await pruneScreenshots(card.id, shots.map((s) => s.file));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ err: error, cardId: card.id }, 'Screenshots failed');
      await input.log(`Screenshots failed: ${message}`);
      await prisma.card.update({
        where: { id: card.id },
        data: { previewPagesJson: JSON.stringify(input.pages), screenshotError: message.split('\n')[0] ?? message },
      });
    }
  },

  /** "Retake screenshots" from the Client tab (optionally on other pages). */
  async retake(cardId: string, pages: string[]) {
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { project: true, runs: { take: 1, orderBy: { createdAt: 'desc' } } } });
    if (!card) throw notFound('Card');
    if (!card.project.previewEnabled || !card.project.previewCommand?.trim()) {
      throw new HttpError(409, 'Turn on screenshots in Project settings first.', 'CONFLICT');
    }
    if (card.runs[0]?.status === 'RUNNING') throw new HttpError(409, 'Wait for the run to finish first.', 'CONFLICT');
    if (!card.worktreePath || !(await isWorktree(card.worktreePath))) {
      throw new HttpError(409, 'This card has no folder with its changes anymore.', 'GIT_ERROR');
    }
    const log: string[] = [];
    await this.capture({ cardId, prefix: `r${Date.now().toString(36)}`, pages, log: async (m) => void log.push(m) });
    return cardsService.get(cardId);
  },

  /** The PNG of one screenshot (only the card's own files). */
  async image(cardId: string, file: string) {
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { screenshotsJson: true } });
    const known = card && parseScreenshots(card.screenshotsJson).some((s) => s.file === file);
    const filePath = known ? screenshotPath(cardId, file) : null;
    if (!filePath || !existsSync(filePath)) throw notFound('Screenshot');
    return readFile(filePath);
  },
};
