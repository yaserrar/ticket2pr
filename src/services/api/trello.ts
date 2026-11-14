import type { TrelloBoardDto, TrelloListDto } from '~/types/trello';
import { api } from './client';

export const trelloApi = {
  boards: () => api.get<TrelloBoardDto[]>('/trello/boards'),
  lists: (boardId: string) => api.get<TrelloListDto[]>(`/trello/boards/${boardId}/lists`),
};
