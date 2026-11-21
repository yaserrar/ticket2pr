import 'server-only';
import { prisma } from '~/server/config/prisma';
import { invalidTransition, notFound, unprocessable } from '~/server/http/errors';
import { presentProject, projectInclude } from '~/server/presenters/project.presenter';
import { trelloService } from '~/server/modules/trello/trello.service';
import { validateRepo } from '~/server/modules/git/repo';
import { removeWorktree } from '~/server/modules/git/worktree';
import { sharedWorktreePath } from '~/server/modules/git/shared-checkout';
import type { ProjectInput } from '~/schemas/project';
import { DEFAULT_SCOPE_RULES } from '~/lib/scope';
import { scopeService } from '~/server/modules/scope/scope.service';
import { checksService } from '~/server/modules/checks/checks.service';

/**
 * Reads the board and the source list from Trello, so names stored locally
 * come from Trello and the list is known to belong to the board.
 */
async function resolveTrelloTarget(input: ProjectInput) {
  const client = await trelloService.client();
  const [board, lists] = await Promise.all([client.board(input.trelloBoardId), client.lists(input.trelloBoardId)]);
  if (board.closed) throw unprocessable('This Trello board is closed. Reopen it on Trello or pick another one.');
  const list = lists.find((l) => l.id === input.trelloSourceListId);
  if (!list) throw unprocessable('That list is not an open list of the selected board.');
  const writeBack = {
    trelloInProgressListId: input.trelloInProgressListId,
    trelloReviewListId: input.trelloReviewListId,
    trelloDoneListId: input.trelloDoneListId,
    trelloNeedsInfoListId: input.trelloNeedsInfoListId,
    trelloOutOfScopeListId: input.trelloOutOfScopeListId,
  };
  for (const [field, id] of Object.entries(writeBack)) {
    if (id && !lists.some((l) => l.id === id)) throw unprocessable('That list is not an open list of the selected board.', { field });
  }
  return {
    trelloBoardId: board.id,
    trelloBoardName: board.name,
    trelloBoardUrl: board.url,
    trelloSourceListId: list.id,
    trelloSourceListName: list.name,
    ...writeBack,
  };
}

/**
 * Re-validates the repository on every save (spec §8.1) and stores its root.
 * An empty path is allowed: the board works, cards just can't start yet.
 */
async function resolveRepo(input: ProjectInput) {
  const setupCommand = input.setupCommand || null;
  const extraInstructions = input.extraInstructions || null;
  const mode = {
    workMode: input.workMode,
    sharedBranch: input.workMode === 'SHARED_BRANCH' ? input.sharedBranch || null : null,
    sharedInRepo: input.sharedInRepo,
  };
  if (!input.repoPath) return { repoPath: null, baseBranch: input.baseBranch || 'main', setupCommand, extraInstructions, ...mode };
  const repo = await validateRepo(input.repoPath);
  if (!repo.ok || !repo.repoPath) {
    const failed = repo.checks.find((c) => !c.ok && c.blocking);
    throw unprocessable(failed?.detail ?? 'This path is not a usable git repository.', { field: 'repoPath' });
  }
  if (!repo.branches.includes(input.baseBranch)) {
    throw unprocessable(`The branch “${input.baseBranch}” doesn't exist in this repository.`, { field: 'baseBranch' });
  }
  if (input.workMode === 'SHARED_BRANCH') {
    const branch = input.sharedBranch || input.baseBranch;
    if (!repo.branches.includes(branch)) {
      throw unprocessable(`The branch “${branch}” doesn't exist in this repository. Create it first.`, { field: 'sharedBranch' });
    }
    if (!input.sharedInRepo && repo.currentBranch === branch) {
      throw unprocessable(
        `“${branch}” is checked out in your repository folder, and git allows a branch in one folder at a time. Work directly in the folder, or pick another branch.`,
        { field: 'sharedInRepo' },
      );
    }
  }
  return { repoPath: repo.repoPath, baseBranch: input.baseBranch, setupCommand, extraInstructions, ...mode };
}

/** The scope check settings. Rules equal to the default are stored as null, so they follow future defaults. */
function scopeFields(input: ProjectInput) {
  const rules = input.scopeRules.trim();
  return { scopeCheck: input.scopeCheck, scopeRules: rules && rules !== DEFAULT_SCOPE_RULES.trim() ? rules : null };
}

