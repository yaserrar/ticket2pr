import 'server-only';
import { z, type ZodType } from 'zod';
import { env } from '~/server/config/env';
import { logger } from '~/server/config/logger';
import { HttpError } from '~/server/http/errors';
import {
  trelloAttachmentSchema,
  trelloBoardSchema,
  trelloCardSchema,
  trelloChecklistSchema,
  trelloCommentSchema,
  trelloListSchema,
  trelloMemberSchema,
} from './trello.schemas';

/**
 * Thin typed wrapper over the Trello REST API (spec §6.2). Credentials go in
 * the `Authorization: OAuth …` header so they never appear in URLs or logs.
 * Responses are Zod-parsed. Every failure becomes a `TrelloError` (an
 * `HttpError` with a `TRELLO_*` code), so routes map it like any other error.
 * A `429` is retried once after a short delay.
 */
export type TrelloCredentials = { key: string; token: string };

export class TrelloError extends HttpError {
  constructor(
    status: number,
    message: string,
    code: 'TRELLO_UNAUTHORIZED' | 'TRELLO_NOT_FOUND' | 'TRELLO_RATE_LIMITED' | 'TRELLO_UNAVAILABLE',
    public readonly trelloStatus?: number,
  ) {
    super(status, message, code, trelloStatus ? { trelloStatus } : undefined);
    this.name = 'TrelloError';
  }
}

const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_500;

type Query = Record<string, string | number | boolean>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toTrelloError(status: number, body: string): TrelloError {
  const detail = body.trim().slice(0, 200);
  if (status === 401 || (status === 400 && /invalid (key|token)/i.test(detail))) {
    return new TrelloError(422, 'Trello rejected the API key or token.', 'TRELLO_UNAUTHORIZED', status);
  }
  if (status === 403) {
    return new TrelloError(422, 'This Trello token has no access to that board.', 'TRELLO_UNAUTHORIZED', status);
  }
  if (status === 404 || (status === 400 && /invalid id/i.test(detail))) {
    return new TrelloError(404, 'Trello could not find that board or list. It may have been deleted or closed.', 'TRELLO_NOT_FOUND', status);
  }
  if (status === 429) {
    return new TrelloError(503, 'Trello is rate limiting requests. Try again in a minute.', 'TRELLO_RATE_LIMITED', status);
  }
  return new TrelloError(502, `Trello answered with an error (${status}).`, 'TRELLO_UNAVAILABLE', status);
}

