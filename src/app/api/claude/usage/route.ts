import { route } from '~/server/http/route';
import { usageService } from '~/server/modules/claude/usage.service';

/** Last reported Claude usage, and whether the queue is paused at the limit. */
export const GET = route({}, () => usageService.state());
