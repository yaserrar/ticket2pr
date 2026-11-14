import { z } from 'zod';
import { route } from '~/server/http/route';
import { claudeStatus } from '~/server/modules/claude/claude.client';

/** Is Claude Code signed in? Starts it without a prompt: uses nothing from the plan. `?refresh=1` skips the cache. */
export const GET = route({ query: z.object({ refresh: z.enum(['0', '1']).optional() }) }, ({ query }) =>
  claudeStatus({ refresh: query.refresh === '1' }),
);
