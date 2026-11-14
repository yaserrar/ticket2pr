'use client';

import { toast } from 'sonner';
import { RelativeTime } from '~/components/shared/relative-time';
import { Button } from '~/components/ui/button';
import { useClaudeUsage, useResumeClaude } from '~/hooks/claude';
import { formatTime } from '~/lib/format';

const LIMITS: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'weekly limit',
  seven_day_opus: 'weekly Opus limit',
  seven_day_sonnet: 'weekly Sonnet limit',
};

/** Last usage report from a run, and the pause when the limit is reached. */
export function UsageLine() {
  const usage = useClaudeUsage();
  const resume = useResumeClaude();
  const state = usage.data;
  if (!state) return null;
  const u = state.usage;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-fill-faint px-3 py-2.5 text-[13px]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-foreground">
          {state.pausedUntil
            ? `Limit reached: queued runs continue at ${formatTime(state.pausedUntil)}`
            : u?.utilization !== null && u?.utilization !== undefined
              ? `${Math.round(u.utilization * 100)}% of your ${LIMITS[u.limitType ?? ''] ?? 'limit'} used${u.resetsAt ? `, resets ${formatTime(u.resetsAt)}` : ''}`
              : 'Usage: no report yet'}
        </span>
        <span className="text-xs text-subtle-foreground">
          {u ? (
            <>
              Reported by the last run <RelativeTime date={u.reportedAt} />. At the limit, runs wait for the reset and continue on their own.
            </>
          ) : (
            'Claude reports usage during runs. At the limit, runs wait for the reset and continue on their own.'
          )}
        </span>
      </div>
      {state.pausedUntil ? (
        <Button size="sm" variant="outline" loading={resume.isPending} onClick={() => resume.mutate(undefined, { onSuccess: () => toast.success('Runs resumed') })}>
          Resume now
        </Button>
      ) : null}
    </div>
  );
}
