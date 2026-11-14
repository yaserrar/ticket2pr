import { route } from '~/server/http/route';
import { testTrelloBody } from '~/schemas/settings';
import { settingsService } from '~/server/modules/settings/settings.service';

export const POST = route({ body: testTrelloBody }, ({ body }) => settingsService.testTrello(body));
