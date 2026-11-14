import { route } from '~/server/http/route';
import { projectBody } from '~/schemas/project';
import { projectsService } from '~/server/modules/projects/projects.service';

export const GET = route({}, () => projectsService.list());

export const POST = route({ body: projectBody, status: 201 }, ({ body }) => projectsService.create(body));
