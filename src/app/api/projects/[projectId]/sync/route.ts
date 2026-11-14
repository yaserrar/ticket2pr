import { route } from '~/server/http/route';
import { projectParams, syncBody } from '~/schemas/project';
import { syncService } from '~/server/modules/sync/sync.service';

export const POST = route({ params: projectParams, body: syncBody }, ({ params, body }) =>
  syncService.syncProject(params.projectId, body.trigger),
);
