import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { clientLoopService } from '~/server/modules/cards/client-loop.service';

/** The Trello conversation of the card, and what changed since Claude last saw it. */
export const GET = route({ params: cardParams }, ({ params }) => clientLoopService.trelloUpdates(params.cardId));
