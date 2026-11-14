import 'server-only';
import { z } from 'zod';

/**
 * Every server environment variable, validated once at boot. Ticket2PR is
 * local-first: there are no secrets here. Trello credentials are entered in
 * the UI and stored in the local SQLite file (spec §4.3).
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('file:./data/app.db'),
  TRELLO_API_BASE: z.string().url().default('https://api.trello.com/1'),
  GITHUB_API_BASE: z.string().url().default('https://api.github.com'),
  /** "claude" = Claude Code through the Agent SDK. "fake" = scripted runs for UI work, no usage (spec §7.6). */
  RUNNER: z.enum(['fake', 'claude']).default('claude'),
  /** Optional: use this `claude` binary instead of the one bundled with the Agent SDK. */
  CLAUDE_CODE_PATH: optional,
  /** Where card worktrees live (default ~/.ticket2pr/worktrees). */
  WORKTREES_DIR: optional,
  LOG_LEVEL: optional,
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env: Env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
