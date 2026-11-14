import type { TestTrelloInput, UpdateSettingsInput } from '~/schemas/settings';
import type { SettingsDto } from '~/types/settings';
import type { TrelloMemberDto } from '~/types/trello';
import { api } from './client';

export const settingsApi = {
  get: () => api.get<SettingsDto>('/settings'),
  update: (body: UpdateSettingsInput) => api.put<SettingsDto>('/settings', body),
  testTrello: (body: TestTrelloInput = {}) => api.post<TrelloMemberDto>('/settings/test-trello', body),
  disconnectTrello: () => api.delete<SettingsDto>('/settings/trello'),
};