export function createTrelloClient(credentials: TrelloCredentials, baseUrl = env.TRELLO_API_BASE) {
  const authorization = `OAuth oauth_consumer_key="${credentials.key}", oauth_token="${credentials.token}"`;

  const urlFor = (path: string, query: Query = {}) => {
    const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    return url;
  };

  async function request<S extends ZodType>(method: 'GET' | 'POST' | 'PUT', path: string, schema: S, query: Query = {}): Promise<z.output<S>> {
    const url = urlFor(path, query);

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: { Accept: 'application/json', Authorization: authorization },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: 'no-store',
        });
      } catch (error) {
        logger.warn({ err: error, path }, 'Trello request failed');
        const timedOut = error instanceof Error && error.name === 'TimeoutError';
        throw new TrelloError(
          502,
          timedOut ? 'Trello did not answer in time.' : 'Could not reach Trello. Check your internet connection.',
          'TRELLO_UNAVAILABLE',
        );
      }

      if (res.status === 429 && attempt === 0) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.warn({ path, status: res.status }, 'Trello request rejected');
        throw toTrelloError(res.status, body);
      }

      const json: unknown = await res.json().catch(() => null);
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        logger.error({ path, issues: parsed.error.issues.slice(0, 5) }, 'Unexpected Trello response');
        throw new TrelloError(502, 'Trello returned data in an unexpected format.', 'TRELLO_UNAVAILABLE');
      }
      return parsed.data;
    }
  }

  const get = <S extends ZodType>(path: string, schema: S, query: Query = {}) => request('GET', path, schema, query);

  return {
    /** Verifies the credentials. */
    me: () => get('/members/me', trelloMemberSchema, { fields: 'username,fullName' }),

    boards: () => get('/members/me/boards', z.array(trelloBoardSchema), { filter: 'open', fields: 'name,url' }),

    board: (boardId: string) => get(`/boards/${boardId}`, trelloBoardSchema, { fields: 'name,url,closed' }),

    lists: (boardId: string) =>
      get(`/boards/${boardId}/lists`, z.array(trelloListSchema), { filter: 'open', fields: 'name,pos' }),

    /** Every open card of the board in one request. */
    openCards: (boardId: string) =>
      get(`/boards/${boardId}/cards/open`, z.array(trelloCardSchema), {
        fields: 'name,desc,idList,labels,url,shortLink,dateLastActivity,pos',
      }),

    /** Every checklist of the board in one request (instead of one request per card). */
    checklists: (boardId: string) =>
      get(`/boards/${boardId}/checklists`, z.array(trelloChecklistSchema), {
        fields: 'name,idCard,pos',
        checkItems: 'all',
        checkItem_fields: 'name,state,pos',
      }),

    /** Comments of one card, newest first. */
    cardComments: (cardId: string) =>
      get(`/cards/${cardId}/actions`, z.array(trelloCommentSchema), {
        filter: 'commentCard',
        limit: 100,
        memberCreator_fields: 'fullName,username',
      }),

    /** Comments on the whole board since a date, newest first (one request per sync). */
    boardComments: (boardId: string, since: Date) =>
      get(`/boards/${boardId}/actions`, z.array(trelloCommentSchema), {
        filter: 'commentCard',
        since: since.toISOString(),
        limit: 200,
        memberCreator_fields: 'fullName,username',
      }),

    attachments: (cardId: string) =>
      get(`/cards/${cardId}/attachments`, z.array(trelloAttachmentSchema), {
        fields: 'name,url,mimeType,bytes,date,isUpload',
      }),

    /** Write-back (spec §6.5): move the card to another list of its board. */
    moveCard: (cardId: string, listId: string) => request('PUT', `/cards/${cardId}`, z.object({ id: z.string() }), { idList: listId }),

    /** Posts a comment; returns its id so our own comments are told apart from the client's. */
    addComment: (cardId: string, text: string) =>
      request('POST', `/cards/${cardId}/actions/comments`, z.object({ id: z.string() }), { text }),

    /** Uploads a file to the card (screenshots for the client). Returns its id and Trello URL. */
    async attachFile(cardId: string, file: { name: string; mimeType: string; data: Buffer }) {
      const form = new FormData();
      form.set('name', file.name);
      form.set('mimeType', file.mimeType);
      form.set('setCover', 'false');
      form.set('file', new Blob([new Uint8Array(file.data)], { type: file.mimeType }), file.name);
      let res: Response;
      try {
        res = await fetch(urlFor(`/cards/${cardId}/attachments`), {
          method: 'POST',
          headers: { Accept: 'application/json', Authorization: authorization },
          body: form,
          signal: AbortSignal.timeout(60_000),
          cache: 'no-store',
        });
      } catch {
        throw new TrelloError(502, `Could not upload “${file.name}” to Trello.`, 'TRELLO_UNAVAILABLE');
      }
      if (!res.ok) throw toTrelloError(res.status, await res.text().catch(() => ''));
      const parsed = z.object({ id: z.string(), url: z.string() }).safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new TrelloError(502, 'Trello returned data in an unexpected format.', 'TRELLO_UNAVAILABLE');
      return parsed.data;
    },

    /**
     * Downloads an uploaded attachment (Trello requires the credentials for
     * it). Refuses files over `maxBytes`.
     */
    async downloadAttachment(cardId: string, attachment: { id: string; name: string }, maxBytes: number): Promise<Buffer> {
      const url = urlFor(`/cards/${cardId}/attachments/${attachment.id}/download/${encodeURIComponent(attachment.name)}`);
      let res: Response;
      try {
        res = await fetch(url, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(60_000), cache: 'no-store' });
      } catch {
        throw new TrelloError(502, `Could not download “${attachment.name}” from Trello.`, 'TRELLO_UNAVAILABLE');
      }
      if (!res.ok) throw toTrelloError(res.status, await res.text().catch(() => ''));
      const length = Number(res.headers.get('content-length') ?? 0);
      if (length > maxBytes) throw new TrelloError(422, `“${attachment.name}” is too large to pass to Claude.`, 'TRELLO_UNAVAILABLE');
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > maxBytes) throw new TrelloError(422, `“${attachment.name}” is too large to pass to Claude.`, 'TRELLO_UNAVAILABLE');
      return buffer;
    },
  };
}

export type TrelloClient = ReturnType<typeof createTrelloClient>;
