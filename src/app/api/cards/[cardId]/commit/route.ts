import { route } from '~/server/http/route';
import { cardParams, commitBody } from '~/schemas/card';
import { cardGitService } from '~/server/modules/git/card-git.service';

export const POST = route({ params: cardParams, body: commitBody }, ({ params, body }) =>
  cardGitService.commit(params.cardId, body),
);
