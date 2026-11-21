import { route } from '~/server/http/route';
import { checkSuggestionsBody } from '~/schemas/project';
import { projectsService } from '~/server/modules/projects/projects.service';

/** Typecheck, lint and tests found in the repository, to fill the project's checks. */
export const POST = route({ body: checkSuggestionsBody }, ({ body }) => projectsService.suggestChecks(body.repoPath));
