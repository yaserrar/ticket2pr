import { route } from '~/server/http/route';
import { projectParams } from '~/schemas/project';
import { repoStatusService } from '~/server/modules/projects/repo-status.service';

/** Fast-forwards the repository folder's branch from origin. */
export const POST = route({ params: projectParams }, ({ params }) => repoStatusService.pull(params.projectId));
