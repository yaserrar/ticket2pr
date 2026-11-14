import { route } from '~/server/http/route';
import { cardParams, createRunBody } from '~/schemas/card';
import { runsService } from '~/server/modules/runs/runs.service';
import { workflowService } from '~/server/modules/workflow/workflow.service';

export const GET = route({ params: cardParams }, ({ params }) => runsService.listForCard(params.cardId));

/** Retry (INITIAL) or Request changes (FOLLOW_UP). */
export const POST = route({ params: cardParams, body: createRunBody, status: 201 }, ({ params, body }) =>
  workflowService.requestRun(params.cardId, body),
);
