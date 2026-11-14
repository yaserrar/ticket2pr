import { route } from '~/server/http/route';
import { cardParams, pullRequestBody } from '~/schemas/card';
import { cardGitService } from '~/server/modules/git/card-git.service';

export const POST = route({ params: cardParams, body: pullRequestBody }, ({ params, body }) =>
  cardGitService.openPr(params.cardId, body),
);
