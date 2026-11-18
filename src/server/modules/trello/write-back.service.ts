import 'server-only';
import { z } from 'zod';
import { prisma } from '~/server/config/prisma';
import { logger } from '~/server/config/logger';
import { HttpError, notFound } from '~/server/http/errors';
import { trelloService } from './trello.service';

/**
 * Trello write-back (spec §6.5). Moves follow the card's status to the lists
 * set in Project settings; they run in the background and never block the
 * workflow: a failure is stored on the card (`trelloError`) and shown as a
 * badge. Comments (client update, questions) are posted on request only.
 */
const postedSchema = z.array(z.string()).catch([]);
export const postedIdsOf = (json: string) => {
  try {
    return postedSchema.parse(JSON.parse(json));
  } catch {
    return [];
  }
};

type ListMapping = {
  trelloSourceListId: string;
  trelloInProgressListId: string | null;
  trelloReviewListId: string | null;
  trelloDoneListId: string | null;
  trelloNeedsInfoListId: string | null;
  trelloOutOfScopeListId: string | null;
};

/** The Trello list a card belongs in for its status (null: leave it where it is). */
export function targetList(card: { status: string; waitingSince: Date | null }, project: ListMapping): string | null {
  const anyMapping =
    project.trelloInProgressListId ||
    project.trelloReviewListId ||
    project.trelloDoneListId ||
    project.trelloNeedsInfoListId ||
    project.trelloOutOfScopeListId;
  if (!anyMapping) return null;
  switch (card.status) {
    case 'NEW':
      // Discarded, or back in scope: back where the client put it.
      return project.trelloSourceListId;
    case 'IN_PROGRESS':
      return project.trelloInProgressListId;
    case 'REVIEW':
      return card.waitingSince && project.trelloNeedsInfoListId ? project.trelloNeedsInfoListId : project.trelloReviewListId;
    case 'DONE':
      return project.trelloDoneListId;
    case 'OUT_OF_SCOPE':
      return project.trelloOutOfScopeListId;
    default:
      return null;
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const writeBackService = {
  /** Moves the Trello card to the list for its current status. Never throws. */
  async syncList(cardId: string): Promise<void> {
    try {
      const card = await prisma.card.findUnique({ where: { id: cardId }, include: { project: true } });
      if (!card || card.removedFromTrello) return;
      const listId = targetList(card, card.project);
      if (!listId || listId === card.trelloListId) {
        if (card.trelloError) await prisma.card.update({ where: { id: cardId }, data: { trelloError: null } });
        return;
      }
      const client = await trelloService.client();
      await client.moveCard(card.trelloCardId, listId);
      await prisma.card.update({ where: { id: cardId }, data: { trelloListId: listId, trelloError: null } });
    } catch (error) {
      logger.warn({ err: error, cardId }, 'Trello write-back failed');
      await prisma.card
        .update({ where: { id: cardId }, data: { trelloError: `Couldn’t move the card on Trello: ${errorText(error)}` } })
        .catch(() => undefined);
    }
  },

  /** Background version for status changes. */
  follow(cardId: string) {
    void this.syncList(cardId);
  },

  /** Posts a comment from Ticket2PR and remembers its id (so it is never mistaken for the client's). */
  async comment(cardId: string, text: string) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw notFound('Card');
    if (card.removedFromTrello) throw new HttpError(409, 'This card was removed from Trello.', 'TRELLO_NOT_FOUND');
    const client = await trelloService.client();
    const { id } = await client.addComment(card.trelloCardId, text);
    const posted = [...postedIdsOf(card.postedCommentIds), id].slice(-200);
    await prisma.card.update({ where: { id: cardId }, data: { postedCommentIds: JSON.stringify(posted) } });
    return id;
  },
};
