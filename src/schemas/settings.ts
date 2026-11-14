import { z } from 'zod';

export const POLL_INTERVALS = [30, 60, 120, 300, 600, 1800, 3600] as const;

const trelloKey = z.string().trim().min(1, 'Paste your Trello API key').max(200);
const trelloToken = z.string().trim().min(1, 'Paste your Trello token').max(400);
const pollIntervalSec = z.coerce
  .number()
  .int()
  .min(30, 'At least 30 seconds')
  .max(3600, 'At most 1 hour');

/** Trello credentials form (onboarding + settings). Saving verifies them against Trello. */
export const trelloCredentialsSchema = z.object({
  trelloApiKey: trelloKey,
  trelloToken: trelloToken,
});
export type TrelloCredentialsInput = z.infer<typeof trelloCredentialsSchema>;

/**
 * `PUT /api/settings`: every field is optional. Omitted credentials keep the
 * stored value, so the UI never has to send secrets back (spec §5.4).
 */
export const updateSettingsBody = z
  .object({
    trelloApiKey: trelloKey.optional(),
    trelloToken: trelloToken.optional(),
    /** `null` removes the saved token. */
    githubToken: z.string().trim().min(1).max(400).nullable().optional(),
    pollIntervalSec: pollIntervalSec.optional(),
    maxParallelRuns: z.coerce.number().int().min(1).max(4).optional(),
    /** `null` = Claude Code's default model. */
    claudeModel: z.string().trim().min(1).max(100).nullable().optional(),
    maxTurns: z.coerce.number().int().min(5).max(300).optional(),
  })
  .refine((v) => (v.trelloApiKey === undefined) === (v.trelloToken === undefined), {
    message: 'Send the API key and the token together',
    path: ['trelloToken'],
  });
export type UpdateSettingsInput = z.infer<typeof updateSettingsBody>;

/** `POST /api/settings/test-trello`: tests the given credentials, or the stored ones when omitted. */
export const testTrelloBody = z.object({
  trelloApiKey: trelloKey.optional(),
  trelloToken: trelloToken.optional(),
});
export type TestTrelloInput = z.infer<typeof testTrelloBody>;

export const githubTokenSchema = z.object({
  githubToken: z.string().trim().min(1, 'Paste a GitHub token').max(400),
});
export type GithubTokenInput = z.infer<typeof githubTokenSchema>;

export const MAX_PARALLEL_RUNS = [1, 2, 3, 4] as const;

export const MAX_TURNS_OPTIONS = [20, 40, 60, 100, 150] as const;
