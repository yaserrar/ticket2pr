import 'server-only';
import { prisma } from '~/server/config/prisma';
import { HttpError, notFound } from '~/server/http/errors';
import { fastForward, folderStatus } from '~/server/modules/git/shared-checkout';
import type { RepoStatusDto } from '~/types/git';

/**
 * The developer's own repository folder vs GitHub (board toolbar chip):
 * which branch it is on, how far behind origin it is, and a safe Pull
 * (fast-forward only; git itself refuses if it would overwrite local edits).
 */
async function loadRepoProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Project');
  if (!project.repoPath) throw new HttpError(409, 'Add the repository in Project settings first.', 'REPO_NOT_CONFIGURED');
  return project as typeof project & { repoPath: string };
}

export const repoStatusService = {
  /** Fetches at most once a minute per repository, unless `refresh`. */
  async status(projectId: string, { refresh = false } = {}): Promise<RepoStatusDto> {
    const project = await loadRepoProject(projectId);
    const status = await folderStatus(project.repoPath, { fetch: refresh ? 'now' : 'auto' });
    return { repoPath: project.repoPath, ...status };
  },

  async pull(projectId: string): Promise<RepoStatusDto & { pulled: number }> {
    const project = await loadRepoProject(projectId);
    if (project.workMode === 'SHARED_BRANCH' && project.sharedInRepo) {
      const open = await prisma.card.findFirst({
        where: { projectId, status: { in: ['IN_PROGRESS', 'REVIEW'] }, startSha: { not: null } },
        select: { title: true },
      });
      if (open) {
        throw new HttpError(
          409,
          `“${open.title}” is being worked on in this folder. Push it or move it back to New first: its changes start from the current commit.`,
          'GIT_ERROR',
        );
      }
    }
    const before = await folderStatus(project.repoPath, { fetch: 'now' });
    if (!before.branch) throw new HttpError(409, 'The repository folder is not on a branch (detached HEAD).', 'GIT_ERROR');
    if (before.fetchError) throw new HttpError(422, `Fetching from origin failed.\n${before.fetchError}`, 'GIT_ERROR');
    if (!before.hasUpstream) throw new HttpError(409, `${before.branch} doesn't exist on origin: nothing to pull.`, 'GIT_ERROR');
    const { pulled } = await fastForward(project.repoPath, before.branch);
    const after = await folderStatus(project.repoPath, { fetch: 'no' });
    return { repoPath: project.repoPath, ...after, pulled };
  },
};
