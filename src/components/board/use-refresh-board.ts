'use client';

import { toast } from 'sonner';
import { useSyncProject } from '~/hooks/projects';
import { getErrorMessage } from '~/lib/api-errors';
import { describeSync } from '~/lib/sync';

/** Manual "Refresh": syncs with Trello and toasts the outcome (spec §6.4). */
export function useRefreshBoard(projectId: string | undefined) {
  const sync = useSyncProject(projectId ?? '');
  const refresh = () => {
    if (!projectId || sync.isPending) return;
    sync.mutate(undefined, {
      onSuccess: (result) => toast.success(describeSync(result)),
    });
  };
  return { refresh, isPending: sync.isPending, error: sync.error ? getErrorMessage(sync.error) : null };
}
