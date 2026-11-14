import { route } from '~/server/http/route';
import { projectBody, projectParams } from '~/schemas/project';
import { projectsService } from '~/server/modules/projects/projects.service';

export const GET = route({ params: projectParams }, ({ params }) => projectsService.get(params.projectId));

export const PUT = route({ params: projectParams, body: projectBody }, ({ params, body }) =>
  projectsService.update(params.projectId, body),
);

export const DELETE = route({ params: projectParams }, ({ params }) => projectsService.remove(params.projectId));
