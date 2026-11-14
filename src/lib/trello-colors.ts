/**
 * Trello label colour names → display colours. Label colours are user data
 * from Trello, applied through a CSS variable (see <LabelChip/>), like
 * Dispatch's workspace labels.
 */
const BASE: Record<string, string> = {
  green: '#4bce97',
  yellow: '#e2b203',
  orange: '#fea362',
  red: '#f87168',
  purple: '#9f8fef',
  blue: '#579dff',
  sky: '#6cc3e0',
  lime: '#94c748',
  pink: '#e774bb',
  black: '#8c9bab',
};

const NEUTRAL = '#8c8d90';

/** Handles plain, `_light` and `_dark` variants (`green_dark` → green). `null` = no colour. */
export function trelloLabelColor(color: string | null): string {
  if (!color) return NEUTRAL;
  return BASE[color.replace(/_(light|dark)$/, '')] ?? NEUTRAL;
}
