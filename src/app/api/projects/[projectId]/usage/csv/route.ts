import { route } from '~/server/http/route';
import { projectParams, usageQuery } from '~/schemas/project';
import { workUsageService } from '~/server/modules/usage/work-usage.service';

/** The per-card usage of a period as a CSV download, for billing. */
export const GET = route({ params: projectParams, query: usageQuery }, async ({ params, query }) => {
  const { filename, body } = await workUsageService.csv(params.projectId, query.period);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
