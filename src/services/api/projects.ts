import type { ProjectInput, SyncInput } from '~/schemas/project';
import type { BoardDto } from '~/types/card';
import type { ProjectDto, SyncResultDto } from '~/types/project';
import type { RepoStatusDto, RepoValidationDto } from '~/types/git';
import { api } from './client';

export const projectsApi = {
  list: () => api.get<ProjectDto[]>('/projects'),
  get: (projectId: string) => api.get<ProjectDto>(`/projects/${projectId}`),
  create: (body: ProjectInput) => api.post<ProjectDto>('/projects', body),
  update: (projectId: string, body: ProjectInput) => api.put<ProjectDto>(`/projects/${projectId}`, body),
  remove: (projectId: string) => api.delete<{ ok: true }>(`/projects/${projectId}`),
  board: (projectId: string) => api.get<BoardDto>(`/projects/${projectId}/board`),
  validateRepo: (repoPath: string) => api.post<RepoValidationDto>('/projects/validate-repo', { repoPath }),
  sync: (projectId: string, body: SyncInput) => api.post<SyncResultDto>(`/projects/${projectId}/sync`, body),
  repo: (projectId: string, refresh = false) => api.get<RepoStatusDto>(`/projects/${projectId}/repo`, refresh ? { refresh: '1' } : undefined),
  pull: (projectId: string) => api.post<RepoStatusDto & { pulled: number }>(`/projects/${projectId}/repo/pull`),
  cleanupDone: (projectId: string) =>
    api.post<{ cleaned: number; deletedBranches: number; skipped: { title: string; reason: string }[] }>(`/projects/${projectId}/cleanup-done`),
};
