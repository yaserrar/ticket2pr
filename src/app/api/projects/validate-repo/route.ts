import { route } from '~/server/http/route';
import { validateRepoBody } from '~/schemas/project';
import { projectsService } from '~/server/modules/projects/projects.service';

export const POST = route({ body: validateRepoBody }, ({ body }) => projectsService.validateRepo(body.repoPath));
