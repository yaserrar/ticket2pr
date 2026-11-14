import { route } from '~/server/http/route';
import { usageService } from '~/server/modules/claude/usage.service';
import { kickQueue } from '~/server/modules/runs/run-queue';

/** "Resume now": lift the usage-limit pause and start queued runs. */
export const POST = route({}, async () => {
  await usageService.resume();
  void kickQueue();
  return usageService.state();
});
