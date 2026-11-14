import { route } from '~/server/http/route';
import { runParams } from '~/schemas/card';
import { runsService } from '~/server/modules/runs/runs.service';

export const GET = route({ params: runParams }, ({ params }) => runsService.get(params.runId));

/** Stop (spec §7.5). */
export const DELETE = route({ params: runParams }, ({ params }) => runsService.cancel(params.runId));
