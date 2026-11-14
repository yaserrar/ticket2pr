import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { clientLoopService } from '~/server/modules/cards/client-loop.service';

/** Mark the Trello changes as seen without sending them to Claude. */
export const POST = route({ params: cardParams }, ({ params }) => clientLoopService.dismiss(params.cardId));
