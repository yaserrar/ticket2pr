import { z } from 'zod';
import { route } from '~/server/http/route';
import { notificationsService } from '~/server/modules/notifications/notifications.service';

/** Events since `after` (ISO). Without it: just the current time, to start from. */
export const GET = route({ query: z.object({ after: z.iso.datetime().optional() }) }, ({ query }) =>
  notificationsService.feed(query.after ? new Date(query.after) : null),
);
