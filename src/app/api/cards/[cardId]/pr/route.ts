import { route } from '~/server/http/route';
import { cardParams, openPrBody } from '~/schemas/card';
import { cardGitService } from '~/server/modules/git/card-git.service';

export const POST = route({ params: cardParams, body: openPrBody }, ({ params, body }) =>
  cardGitService.openPr(params.cardId, body),
);
