'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { confirm } from '~/components/shared/confirm-dialog';
import { STATUS_META } from '~/constants/statuses';
import { useMoveCard } from '~/hooks/cards';
import { planMove } from '~/lib/workflow';
import type { CardStatus } from '~/schemas/common';
import type { CardDto } from '~/types/card';
import type { ProjectDto } from '~/types/project';

/**
 * One path for every move (drag and drop, menus): predicts the outcome with
 * the same rules as the server, explains refusals, asks before destructive
 * moves, then moves optimistically. Returns false when nothing was moved.
 */
export function useCardMover(project: ProjectDto | undefined, onRequestChanges: (card: CardDto) => void) {
  const move = useMoveCard(project?.id ?? '');

  return React.useCallback(
    async (card: CardDto, to: CardStatus, position: number): Promise<boolean> => {
      if (!project) return false;
      const plan = planMove({
        from: card.status,
        to,
        hasActiveRun: Boolean(card.activeRun),
        hasWork: Boolean(card.branchName || card.hasWorktree),
        prOpened: Boolean(card.prUrl),
        repoConfigured: Boolean(project.repoPath),
        sharedBranch: project.workMode === 'SHARED_BRANCH',
      });
      const target = STATUS_META[to].label;

      switch (plan.kind) {
        case 'reorder':
          if (Math.abs(position - card.position) < 1e-9) return false;
          move.mutate({ card, status: to, position });
          return true;
        case 'invalid':
          toast.error(`“${card.title}” can’t go to ${target}`, { description: plan.message });
          return false;
        case 'request-changes':
          // Let the card settle back (drop animation) before the dialog opens over it.
          setTimeout(() => onRequestChanges(card), 220);
          return false;
        case 'discard':
        case 'done': {
          if (plan.confirm) {
            const ok = await confirm({
              title: plan.kind === 'discard' ? 'Discard this work?' : 'Mark as done?',
              description: plan.confirm,
              confirmLabel: plan.kind === 'discard' ? 'Discard and move' : 'Mark as done',
              destructive: plan.kind === 'discard',
            });
            if (!ok) return false;
          }
          move.mutate({ card, status: to, position, confirmed: true });
          return true;
        }
        case 'start':
          move.mutate({ card, status: to, position }, { onSuccess: () => toast.success(`Started “${card.title}”`) });
          return true;
        default:
          move.mutate({ card, status: to, position });
          return true;
      }
    },
    [project, move, onRequestChanges],
  );
}
