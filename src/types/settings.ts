import type { ISODate } from './api';

/** `GET /api/settings`. Secrets are masked (`••••abcd`) and never sent back in full. */
export type SettingsDto = {
  trelloConfigured: boolean;
  trelloApiKeyMasked: string | null;
  trelloTokenMasked: string | null;
  trelloUsername: string | null;
  githubTokenMasked: string | null;
  pollIntervalSec: number;
  maxParallelRuns: number;
  claudeModel: string | null;
  maxTurns: number;
  updatedAt: ISODate;
};
