import { route } from '~/server/http/route';
import { projectParams, usageQuery } from '~/schemas/project';
import { workUsageService } from '~/server/modules/usage/work-usage.service';

export const GET = route({ params: projectParams, query: usageQuery }, ({ params, query }) => workUsageService.project(params.projectId, query.period));
