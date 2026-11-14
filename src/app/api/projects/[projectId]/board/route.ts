import { route } from '~/server/http/route';
import { projectParams } from '~/schemas/project';
import { cardsService } from '~/server/modules/cards/cards.service';

export const GET = route({ params: projectParams }, ({ params }) => cardsService.board(params.projectId));
