import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { workflowService } from '~/server/modules/workflow/workflow.service';

export const POST = route({ params: cardParams }, ({ params }) => workflowService.discard(params.cardId));
