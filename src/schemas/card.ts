import { z } from 'zod';
import { cardStatusSchema, idSchema } from './common';

export const cardParams = z.object({ cardId: idSchema });
export const runParams = z.object({ runId: idSchema });

/** `PATCH /api/cards/{id}/move` (spec §9.5). `confirmed` acknowledges a destructive move. */
export const moveCardBody = z.object({
  status: cardStatusSchema,
  position: z.number().finite(),
  confirmed: z.boolean().default(false),
});
export type MoveCardInput = z.input<typeof moveCardBody>;

/** `POST /api/cards/{id}/runs`: retry (INITIAL) or request changes (FOLLOW_UP). */
export const createRunBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('INITIAL'), resetFirst: z.boolean().default(false) }),
  z.object({
    kind: z.literal('FOLLOW_UP'),
    followUpText: z.string().trim().min(1, 'Describe the changes you want').max(4000),
  }),
]);
export type CreateRunInput = z.input<typeof createRunBody>;

export const runStreamQuery = z.object({ lastSeq: z.coerce.number().int().min(-1).default(-1) });

export const commitBody = z.object({ message: z.string().trim().min(1, 'Write a commit message').max(5000) });
export type CommitInput = z.infer<typeof commitBody>;

export const pullRequestBody = z.object({
  title: z.string().trim().min(1, 'Give the pull request a title').max(250),
  body: z.string().max(20000).default(''),
});
export type PullRequestInput = z.input<typeof pullRequestBody>;

/** Post on the Trello card: the plain-language update, or the questions for the client. */
export const clientCommentBody = z.object({
  kind: z.enum(['UPDATE', 'QUESTIONS']),
  text: z.string().trim().min(1, 'Write the message').max(5000, 'Keep it under 5000 characters'),
});
export type ClientCommentInput = z.infer<typeof clientCommentBody>;

/**
 * Shapes of the JSON columns on `Card` (SQLite stores JSON as String). Parsed
 * defensively in the presenter: a bad row degrades to an empty list.
 */
export const cardLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});

export const checklistItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['complete', 'incomplete']),
});

export const checklistSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(checklistItemSchema),
});

export const cardLabelsSchema = z.array(cardLabelSchema);
export const cardChecklistsSchema = z.array(checklistSchema);
