import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { cardGitService } from '~/server/modules/git/card-git.service';

/** Merges the latest base branch into the card branch (aborted on conflict). */
export const POST = route({ params: cardParams }, ({ params }) => cardGitService.updateBase(params.cardId));
