import 'server-only';
import type { Settings } from '~/generated/prisma/client';
import type { SettingsDto } from '~/types/settings';

/** `abcd1234wxyz` → `••••wxyz`. Short values are fully masked. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 8 ? '••••' : `••••${value.slice(-4)}`;
}

export function presentSettings(row: Settings): SettingsDto {
  return {
    trelloConfigured: Boolean(row.trelloApiKey && row.trelloToken),
    trelloApiKeyMasked: maskSecret(row.trelloApiKey),
    trelloTokenMasked: maskSecret(row.trelloToken),
    trelloUsername: row.trelloUsername,
    githubTokenMasked: maskSecret(row.githubToken),
    pollIntervalSec: row.pollIntervalSec,
    maxParallelRuns: row.maxParallelRuns,
    claudeModel: row.claudeModel,
    maxTurns: row.maxTurns,
    updatedAt: row.updatedAt.toISOString(),
  };
}
