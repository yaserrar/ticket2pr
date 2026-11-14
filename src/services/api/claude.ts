import type { ClaudeStatusDto } from '~/types/claude';
import type { ClaudeUsageStateDto, NotificationsDto } from '~/types/client-loop';
import { api } from './client';

export const claudeApi = {
  status: (refresh = false) => api.get<ClaudeStatusDto>('/claude/status', refresh ? { refresh: '1' } : undefined),
  usage: () => api.get<ClaudeUsageStateDto>('/claude/usage'),
  resume: () => api.post<ClaudeUsageStateDto>('/claude/usage/resume'),
  notifications: (after: string | null) => api.get<NotificationsDto>('/notifications', after ? { after } : undefined),
};
