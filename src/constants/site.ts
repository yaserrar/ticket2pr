export const PRODUCT = {
  name: 'Ticket2PR',
  description: 'Turn Trello cards into reviewed pull requests with Claude Code, on your own machine.',
} as const;

/** Cookie remembering the last opened project, so `/` reopens it. */
export const LAST_PROJECT_COOKIE = 't2p.project';

export const TRELLO_LINKS = {
  /** Where the user creates a Power-Up and its API key. */
  apiKeys: 'https://trello.com/power-ups/admin',
  /** Token authorisation page for a given API key (read + write, never expires). */
  authorize: (key: string) =>
    `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=Ticket2PR&key=${encodeURIComponent(key)}`,
} as const;