/** Risk paths, screenshots and checks. Empty texts are stored as null; the checks are kept when turned off. */
function reviewFields(input: ProjectInput) {
  return {
    riskPaths: input.riskPaths || null,
    previewEnabled: input.previewEnabled,
    previewCommand: input.previewCommand || null,
    previewUrl: input.previewUrl || null,
    checksEnabled: input.checksEnabled,
    checksJson: input.checks.length ? JSON.stringify(input.checks) : null,
    checksAutoFix: input.checksAutoFix,
    checksMaxFixRounds: input.checksMaxFixRounds,
  };
}

/** Changing how cards are worked on mid-card would strand their work: finish or discard open cards first. */
type ModeFields = { workMode: string; sharedBranch: string | null; sharedInRepo: boolean; baseBranch: string };

async function assertModeChangeAllowed(projectId: string, before: ModeFields, after: ModeFields) {
  const sharedOf = (p: ModeFields) => (p.workMode === 'SHARED_BRANCH' ? `${p.sharedBranch || p.baseBranch}|${p.sharedInRepo}` : '');
  if (before.workMode === after.workMode && sharedOf(before) === sharedOf(after)) return;
  const open = await prisma.card.count({
    where: {
      projectId,
      status: { in: ['IN_PROGRESS', 'REVIEW'] },
      OR: [{ branchName: { not: null } }, { worktreePath: { not: null } }],
    },
  });
  if (open) {
    throw invalidTransition(
      `${open} card${open === 1 ? ' is' : 's are'} In progress or in Review. Finish ${open === 1 ? 'it' : 'them'} (or move ${open === 1 ? 'it' : 'them'} back to New) before changing how cards are worked on.`,
    );
  }
}

export const projectsService = {
  validateRepo,

  /** Checks found in the repository (package.json scripts, Makefile, pyproject.toml), to start from. */
  async suggestChecks(repoPath: string) {
    const repo = await validateRepo(repoPath);
    if (!repo.ok || !repo.repoPath) {
      const failed = repo.checks.find((c) => !c.ok && c.blocking);
      throw unprocessable(failed?.detail ?? 'This path is not a usable git repository.', { field: 'repoPath' });
    }
    return { checks: await checksService.suggest(repo.repoPath) };
  },

  async list() {
    const rows = await prisma.project.findMany({ include: projectInclude, orderBy: { createdAt: 'asc' } });
    return rows.map(presentProject);
  },

  async get(projectId: string) {
    const row = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
    if (!row) throw notFound('Project');
    return presentProject(row);
  },

  async create(input: ProjectInput) {
    const [trello, repo] = await Promise.all([resolveTrelloTarget(input), resolveRepo(input)]);
    const row = await prisma.project.create({
      data: { name: input.name, ...trello, ...repo, ...scopeFields(input), ...reviewFields(input) },
      include: projectInclude,
    });
    return presentProject(row);
  },

  /**
   * Changing the board or the source list keeps the cards already tracked:
   * local work is never deleted by a settings change.
   */
  async update(projectId: string, input: ProjectInput) {
    const current = await prisma.project.findUnique({ where: { id: projectId } });
    if (!current) throw notFound('Project');
    const [trello, repo] = await Promise.all([resolveTrelloTarget(input), resolveRepo(input)]);
    await assertModeChangeAllowed(projectId, current, repo);
    const scope = scopeFields(input);
    const row = await prisma.project.update({
      where: { id: projectId },
      data: { name: input.name, ...trello, ...repo, ...scope, ...reviewFields(input) },
      include: projectInclude,
    });
    // Turned on: check the new cards. New rules: check them again. Turned off: drop pending checks.
    if (scope.scopeCheck && (!current.scopeCheck || current.scopeRules !== scope.scopeRules)) {
      await scopeService.queueProject(projectId, { all: current.scopeCheck });
    } else if (!scope.scopeCheck && current.scopeCheck) {
      await scopeService.cancelProject(projectId);
    }
    return presentProject(row);
  },

  /**
   * Deletes the project and its cards, and removes the worktrees Ticket2PR
   * made (branches are kept: they may be pushed). The repository folder itself
   * is never removed.
   */
  async remove(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { cards: { where: { worktreePath: { not: null } }, select: { worktreePath: true } } },
    });
    if (!project) throw notFound('Project');
    if (project.repoPath) {
      const folders = new Set(project.cards.map((c) => c.worktreePath));
      if (project.workMode === 'SHARED_BRANCH' && !project.sharedInRepo) {
        folders.add(sharedWorktreePath(project.id, project.sharedBranch || project.baseBranch));
      }
      for (const worktreePath of folders) {
        await removeWorktree({ repoPath: project.repoPath, worktreePath, branchName: null, deleteBranch: false });
      }
    }
    await prisma.project.delete({ where: { id: projectId } });
  },
};
