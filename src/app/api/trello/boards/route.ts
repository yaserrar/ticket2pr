import { route } from '~/server/http/route';
import { trelloService } from '~/server/modules/trello/trello.service';

export const GET = route({}, () => trelloService.listBoards());
