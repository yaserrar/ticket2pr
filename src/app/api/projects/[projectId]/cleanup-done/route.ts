import { route } from '~/server/http/route';
import { projectParams } from '~/schemas/project';
import { cardGitService } from '~/server/modules/git/card-git.service';

/** Removes the worktrees of every Done card, and their local branches once pushed. */
export const POST = route({ params: projectParams }, ({ params }) => cardGitService.cleanupDone(params.projectId));
