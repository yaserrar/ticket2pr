import type { CardDto } from '~/types/card';
import type { ProjectDto } from '~/types/project';
import { scopeGate } from './scope';

/** The scope gate for a card on the board (the server applies the same rules). */
export const cardScopeGate = (card: CardDto, project: Pick<ProjectDto, 'scopeCheck'>) =>
  scopeGate({
    enabled: project.scopeCheck,
    status: card.scope.status,
    stale: card.scope.stale,
    approved: card.scope.approved,
    reason: card.scope.reason,
    error: card.scope.error,
  });
