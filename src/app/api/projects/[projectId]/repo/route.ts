import { z } from 'zod';
import { route } from '~/server/http/route';
import { projectParams } from '~/schemas/project';
import { repoStatusService } from '~/server/modules/projects/repo-status.service';

/** The repository folder vs origin. Fetches at most once a minute; `?refresh=1` fetches now. */
export const GET = route({ params: projectParams, query: z.object({ refresh: z.enum(['0', '1']).optional() }) }, ({ params, query }) =>
  repoStatusService.status(params.projectId, { refresh: query.refresh === '1' }),
);
