import type { CardStatus } from '~/schemas/common';

/**
 * The card state machine (spec §9), shared by the board and the server: the
 * board predicts a move and explains refusals before calling the API, the
 * server enforces the same rules in `workflow/transitions.ts`.
 *
 *   NEW ──drag──► IN_PROGRESS ──run succeeds──► REVIEW ──PR opened / drag──► DONE
 *    ▲ │               │  ▲                        │
 *    │ │  discard      │  └──── request changes ───┘
 *    └─┼───────────────┘
 *    ▲ └──out of scope──► OUT_OF_SCOPE   (waits for a new agreement with the client)
 *    └──── client agreed ────┘
 */
export type MoveContext = {
  from: CardStatus;
  to: CardStatus;
  /** A run is queued or running for the card. */
  hasActiveRun: boolean;
  /** The card has a branch or worktree (discarding deletes them). */
  hasWork: boolean;
  prOpened: boolean;
  repoConfigured: boolean;
  /** The project works on one shared branch: discard resets files, nothing is deleted, no PR per card. */
  sharedBranch?: boolean;
};

export type MovePlan =
  | { kind: 'reorder' }
  /** Prepare the worktree and queue a run. */
  | { kind: 'start' }
  /** Manual review of partial work. */
  | { kind: 'review' }
  /** Back to New: stop the run, delete the worktree and the branch. */
  | { kind: 'discard'; confirm: string | null }
  /** Review → In progress needs instructions: the board opens "Request changes". */
  | { kind: 'request-changes' }
  | { kind: 'done'; confirm: string | null }
  | { kind: 'reopen' }
  /** New → Out of scope: the board opens the dialog (note for the client, Trello list). */
  | { kind: 'out-of-scope' }
  /** Out of scope → New: the client agreed to the new work, the card can start. */
  | { kind: 'back-in-scope' }
  | { kind: 'invalid'; message: string };

export function planMove(ctx: MoveContext): MovePlan {
  const { from, to } = ctx;
  if (from === to) return { kind: 'reorder' };

  if (to === 'OUT_OF_SCOPE') {
    if (from === 'NEW') return { kind: 'out-of-scope' };
    return { kind: 'invalid', message: 'Only new cards are set aside as out of scope. Move it back to New first.' };
  }
  if (from === 'OUT_OF_SCOPE') {
    if (to === 'NEW') return { kind: 'back-in-scope' };
    return {
      kind: 'invalid',
      message: 'This card waits for a new agreement with the client. Once they agree, move it back to New, then start it.',
    };
  }

  if (from === 'NEW' && to === 'IN_PROGRESS') {
    if (!ctx.repoConfigured) {
      return { kind: 'invalid', message: 'Add the repository in Project settings first, so Ticket2PR knows where to work.' };
    }
    return { kind: 'start' };
  }

  if (from === 'IN_PROGRESS' && to === 'REVIEW') {
    if (ctx.hasActiveRun) return { kind: 'invalid', message: 'Wait for the run to finish, or stop it first.' };
    return { kind: 'review' };
  }

  if ((from === 'IN_PROGRESS' || from === 'REVIEW') && to === 'NEW') {
    const parts = [
      ctx.hasActiveRun ? 'stops the current run' : null,
      ctx.hasWork
        ? ctx.sharedBranch
          ? 'throws away the uncommitted changes on the shared branch (commits stay)'
          : 'deletes the branch and its worktree, with any uncommitted or unpushed work'
        : null,
    ].filter(Boolean);
    return { kind: 'discard', confirm: parts.length ? `Moving it back to New ${parts.join(' and ')}.` : null };
  }

  if (from === 'REVIEW' && to === 'IN_PROGRESS') return { kind: 'request-changes' };

  if (from === 'REVIEW' && to === 'DONE') {
    return {
      kind: 'done',
      confirm: ctx.prOpened || ctx.sharedBranch ? null : 'No pull request was opened from Ticket2PR for this card. Mark it done anyway?',
    };
  }

  if (from === 'DONE' && to === 'REVIEW') return { kind: 'reopen' };

  if (from === 'NEW') return { kind: 'invalid', message: 'A card goes through In progress first.' };
  if (from === 'IN_PROGRESS') return { kind: 'invalid', message: 'Review the changes first: move the card to Review.' };
  return { kind: 'invalid', message: 'Done cards can only go back to Review.' };
}

const STEP = 1000;

/** Fractional position between two neighbours (either can be missing). */
export function positionBetween(before?: number, after?: number): number {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + STEP;
  if (after !== undefined) return after - STEP;
  return STEP;
}

export const ACTIVE_RUN_STATUSES = ['QUEUED', 'RUNNING'] as const;
export const isActiveRunStatus = (status: string) => (ACTIVE_RUN_STATUSES as readonly string[]).includes(status);
