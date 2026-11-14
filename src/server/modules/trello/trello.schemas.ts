import 'server-only';
import { z } from 'zod';

/**
 * Zod shapes of the Trello REST responses we read (spec §6.2). Only the fields
 * we request are declared. Unknown fields are ignored.
 */
export const trelloMemberSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string().nullish().transform((v) => v ?? ''),
});

export const trelloBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  closed: z.boolean().optional(),
});

export const trelloListSchema = z.object({
  id: z.string(),
  name: z.string(),
  pos: z.number().optional(),
});

export const trelloLabelSchema = z.object({
  id: z.string(),
  name: z.string().nullish().transform((v) => v ?? ''),
  color: z.string().nullish().transform((v) => v ?? null),
});

export const trelloCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().nullish().transform((v) => v ?? ''),
  idList: z.string(),
  labels: z.array(trelloLabelSchema).default([]),
  url: z.string(),
  shortLink: z.string(),
  dateLastActivity: z.string(),
  pos: z.number().default(0),
});

export const trelloCheckItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['complete', 'incomplete']).catch('incomplete'),
  pos: z.number().default(0),
});

export const trelloChecklistSchema = z.object({
  id: z.string(),
  name: z.string(),
  idCard: z.string(),
  pos: z.number().default(0),
  checkItems: z.array(trelloCheckItemSchema).default([]),
});

/** A comment on a card (an action of type `commentCard`). */
export const trelloCommentSchema = z.object({
  id: z.string(),
  date: z.string(),
  data: z.object({
    text: z.string().nullish().transform((v) => v ?? ''),
    card: z.object({ id: z.string() }).nullish(),
  }),
  memberCreator: z
    .object({ id: z.string(), fullName: z.string().nullish(), username: z.string().nullish() })
    .nullish()
    .transform((m) => m ?? null),
});

export const trelloAttachmentSchema = z.object({
  id: z.string(),
  name: z.string().nullish().transform((v) => v ?? 'attachment'),
  url: z.string(),
  mimeType: z.string().nullish().transform((v) => v ?? null),
  bytes: z.number().nullish().transform((v) => v ?? null),
  date: z.string(),
  isUpload: z.boolean().default(false),
});

export type TrelloComment = z.infer<typeof trelloCommentSchema>;
export type TrelloAttachment = z.infer<typeof trelloAttachmentSchema>;
export type TrelloMember = z.infer<typeof trelloMemberSchema>;
export type TrelloBoard = z.infer<typeof trelloBoardSchema>;
export type TrelloList = z.infer<typeof trelloListSchema>;
export type TrelloCard = z.infer<typeof trelloCardSchema>;
export type TrelloChecklist = z.infer<typeof trelloChecklistSchema>;
