import type { RunDto } from '~/types/run';
import { api } from './client';

export const runsApi = {
  get: (runId: string) => api.get<RunDto>(`/runs/${runId}`),
  cancel: (runId: string) => api.delete<RunDto>(`/runs/${runId}`),
  streamUrl: (runId: string, lastSeq = -1) => api.url(`/runs/${runId}/stream`, { lastSeq }),
};
