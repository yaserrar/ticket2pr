import { route } from '~/server/http/route';
import { cardParams, moveCardBody } from '~/schemas/card';
import { workflowService } from '~/server/modules/workflow/workflow.service';

export const PATCH = route({ params: cardParams, body: moveCardBody }, ({ params, body }) =>
  workflowService.moveCard(params.cardId, body),
);
