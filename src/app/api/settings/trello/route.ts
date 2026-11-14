import { route } from '~/server/http/route';
import { settingsService } from '~/server/modules/settings/settings.service';

/** Disconnect Trello: forgets the stored key and token. */
export const DELETE = route({}, () => settingsService.disconnectTrello());
