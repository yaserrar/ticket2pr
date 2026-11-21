import 'server-only';
import { prisma } from '~/server/config/prisma';
import { notFound } from '~/server/http/errors';
import { cardInclude, presentCard } from '~/server/presenters/card.presenter';
import { presentProject, projectInclude } from '~/server/presenters/project.presenter';
import { CARD_STATUSES, type CardStatus } from '~/schemas/common';
import { workUsageService } from '~/server/modules/usage/work-usage.service';
import type { BoardDto, CardDto } from '~/types/card';

/** 1-based position of every queued run, across projects (they share the run slots). */
async function queuePositions() {
  const queued = await prisma.run.findMany({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return new Map(queued.map((r, i) => [r.id, i + 1]));
}

export const cardsService = {
  /** The Kanban: every card of the project grouped by status, ordered by position. */
  async board(projectId: string): Promise<BoardDto> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        ...projectInclude,
        cards: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: cardInclude },
      },
    });
    if (!project) throw notFound('Project');

    const [positions, usage] = await Promise.all([queuePositions(), workUsageService.byCard({ card: { projectId } })]);
    const columns = Object.fromEntries(CARD_STATUSES.map((s) => [s, [] as CardDto[]])) as Record<CardStatus, CardDto[]>;
    for (const row of project.cards) {
      const card = presentCard(row, { sourceListId: project.trelloSourceListId, queuePositions: positions, usage });
      columns[card.status].push(card);
    }
    return { project: presentProject(project), columns };
  },

  async get(cardId: string): Promise<CardDto> {
    const row = await prisma.card.findUnique({
      where: { id: cardId },
      include: { ...cardInclude, project: { select: { trelloSourceListId: true } } },
    });
    if (!row) throw notFound('Card');
    const [positions, usage] = await Promise.all([queuePositions(), workUsageService.byCard({ cardId })]);
    return presentCard(row, { sourceListId: row.project.trelloSourceListId, queuePositions: positions, usage });
  },
};
