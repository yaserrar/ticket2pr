import { route } from '~/server/http/route';
import { cardParams, outOfScopeBody } from '~/schemas/card';
import { workflowService } from '~/server/modules/workflow/workflow.service';

/** Set a new card aside until the client agrees to the new work (optionally telling them on Trello). */
export const POST = route({ params: cardParams, body: outOfScopeBody }, ({ params, body }) => workflowService.setOutOfScope(params.cardId, body));
