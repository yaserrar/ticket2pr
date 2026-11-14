'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '~/lib/query-keys';
import { claudeApi } from '~/services/api/claude';

/** Claude Code login status (checked by starting it without a prompt: no usage). */
export const useClaudeStatus = () =>
  useQuery({ queryKey: qk.claude.status, queryFn: () => claudeApi.status(), staleTime: 5 * 60_000 });

/** Last reported usage and the usage-limit pause. Polls every 30 s. */
export const useClaudeUsage = () =>
  useQuery({ queryKey: qk.claude.usage, queryFn: claudeApi.usage, refetchInterval: 30_000, refetchIntervalInBackground: false });

/** "Resume now": lift the pause (e.g. after upgrading the plan). */
export const useResumeClaude = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: claudeApi.resume,
    onSuccess: (state) => {
      qc.setQueryData(qk.claude.usage, state);
      void qc.invalidateQueries({ queryKey: qk.projects.all });
    },
  });
};

/** "Check again" after signing in with `claude` → /login. */
export const useRecheckClaude = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => claudeApi.status(true),
    onSuccess: (status) => qc.setQueryData(qk.claude.status, status),
  });
};
