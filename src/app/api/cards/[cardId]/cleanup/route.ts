import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { cardGitService } from '~/server/modules/git/card-git.service';

/** Done card: removes its worktree, and its local branch once pushed. */
export const POST = route({ params: cardParams }, ({ params }) => cardGitService.cleanup(params.cardId));
