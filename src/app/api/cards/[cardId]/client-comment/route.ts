import { route } from '~/server/http/route';
import { cardParams, clientCommentBody } from '~/schemas/card';
import { clientLoopService } from '~/server/modules/cards/client-loop.service';

/** Post the client update or the questions on the Trello card. */
export const POST = route({ params: cardParams, body: clientCommentBody }, ({ params, body }) => clientLoopService.comment(params.cardId, body));
