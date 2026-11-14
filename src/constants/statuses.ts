import type { CardStatus } from '~/schemas/common';

/** Board columns (spec §11.3). `tone` maps to a token family in globals.css. */
export const STATUS_META: Record<CardStatus, { label: string; tone: 'neutral' | 'brand' | 'warning' | 'success'; empty: string }> = {
  NEW: { label: 'New', tone: 'neutral', empty: 'No new cards' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand', empty: 'Nothing in progress' },
  REVIEW: { label: 'Review', tone: 'warning', empty: 'Nothing to review' },
  DONE: { label: 'Done', tone: 'success', empty: 'Nothing done yet' },
};
