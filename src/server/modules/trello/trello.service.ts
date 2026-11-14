import 'server-only';
import { settingsService } from '~/server/modules/settings/settings.service';
import type { TrelloBoardDto, TrelloListDto } from '~/types/trello';
import { createTrelloClient } from './trello.client';

/** Board and list pickers for the project form (spec §11.2). */
export const trelloService = {
  async client() {
    return createTrelloClient(await settingsService.trelloCredentials());
  },

  async listBoards(): Promise<TrelloBoardDto[]> {
    const boards = await (await this.client()).boards();
    return boards
      .map((b) => ({ id: b.id, name: b.name, url: b.url }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async listLists(boardId: string): Promise<TrelloListDto[]> {
    const lists = await (await this.client()).lists(boardId);
    return [...lists].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)).map((l) => ({ id: l.id, name: l.name }));
  },
};
