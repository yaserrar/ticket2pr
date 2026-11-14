/**
 * Central registry of React Query keys: every `queryKey` comes from here so
 * invalidation stays consistent. Invalidate a family with its prefix, e.g.
 * `qk.projects.all` also covers every project's board.
 */
export const qk = {
  settings: ['settings'] as const,
  claude: { status: ['claude', 'status'] as const, usage: ['claude', 'usage'] as const },
  notifications: ['notifications'] as const,
  trello: {
    boards: ['trello', 'boards'] as const,
    lists: (boardId: string) => ['trello', 'boards', boardId, 'lists'] as const,
  },
  projects: {
    all: ['projects'] as const,
    list: () => ['projects', 'list'] as const,
    detail: (projectId: string) => ['projects', projectId, 'detail'] as const,
    board: (projectId: string) => ['projects', projectId, 'board'] as const,
    /** The repository folder vs origin (toolbar chip). */
    repo: (projectId: string) => ['projects', projectId, 'repo'] as const,
    /** Background polling sync (spec §6.4). */
    autoSync: (projectId: string) => ['projects', projectId, 'auto-sync'] as const,
  },
  cards: {
    detail: (cardId: string) => ['cards', cardId] as const,
    runs: (cardId: string) => ['cards', cardId, 'runs'] as const,
    changes: (cardId: string) => ['cards', cardId, 'changes'] as const,
    git: (cardId: string) => ['cards', cardId, 'git'] as const,
    trelloUpdates: (cardId: string) => ['cards', cardId, 'trello-updates'] as const,
  },
};
