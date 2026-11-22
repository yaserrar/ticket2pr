import { route } from '~/server/http/route';
import { projectParams, usageQuery, usageResetQuery } from '~/schemas/project';
import { workUsageService } from '~/server/modules/usage/work-usage.service';

export const GET = route({ params: projectParams, query: usageQuery }, ({ params, query }) => workUsageService.project(params.projectId, query.period));

/** Starts a project's usage afresh, e.g. after an invoice: deletes the runs that started before `before`. */
export const DELETE = route({ params: projectParams, query: usageResetQuery }, ({ params, query }) =>
  workUsageService.resetBefore(params.projectId, query.before),
);
