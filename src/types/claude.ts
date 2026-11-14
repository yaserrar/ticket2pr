/** `GET /api/claude/status`: is Claude Code signed in, with which plan (checked without using it). */
export type ClaudeStatusDto = {
  ok: boolean;
  runner: 'claude' | 'fake';
  email: string | null;
  /** e.g. "Claude Max", "Claude Pro". */
  subscriptionType: string | null;
  /** True when runs use the claude.ai login (subscription), not an API key. */
  usingSubscription: boolean;
  claudeCodeVersion: string | null;
  /** Model aliases and ids the account can use ("default", "opus", "sonnet", …). */
  models: string[];
  error: string | null;
  checkedAt: string;
};
