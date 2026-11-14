import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrelloClient, TrelloError } from './trello.client';

const BASE = 'https://trello.test/1';
const client = createTrelloClient({ key: 'k'.repeat(32), token: 't'.repeat(64) }, BASE);

function respond(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('createTrelloClient', () => {
  it('sends credentials in the Authorization header, never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { id: 'm1', username: 'ada', fullName: 'Ada' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.me()).resolves.toEqual({ id: 'm1', username: 'ada', fullName: 'Ada' });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(`${BASE}/members/me?fields=username%2CfullName`);
    expect(url.toString()).not.toContain('kkkk');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^OAuth oauth_consumer_key="k+", oauth_token="t+"$/);
  });

  it('parses cards with defaults for missing optional fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond(200, [
          { id: 'c1', name: 'Card', desc: null, idList: 'l1', url: 'u', shortLink: 's', dateLastActivity: '2026-11-10T00:00:00Z' },
        ]),
      ),
    );
    const [card] = await client.openCards('b1');
    expect(card).toMatchObject({ desc: '', labels: [], pos: 0 });
  });

  it('maps 401 to TRELLO_UNAUTHORIZED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(401, 'invalid token')));
    await expect(client.me()).rejects.toMatchObject({ code: 'TRELLO_UNAUTHORIZED', trelloStatus: 401 });
  });

  it('maps "invalid id" to TRELLO_NOT_FOUND', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(400, 'invalid id')));
    await expect(client.board('nope')).rejects.toMatchObject({ code: 'TRELLO_NOT_FOUND', status: 404 });
  });

  it('retries once on 429', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(429, 'slow down'))
      .mockResolvedValueOnce(respond(200, []));
    vi.stubGlobal('fetch', fetchMock);
    const promise = client.boards();
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('reports network failures as TRELLO_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const error = await client.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrelloError);
    expect(error).toMatchObject({ code: 'TRELLO_UNAVAILABLE', status: 502 });
  });

  it('rejects responses in an unexpected shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, { not: 'a list' })));
    await expect(client.boards()).rejects.toMatchObject({ code: 'TRELLO_UNAVAILABLE' });
  });

  it('moves cards and posts comments with PUT/POST, returning the new id', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(200, { id: 'card1' })).mockResolvedValueOnce(respond(200, { id: 'action9' }));
    vi.stubGlobal('fetch', fetchMock);
    await client.moveCard('card1', 'list2');
    await expect(client.addComment('card1', 'Done: the link works')).resolves.toEqual({ id: 'action9' });
    const [moveUrl, moveInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(moveInit.method).toBe('PUT');
    expect(moveUrl.toString()).toBe(`${BASE}/cards/card1?idList=list2`);
    const [commentUrl, commentInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(commentInit.method).toBe('POST');
    expect(commentUrl.searchParams.get('text')).toBe('Done: the link works');
  });

  it('reads comments with their author', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond(200, [{ id: 'a1', date: '2026-11-14T10:00:00Z', data: { text: 'Also mobile', card: { id: 'c1' } }, memberCreator: { id: 'm', fullName: 'Marie' } }]),
      ),
    );
    const [comment] = await client.cardComments('c1');
    expect(comment).toMatchObject({ id: 'a1', data: { text: 'Also mobile' }, memberCreator: { fullName: 'Marie' } });
  });

  it('downloads attachments with the credentials and refuses large files', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(20), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const data = await client.downloadAttachment('c1', { id: 'att1', name: 'my shot.png' }, 10);
    expect([...data]).toEqual([1, 2, 3]);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(`${BASE}/cards/c1/attachments/att1/download/my%20shot.png`);
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^OAuth/);
    await expect(client.downloadAttachment('c1', { id: 'att2', name: 'big.png' }, 10)).rejects.toThrow(/too large/);
  });
});
