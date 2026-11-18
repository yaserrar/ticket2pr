import { route } from '~/server/http/route';
import { cardParams, pushBody } from '~/schemas/card';
import { cardGitService } from '~/server/modules/git/card-git.service';

export const POST = route({ params: cardParams, body: pushBody }, ({ params, body }) => cardGitService.push(params.cardId, body));
