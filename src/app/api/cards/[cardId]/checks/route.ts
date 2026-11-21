import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { checksService } from '~/server/modules/checks/checks.service';
import { workflowService } from '~/server/modules/workflow/workflow.service';

/** The checks of the card's runs, newest first. */
export const GET = route({ params: cardParams }, ({ params }) => checksService.forCard(params.cardId));

/** Run the project's checks again on the card's folder (after editing it by hand). */
export const POST = route({ params: cardParams, status: 201 }, ({ params }) => workflowService.requestChecks(params.cardId));
