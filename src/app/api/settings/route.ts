import { route } from '~/server/http/route';
import { updateSettingsBody } from '~/schemas/settings';
import { settingsService } from '~/server/modules/settings/settings.service';

export const GET = route({}, () => settingsService.get());

export const PUT = route({ body: updateSettingsBody }, ({ body }) => settingsService.update(body));
