import { route } from '~/server/http/route';
import { cardParams } from '~/schemas/card';
import { cardGitService } from '~/server/modules/git/card-git.service';

export const GET = route({ params: cardParams }, ({ params }) => cardGitService.status(params.cardId));
