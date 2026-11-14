import { z } from 'zod';
import { route } from '~/server/http/route';
import { trelloIdSchema } from '~/schemas/common';
import { trelloService } from '~/server/modules/trello/trello.service';

export const GET = route({ params: z.object({ boardId: trelloIdSchema }) }, ({ params }) =>
  trelloService.listLists(params.boardId),
);
