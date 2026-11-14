import type { SyncResultDto } from '~/types/project';
import { plural } from './format';

/** "2 new cards · 1 updated" or "Already up to date". */
export function describeSync(result: Pick<SyncResultDto, 'added' | 'updated' | 'removed'>): string {
  const parts = [
    result.added ? plural(result.added, 'new card') : null,
    result.updated ? `${result.updated} updated` : null,
    result.removed ? `${result.removed} removed from Trello` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Already up to date';
}
