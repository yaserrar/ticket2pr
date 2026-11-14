import { differenceInSeconds, format, formatDistanceStrict } from 'date-fns';

/**
 * Display formatting: use these everywhere instead of ad-hoc toLocaleString so
 * numbers and dates read the same across the app.
 */
const LOCALE = 'en-US';

type DateInput = Date | string | number;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2, ...options }).format(value);
}

/** Milliseconds → "850 ms", "12.4 s", "3m 05s", "1h 02m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

/** "just now", "5 min ago", "in 2 days". */
export function formatRelative(date: DateInput, now: Date = new Date()): string {
  const d = toDate(date);
  if (Math.abs(differenceInSeconds(now, d)) < 45) return 'just now';
  return formatDistanceStrict(d, now, { addSuffix: true }).replace('minutes', 'min').replace('minute', 'min');
}

/** "27 Sep 2026". */
export function formatDate(date: DateInput, pattern = 'd MMM yyyy'): string {
  return format(toDate(date), pattern);
}

/** "27 Sep 2026, 14:05". */
export function formatDateTime(date: DateInput): string {
  return format(toDate(date), 'd MMM yyyy, HH:mm');
}

/** A time soon: "14:05" today, "14:05 tomorrow", else "16 Nov, 14:05". */
export function formatTime(date: DateInput, now: Date = new Date()): string {
  const d = toDate(date);
  const time = format(d, 'HH:mm');
  if (d.toDateString() === now.toDateString()) return time;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `${time} tomorrow`;
  return format(d, 'd MMM, HH:mm');
}

/** Poll interval in seconds → "30 s", "2 min", "1 h". */
export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

/** "1 card" / "3 cards". */
export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
