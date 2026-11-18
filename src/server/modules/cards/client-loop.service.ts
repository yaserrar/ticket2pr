import 'server-only';
import { prisma } from '~/server/config/prisma';
import { HttpError, notFound } from '~/server/http/errors';
import { authorOf, OWN_UPLOAD_PREFIX } from '~/server/modules/trello/card-context.service';
import { cardPreviewService, parseScreenshots } from '~/server/modules/preview/card-preview.service';
import { trelloService } from '~/server/modules/trello/trello.service';
import { postedIdsOf, writeBackService } from '~/server/modules/trello/write-back.service';
import { contentChanges, contentOf, parseContent } from '~/server/modules/runs/trello-context';
import type { ClientCommentInput } from '~/schemas/card';
import type { TrelloUpdatesDto } from '~/types/client-loop';
import { cardsService } from './cards.service';

/**
 * The client side of a card: the conversation on Trello, what changed since
 * Claude last saw the card, and posting the client update or questions.
 */
async function loadCard(cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw notFound('Card');
  return card;
}

export const clientLoopService = {
  async trelloUpdates(cardId: string): Promise<TrelloUpdatesDto> {
    const card = await loadCard(cardId);
    const posted = postedIdsOf(card.postedCommentIds);
    const client = await trelloService.client();
    const comments = card.removedFromTrello ? [] : await client.cardComments(card.trelloCardId);
    const previous = parseContent(card.sentContentJson);
    return {
      changes: previous ? contentChanges(previous, contentOf(card)) : [],
      comments: comments.slice(0, 30).map((c) => {
        const fromTicket2pr = posted.includes(c.id);
        return {
          id: c.id,
          author: authorOf(c),
          text: c.data.text,
          date: c.date,
          fromTicket2pr,
          isNew: !fromTicket2pr && Boolean(card.sentContextAt && new Date(c.date) > card.sentContextAt),
        };
      }),
      sentAt: card.sentContextAt?.toISOString() ?? null,
    };
  },

  /** "Mark as seen": Claude won't get these Trello changes, and the badge goes away. */
  async dismiss(cardId: string) {
    const card = await loadCard(cardId);
    await prisma.card.update({
      where: { id: cardId },
      data: { sentContentJson: JSON.stringify(contentOf(card)), sentContextAt: new Date(), changedOnTrello: false, clientRepliedAt: null },
    });
    return cardsService.get(cardId);
  },

  /**
   * Posts the client update or the questions on the Trello card. Questions
   * mark the card as waiting for the client (and move it to the "Needs info"
   * list when one is set); the reply shows up with the next sync.
   */
  async comment(cardId: string, input: ClientCommentInput) {
    const card = await loadCard(cardId);
    const screenshots = input.kind === 'UPDATE' ? (input.screenshots ?? []) : [];
    let text = input.text;
    if (screenshots.length) {
      // Upload first: if Trello refuses a file, nothing is posted and the developer can retry.
      const shots = parseScreenshots(card.screenshotsJson);
      const client = await trelloService.client();
      const links: string[] = [];
      for (const file of screenshots) {
        const shot = shots.find((s) => s.file === file);
        if (!shot) throw new HttpError(409, 'That screenshot is gone. Retake the screenshots and try again.', 'CONFLICT');
        const data = await cardPreviewService.image(cardId, file);
        const name = `${OWN_UPLOAD_PREFIX}preview${shot.page === '/' ? '-home' : shot.page.replace(/[^\w]+/g, '-').replace(/-+$/, '')}.png`;
        const uploaded = await client.attachFile(card.trelloCardId, { name, mimeType: 'image/png', data });
        links.push(`- ${shot.page}: ${uploaded.url}`);
      }
      text = `${text}\n\n${links.length === 1 ? 'Screenshot' : 'Screenshots'}:\n${links.join('\n')}`;
    }
    await writeBackService.comment(cardId, text);
    if (input.kind === 'UPDATE') {
      await prisma.card.update({ where: { id: cardId }, data: { clientUpdatePostedAt: new Date() } });
    } else {
      await prisma.card.update({ where: { id: cardId }, data: { waitingSince: new Date(), clientRepliedAt: null } });
      writeBackService.follow(cardId);
    }
    return cardsService.get(cardId);
  },
};
