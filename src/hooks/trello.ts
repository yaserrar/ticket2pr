'use client';

import { useQuery } from '@tanstack/react-query';
import { qk } from '~/lib/query-keys';
import { trelloApi } from '~/services/api/trello';

export const useTrelloBoards = (enabled = true) =>
  useQuery({ queryKey: qk.trello.boards, queryFn: trelloApi.boards, enabled, staleTime: 60_000 });

export const useTrelloLists = (boardId: string | undefined) =>
  useQuery({
    queryKey: qk.trello.lists(boardId ?? ''),
    queryFn: () => trelloApi.lists(boardId!),
    enabled: Boolean(boardId),
    staleTime: 60_000,
  });
