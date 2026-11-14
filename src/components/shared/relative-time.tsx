'use client';

import { formatDateTime, formatRelative } from '~/lib/format';
import { useNow } from '~/hooks/use-now';

/**
 * <time> that shows "5 min ago" and refreshes with the shared clock; the
 * exact date is in the title. Renders the absolute date on the server and
 * before hydration (no mismatch).
 */
export function RelativeTime({ date, className }: { date: string | Date; className?: string }) {
  const now = useNow();
  const d = typeof date === 'string' ? new Date(date) : date;
  return (
    <time dateTime={d.toISOString()} title={formatDateTime(d)} className={className} suppressHydrationWarning>
      {now ? formatRelative(d, new Date(now)) : formatDateTime(d)}
    </time>
  );
}
