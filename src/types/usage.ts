import type { CardUsageRow, UsagePeriod, UsageTotals } from '~/lib/usage';

/** `GET /api/projects/{id}/usage?period=`: time and Claude usage of the project's cards. */
export type ProjectUsageDto = {
  period: UsagePeriod;
  /** The period's calendar days on this machine, "2026-11-01" (null: all time; `lastDay` null: up to today). */
  firstDay: string | null;
  lastDay: string | null;
  /** Every period at a glance. */
  periods: Record<UsagePeriod, UsageTotals>;
  /** Cards with runs in the selected period, latest work first. */
  cards: CardUsageRow[];
};
