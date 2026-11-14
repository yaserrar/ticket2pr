'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '~/lib/query-keys';
import { settingsApi } from '~/services/api/settings';
import type { TestTrelloInput, UpdateSettingsInput } from '~/schemas/settings';

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: settingsApi.get });

export const useUpdateSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsInput) => settingsApi.update(body),
    onSuccess: (settings) => {
      qc.setQueryData(qk.settings, settings);
      // New credentials can see other boards.
      void qc.invalidateQueries({ queryKey: ['trello'] });
    },
  });
};

/** Tests credentials without saving them. Errors are shown inline by the form. */
export const useTestTrello = () =>
  useMutation({ mutationFn: (body: TestTrelloInput) => settingsApi.testTrello(body), meta: { silent: true } });

export const useDisconnectTrello = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.disconnectTrello,
    onSuccess: (settings) => {
      qc.setQueryData(qk.settings, settings);
      qc.removeQueries({ queryKey: ['trello'] });
    },
  });
};
