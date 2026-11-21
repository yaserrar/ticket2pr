import 'server-only';
import type { Prisma } from '~/generated/prisma/client';
import { parseCheckConfigs } from '~/server/modules/checks/checks.service';
import type { ProjectDto } from '~/types/project';

/** Prisma `include` every project query uses, so the presenter has what it needs. */
export const projectInclude = {
  _count: { select: { cards: true } },
  syncLogs: { orderBy: { startedAt: 'desc' }, take: 1, select: { error: true } },
} satisfies Prisma.ProjectInclude;

export type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

export function presentProject(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    trelloBoardId: row.trelloBoardId,
    trelloBoardName: row.trelloBoardName,
    trelloBoardUrl: row.trelloBoardUrl,
    trelloSourceListId: row.trelloSourceListId,
    trelloSourceListName: row.trelloSourceListName,
    repoPath: row.repoPath,
    baseBranch: row.baseBranch,
    setupCommand: row.setupCommand,
    extraInstructions: row.extraInstructions,
    workMode: row.workMode === 'SHARED_BRANCH' ? 'SHARED_BRANCH' : 'BRANCH_PER_CARD',
    sharedBranch: row.sharedBranch,
    sharedInRepo: row.sharedInRepo,
    trelloInProgressListId: row.trelloInProgressListId,
    trelloReviewListId: row.trelloReviewListId,
    trelloDoneListId: row.trelloDoneListId,
    trelloNeedsInfoListId: row.trelloNeedsInfoListId,
    scopeCheck: row.scopeCheck,
    scopeRules: row.scopeRules,
    trelloOutOfScopeListId: row.trelloOutOfScopeListId,
    riskPaths: row.riskPaths,
    previewEnabled: row.previewEnabled,
    previewCommand: row.previewCommand,
    previewUrl: row.previewUrl,
    checksEnabled: row.checksEnabled,
    checks: parseCheckConfigs(row.checksJson),
    checksAutoFix: row.checksAutoFix,
    checksMaxFixRounds: row.checksMaxFixRounds,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: row.syncLogs[0]?.error ?? null,
    cardCount: row._count.cards,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
