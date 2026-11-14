import { z } from 'zod';
import { idSchema, syncTriggerSchema, trelloIdSchema } from './common';

export const WORK_MODES = ['BRANCH_PER_CARD', 'SHARED_BRANCH'] as const;
export const workModeSchema = z.enum(WORK_MODES);
export type WorkMode = z.infer<typeof workModeSchema>;

const trelloId = (required: string) =>
  z
    .string()
    .trim()
    .min(1, required)
    .regex(/^[0-9a-f]{24}$/i, 'Invalid Trello id');

/**
 * Project form + `POST/PUT /api/projects`. Only ids come from the client: the
 * server reads the board and list names from Trello itself, and re-validates
 * the repository (spec §8.1).
 */
export const projectBody = z.object({
  name: z.string().trim().min(1, 'Give the project a name').max(80, 'Keep it under 80 characters'),
  trelloBoardId: trelloId('Pick a Trello board'),
  trelloSourceListId: trelloId('Pick the list clients add cards to'),
  /** Empty = not set yet (the board works, cards can't start). */
  repoPath: z.string().trim().max(1000),
  baseBranch: z.string().trim().min(1, 'Pick the base branch').max(200),
  setupCommand: z.string().trim().max(500),
  /** Added to every prompt for this project (conventions, what not to touch…). */
  extraInstructions: z.string().trim().max(4000, 'Keep it under 4000 characters'),
  /**
   * BRANCH_PER_CARD: each card gets its own branch + worktree and a pull request.
   * SHARED_BRANCH: every card works on one branch, one card at a time.
   */
  workMode: workModeSchema,
  /** SHARED_BRANCH: the branch cards work on (empty = the base branch). */
  sharedBranch: z.string().trim().max(200),
  /** SHARED_BRANCH: work directly in the repository folder (else in a separate worktree). */
  sharedInRepo: z.boolean(),
  /** Write-back (spec §6.5): Trello list for each status; null = don't move the card. */
  trelloInProgressListId: trelloIdSchema.nullable(),
  trelloReviewListId: trelloIdSchema.nullable(),
  trelloDoneListId: trelloIdSchema.nullable(),
  trelloNeedsInfoListId: trelloIdSchema.nullable(),
});
export type ProjectInput = z.infer<typeof projectBody>;

export const validateRepoBody = z.object({ repoPath: z.string().trim().min(1, 'Type the repository path').max(1000) });

export const projectParams = z.object({ projectId: idSchema });

export const syncBody = z.object({ trigger: syncTriggerSchema.default('MANUAL') });
export type SyncInput = z.input<typeof syncBody>;
