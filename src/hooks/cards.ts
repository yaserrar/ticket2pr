'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '~/lib/query-keys';
import { cardsApi } from '~/services/api/cards';
import { CARD_STATUSES, type CardStatus } from '~/schemas/common';
import type {
  ClientCommentInput,
  CommitInput,
  CreateRunInput,
  OpenPrInput,
  OutOfScopeInput,
  PushInput,
  RetakeScreenshotsInput,
  ScopeCheckInput,
} from '~/schemas/card';
import type { BoardDto, CardDto } from '~/types/card';

/** Looks a card up in the board cache. */
export function findInBoard(board: BoardDto | undefined, cardId: string): CardDto | undefined {
  if (!board) return undefined;
  for (const status of CARD_STATUSES) {
    const card = board.columns[status].find((c) => c.id === cardId);
    if (card) return card;
  }
  return undefined;
}

export const useCard = (projectId: string, cardId: string | null) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.cards.detail(cardId ?? ''),
    queryFn: () => cardsApi.get(cardId!),
    enabled: Boolean(cardId),
    placeholderData: () =>
      cardId ? findInBoard(qc.getQueryData<BoardDto>(qk.projects.board(projectId)), cardId) : undefined,
  });
};

/**
 * Everything a card change can affect: the board, the card, its runs and its
 * git state. `git: false` for changes that remove or keep the card's folder
 * (moves, discard, cleanup, shared push → Done): refetching its git status
 * would only hit a folder that is gone.
 */
export function refreshCard(qc: QueryClient, projectId: string, cardId: string, { git = true } = {}) {
  void qc.invalidateQueries({ queryKey: qk.projects.board(projectId) });
  void qc.invalidateQueries({
    queryKey: ['cards', cardId],
    predicate: git ? undefined : (q) => q.queryKey[2] !== 'git' && q.queryKey[2] !== 'changes',
  });
  void qc.invalidateQueries({ queryKey: qk.projects.repo(projectId) });
}

function placeCard(board: BoardDto, card: CardDto, status: CardStatus, position: number): BoardDto {
  const columns = { ...board.columns };
  for (const s of CARD_STATUSES) columns[s] = columns[s].filter((c) => c.id !== card.id);
  columns[status] = [...columns[status], { ...card, status, position }].sort((a, b) => a.position - b.position);
  return { ...board, columns };
}

/**
 * Moves a card (spec §9.5) optimistically: the board updates at once and
 * rolls back with the server's explanation if the move is refused.
 */
export const useMoveCard = (projectId: string) => {
  const qc = useQueryClient();
  const key = qk.projects.board(projectId);
  return useMutation({
    mutationFn: (v: { card: CardDto; status: CardStatus; position: number; confirmed?: boolean }) =>
      cardsApi.move(v.card.id, { status: v.status, position: v.position, confirmed: v.confirmed ?? false }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BoardDto>(key);
      if (previous) qc.setQueryData(key, placeCard(previous, v.card, v.status, v.position));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: (_d, _e, v) => refreshCard(qc, projectId, v.card.id, { git: false }),
  });
};

export const useCardRuns = (cardId: string | null) =>
  useQuery({ queryKey: qk.cards.runs(cardId ?? ''), queryFn: () => cardsApi.runs(cardId!), enabled: Boolean(cardId) });

/** Retry or Request changes. */
export const useCreateRun = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRunInput) => cardsApi.createRun(cardId, body),
    onSettled: () => refreshCard(qc, projectId, cardId),
  });
};

export const useDiscardCard = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => cardsApi.discard(cardId), onSettled: () => refreshCard(qc, projectId, cardId, { git: false }) });
};

/** Changes vs the base. Refreshes every 3 s while the agent is working, so edits appear live. */
export const useChanges = (cardId: string, enabled: boolean, live = false) =>
  useQuery({
    queryKey: qk.cards.changes(cardId),
    queryFn: () => cardsApi.changes(cardId),
    enabled,
    staleTime: 5_000,
    refetchInterval: live ? 3_000 : false,
  });

export const useGitStatus = (cardId: string, enabled: boolean) =>
  useQuery({ queryKey: qk.cards.git(cardId), queryFn: () => cardsApi.git(cardId), enabled, staleTime: 5_000 });

export const useResetChanges = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => cardsApi.reset(cardId), onSettled: () => refreshCard(qc, projectId, cardId) });
};

export const useCommit = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CommitInput) => cardsApi.commit(cardId, body),
    meta: { silent: true },
    onSettled: () => refreshCard(qc, projectId, cardId),
  });
};

export const usePush = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PushInput) => cardsApi.push(cardId, body),
    meta: { silent: true },
    onSettled: (data) => refreshCard(qc, projectId, cardId, { git: !data?.done }),
  });
};

/** The Trello conversation of a card and what changed since Claude last saw it. */
export const useTrelloUpdates = (cardId: string, enabled: boolean) =>
  useQuery({ queryKey: qk.cards.trelloUpdates(cardId), queryFn: () => cardsApi.trelloUpdates(cardId), enabled, staleTime: 15_000, retry: false });

export const useDismissTrelloUpdates = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => cardsApi.dismissTrelloUpdates(cardId), onSettled: () => refreshCard(qc, projectId, cardId, { git: false }) });
};

/** Post the client update or the questions on Trello. */
export const useClientComment = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ClientCommentInput) => cardsApi.clientComment(cardId, body),
    meta: { silent: true },
    onSettled: () => refreshCard(qc, projectId, cardId, { git: false }),
  });
};

/** Branch-per-card: merge the latest base into the card branch. */
export const useUpdateBase = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cardsApi.updateBase(cardId),
    meta: { silent: true },
    onSettled: () => refreshCard(qc, projectId, cardId),
  });
};

/** Done card: remove the worktree, and the local branch once pushed. */
export const useCleanupCard = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => cardsApi.cleanup(cardId), onSettled: () => refreshCard(qc, projectId, cardId, { git: false }) });
};

export const useOpenPr = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OpenPrInput) => cardsApi.openPr(cardId, body),
    meta: { silent: true },
    onSettled: () => refreshCard(qc, projectId, cardId),
  });
};

/** Check the scope now (again); `start` begins the work once Claude says it's in scope. */
export const useCheckScope = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { cardId: string } & ScopeCheckInput) => cardsApi.checkScope(v.cardId, { start: v.start }),
    onSettled: (_d, _e, v) => refreshCard(qc, projectId, v.cardId, { git: false }),
  });
};

/** New → Out of scope, optionally posting a note for the client on Trello. */
export const useOutOfScope = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OutOfScopeInput) => cardsApi.outOfScope(cardId, body),
    meta: { silent: true },
    onSettled: () => refreshCard(qc, projectId, cardId, { git: false }),
  });
};

/** Start the app again and retake the screenshots (optionally on other pages). */
export const useRetakeScreenshots = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RetakeScreenshotsInput) => cardsApi.retakeScreenshots(cardId, body),
    meta: { silent: true },
    onSettled: () => refreshCard(qc, projectId, cardId, { git: false }),
  });
};
