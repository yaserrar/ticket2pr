'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '~/lib/query-keys';
import { projectsApi } from '~/services/api/projects';
import type { ProjectInput } from '~/schemas/project';
import type { UsagePeriod } from '~/lib/usage';
import type { BoardDto } from '~/types/card';
import type { ProjectDto, SyncResultDto } from '~/types/project';

export const useProjects = () => useQuery({ queryKey: qk.projects.list(), queryFn: projectsApi.list });

const hasActiveRun = (board: BoardDto | undefined) =>
  Boolean(board && Object.values(board.columns).some((cards) => cards.some((c) => c.activeRun)));
const hasScopeCheck = (board: BoardDto | undefined) => Boolean(board && Object.values(board.columns).some((cards) => cards.some((c) => c.scope.status === 'CHECKING')));

/** The board. Polls while a run is queued or running (1.5 s) or a scope check is pending (3 s), so cards update on their own. */
export const useBoard = (projectId: string) =>
  useQuery({
    queryKey: qk.projects.board(projectId),
    queryFn: () => projectsApi.board(projectId),
    enabled: Boolean(projectId),
    refetchInterval: (query) => (hasActiveRun(query.state.data) ? 1500 : hasScopeCheck(query.state.data) ? 3000 : false),
  });

/** The repository folder vs origin. The server fetches at most once a minute. */
export const useRepoStatus = (projectId: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.projects.repo(projectId),
    queryFn: () => projectsApi.repo(projectId),
    enabled: Boolean(projectId) && enabled,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

/** "Check again": fetch from origin now. */
export const useRefreshRepoStatus = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => projectsApi.repo(projectId, true),
    onSuccess: (status) => qc.setQueryData(qk.projects.repo(projectId), status),
  });
};

/** Fast-forward the repository folder from origin. The caller toasts the result. */
export const usePullRepo = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => projectsApi.pull(projectId),
    meta: { silent: true },
    onSuccess: (status) => qc.setQueryData(qk.projects.repo(projectId), status),
    onSettled: () => qc.invalidateQueries({ queryKey: ['cards'] }),
  });
};

/** Remove the worktrees of every Done card (and their branches once pushed). */
export const useCleanupDone = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => projectsApi.cleanupDone(projectId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.projects.board(projectId) });
      void qc.invalidateQueries({ queryKey: ['cards'] });
    },
  });
};

/** Time and Claude usage per period. Refreshes while open, so finished runs show up. */
export const useProjectUsage = (projectId: string, period: UsagePeriod) =>
  useQuery({
    queryKey: qk.projects.usage(projectId, period),
    queryFn: () => projectsApi.usage(projectId, period),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

/** Typecheck, lint and tests found in the repository. Errors show inline in the form. */
export const useSuggestChecks = () =>
  useMutation({ mutationFn: (repoPath: string) => projectsApi.checkSuggestions(repoPath), meta: { silent: true } });

/** Checks a repository path (spec §8.1). Errors show inline in the form. */
export const useValidateRepo = () =>
  useMutation({ mutationFn: (repoPath: string) => projectsApi.validateRepo(repoPath), meta: { silent: true } });

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectInput) => projectsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects.all }),
  });
};

export const useUpdateProject = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectInput) => projectsApi.update(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects.all }),
  });
};

export const useDeleteProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => projectsApi.remove(projectId),
    onSuccess: (_data, projectId) => {
      qc.setQueryData<ProjectDto[]>(qk.projects.list(), (list) => list?.filter((p) => p.id !== projectId));
      qc.removeQueries({ queryKey: ['projects', projectId] });
    },
  });
};

/**
 * After a sync: refetch the board when something changed, otherwise just
 * bump "Synced … ago" in the cache. A failed sync refetches the board so the
 * error stored by the server shows up.
 */
function afterSync(qc: QueryClient, projectId: string, result?: SyncResultDto) {
  if (!result || result.added || result.updated || result.removed) {
    void qc.invalidateQueries({ queryKey: qk.projects.board(projectId) });
    void qc.invalidateQueries({ queryKey: qk.projects.list() });
    void qc.invalidateQueries({ queryKey: ['cards'] });
    return;
  }
  qc.setQueryData<BoardDto>(qk.projects.board(projectId), (board) =>
    board ? { ...board, project: { ...board.project, lastSyncedAt: result.lastSyncedAt, lastSyncError: null } } : board,
  );
}

/** Refresh button (spec §6.4). The caller toasts the result. */
export const useSyncProject = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => projectsApi.sync(projectId, { trigger: 'MANUAL' }),
    onSuccess: (result) => afterSync(qc, projectId, result),
    onError: () => afterSync(qc, projectId),
  });
};

/**
 * Background polling while the board is open (spec §6.4): syncs on mount,
 * then every `pollIntervalSec`, and pauses while the tab is hidden.
 */
export const useAutoSync = (projectId: string, pollIntervalSec: number | undefined) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.projects.autoSync(projectId),
    queryFn: async () => {
      try {
        const result = await projectsApi.sync(projectId, { trigger: 'AUTO' });
        afterSync(qc, projectId, result);
        return result;
      } catch (error) {
        afterSync(qc, projectId);
        throw error;
      }
    },
    enabled: Boolean(pollIntervalSec),
    refetchInterval: (pollIntervalSec ?? 120) * 1000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: false,
  });
};
