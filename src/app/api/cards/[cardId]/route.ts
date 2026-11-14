import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { cardsService } from '~/server/modules/cards/cards.service';

export const GET = route({ params: cardParams }, ({ params }) => cardsService.get(params.cardId));
