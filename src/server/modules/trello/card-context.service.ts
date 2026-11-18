import 'server-only';
import path from 'node:path';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { logger } from '~/server/config/logger';
import { worktreesRoot } from '~/server/modules/git/worktree';
import type { ContextFile, ContextLink, TrelloContext } from '~/server/modules/runs/trello-context';
import { trelloService } from './trello.service';
import type { TrelloAttachment, TrelloComment } from './trello.schemas';

/**
 * Reads a card's comments and attachments from Trello for a run (spec §7.1
 * context). Uploaded screenshots, PDFs and text files are downloaded next to
 * the worktrees (never into them, so they don't show in the diff) and Claude
 * gets read access to that folder.
 */
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const READABLE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/.+|application\/json)$/i;
const READABLE_EXT = /\.(png|jpe?g|gif|webp|pdf|txt|md|csv|json|log|html|css)$/i;

/** Files Ticket2PR uploads to a card start with this. */
export const OWN_UPLOAD_PREFIX = 'ticket2pr-';

export function attachmentsDir(cardId: string) {
  return path.join(path.dirname(worktreesRoot()), 'attachments', cardId);
}

export async function removeAttachments(cardId: string) {
  await rm(attachmentsDir(cardId), { recursive: true, force: true }).catch(() => undefined);
}

const exists = (p: string) =>
  stat(p).then(
    (s) => s.size,
    () => null,
  );

export const authorOf = (c: TrelloComment) => c.memberCreator?.fullName || c.memberCreator?.username || 'Someone';

export const cardContextService = {
  /** Comments not posted by Ticket2PR, oldest first, optionally only newer than `since`. */
  async comments(trelloCardId: string, postedIds: string[], since: Date | null) {
    const client = await trelloService.client();
    const all = await client.cardComments(trelloCardId);
    return all
      .filter((c) => !postedIds.includes(c.id) && (!since || new Date(c.date) > since))
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  /**
   * Everything a run passes on from Trello. `since` limits it to what is new
   * (follow-ups). Failures are reported in `errors`, never thrown: a run
   * still works without them.
   */
  async gather(card: { id: string; trelloCardId: string; postedCommentIds: string[] }, since: Date | null) {
    const ctx: TrelloContext = { comments: [], files: [], links: [], skipped: [] };
    const errors: string[] = [];
    const client = await trelloService.client().catch((error: unknown) => {
      errors.push(error instanceof Error ? error.message : String(error));
      return null;
    });
    if (!client) return { ctx, dir: null, errors };

    const [comments, attachments] = await Promise.all([
      this.comments(card.trelloCardId, card.postedCommentIds, since).catch((error: unknown) => {
        errors.push(`Comments: ${error instanceof Error ? error.message : String(error)}`);
        return [] as TrelloComment[];
      }),
      client.attachments(card.trelloCardId).catch((error: unknown) => {
        errors.push(`Attachments: ${error instanceof Error ? error.message : String(error)}`);
        return [] as TrelloAttachment[];
      }),
    ]);
    ctx.comments = comments.map((c) => ({ id: c.id, author: authorOf(c), text: c.data.text, date: c.date }));

    const fresh = attachments
      // Screenshots Ticket2PR uploaded for the client are ours, not the client's.
      .filter((a) => !a.name.startsWith(OWN_UPLOAD_PREFIX))
      .filter((a) => !since || new Date(a.date) > since)
      .sort((a, b) => a.date.localeCompare(b.date));
    const dir = attachmentsDir(card.id);
    const files: ContextFile[] = [];
    const links: ContextLink[] = [];

    for (const a of fresh) {
      if (!a.isUpload) {
        links.push({ name: a.name, url: a.url });
        continue;
      }
      const readable = (a.mimeType && READABLE.test(a.mimeType)) || READABLE_EXT.test(a.name);
      if (!readable) {
        ctx.skipped.push(`${a.name} (file type Claude can't read)`);
        continue;
      }
      if ((a.bytes ?? 0) > MAX_FILE_BYTES) {
        ctx.skipped.push(`${a.name} (over 10 MB)`);
        continue;
      }
      if (files.length >= MAX_FILES) {
        ctx.skipped.push(`${a.name} (only the first ${MAX_FILES} files are passed on)`);
        continue;
      }
      const safe = a.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'file';
      const file = path.join(dir, `${a.id.slice(-8)}-${safe}`);
      try {
        let bytes = await exists(file);
        if (bytes === null) {
          const data = await client.downloadAttachment(card.trelloCardId, { id: a.id, name: a.name }, MAX_FILE_BYTES);
          await mkdir(dir, { recursive: true });
          await writeFile(file, data);
          bytes = data.length;
        }
        files.push({ path: file, name: a.name, mimeType: a.mimeType, bytes });
      } catch (error) {
        logger.warn({ err: error, cardId: card.id }, 'Attachment download failed');
        ctx.skipped.push(`${a.name} (download failed)`);
      }
    }
    ctx.files = files;
    ctx.links = links;
    return { ctx, dir: files.length ? dir : null, errors };
  },
};
