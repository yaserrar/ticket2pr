import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { cardGitService } from '~/server/modules/git/card-git.service';

/** Throws away uncommitted changes in the card's worktree. */
export const POST = route({ params: cardParams }, ({ params }) => cardGitService.reset(params.cardId));
