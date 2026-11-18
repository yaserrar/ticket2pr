import { createHash } from 'node:crypto';

/**
 * Fingerprint of the card content a scope verdict was given for. When the
 * client edits the card on Trello, the verdict is stale and is checked again.
 */
export function scopeContentKey(card: { title: string; description: string; labelsJson: string; checklistsJson: string }) {
  return createHash('sha1')
    .update(JSON.stringify([card.title, card.description, card.labelsJson, card.checklistsJson]))
    .digest('hex');
}
