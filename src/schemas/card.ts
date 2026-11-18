import { z } from 'zod';
import { cardStatusSchema, idSchema } from './common';

export const cardParams = z.object({ cardId: idSchema });
/** Screenshot files are named by Ticket2PR: `{run}-{n}.png`. */
export const screenshotFileSchema = z.string().regex(/^[\w-]+\.png$/, 'Unknown screenshot');
export const screenshotParams = z.object({ cardId: idSchema, file: screenshotFileSchema });

/** URL paths of public pages, like `/contact`. */
const pagePathSchema = z.string().trim().regex(/^\/[^\s]*$/, 'Use paths like /contact').refine((p) => !p.startsWith('//'), 'Use paths like /contact');
export const retakeScreenshotsBody = z.object({ pages: z.array(pagePathSchema).min(1, 'Add a page, like /').max(3, 'Three pages at most') });
export type RetakeScreenshotsInput = z.infer<typeof retakeScreenshotsBody>;
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

/** `POST /api/cards/{id}/pr`: the form, plus "I reviewed the high-risk files" (required once when the changes are high risk). */
export const openPrBody = pullRequestBody.extend({ riskReviewed: z.boolean().default(false) });
export type OpenPrInput = z.input<typeof openPrBody>;

/** `POST /api/cards/{id}/push`. */
export const pushBody = z.object({ riskReviewed: z.boolean().default(false) });
export type PushInput = z.input<typeof pushBody>;

/** Post on the Trello card: the plain-language update, or the questions for the client. */
export const clientCommentBody = z.object({
  kind: z.enum(['UPDATE', 'QUESTIONS']),
  text: z.string().trim().min(1, 'Write the message').max(5000, 'Keep it under 5000 characters'),
  /** Screenshots to attach to the card with the update. */
  screenshots: z.array(screenshotFileSchema).max(3).default([]),
});
export type ClientCommentInput = z.input<typeof clientCommentBody>;

/**
 * `POST /api/cards/{id}/out-of-scope`: set a new card aside. `note` is posted on
 * the Trello card for the client when given.
 */
export const outOfScopeBody = z.object({
  note: z.string().trim().min(1, 'Write the note, or don’t post one').max(5000, 'Keep it under 5000 characters').nullable(),
});
export type OutOfScopeInput = z.infer<typeof outOfScopeBody>;

/** `POST /api/cards/{id}/scope`: check (again) now; `start` begins the work once Claude says it's in scope. */
export const scopeCheckBody = z.object({ start: z.boolean().default(false) });
export type ScopeCheckInput = z.input<typeof scopeCheckBody>;

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
