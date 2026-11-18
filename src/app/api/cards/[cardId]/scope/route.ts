import { route } from '~/server/http/route';
import { cardParams, scopeCheckBody } from '~/schemas/card';
import { scopeService } from '~/server/modules/scope/scope.service';

/** Check the card's scope now (again); `start` begins the work once Claude says it's in scope. */
export const POST = route({ params: cardParams, body: scopeCheckBody }, ({ params, body }) => scopeService.request(params.cardId, body));
