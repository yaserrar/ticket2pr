'use client';

import { PauseCircle, Warning2 } from 'iconsax-react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { useClaudeUsage, useResumeClaude } from '~/hooks/claude';
import { formatTime } from '~/lib/format';
import { useNow } from '~/hooks/use-now';

const WARN_AT = 0.8;
/** Usage reports older than this say little about now. */
const FRESH_MS = 5 * 3600_000;

/**
 * Claude subscription usage on the board: a pause banner when the limit is
 * reached (queued runs continue at the reset), and a heads-up near it.
 */
export function UsageBanner() {
  const usage = useClaudeUsage();
  const resume = useResumeClaude();
  const now = useNow();
  const state = usage.data;
  if (!state) return null;

  if (state.pausedUntil) {
    return (
      <div
        role="status"
        className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/25 bg-warning-subtle px-3 py-2.5 text-[13px] text-warning-muted sm:mx-5"
      >
        <PauseCircle className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          Your Claude usage limit is reached. Queued runs continue automatically at {formatTime(state.pausedUntil)}.
        </span>
        <Button
          size="xs"
          variant="outline"
          loading={resume.isPending}
          onClick={() => resume.mutate(undefined, { onSuccess: () => toast.success('Runs resumed') })}
        >
          Resume now
        </Button>
      </div>
    );
  }

  const u = state.usage;
  const fresh = u && now > 0 && now - new Date(u.reportedAt).getTime() < FRESH_MS && (!u.resetsAt || new Date(u.resetsAt).getTime() > now);
  if (!u || !fresh || u.utilization === null || u.utilization < WARN_AT) return null;
  return (
    <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border bg-fill px-3 py-2 text-[13px] text-muted-foreground sm:mx-5">
      <Warning2 className="size-4 shrink-0 text-warning" />
      <span>
        You’ve used {Math.round(u.utilization * 100)}% of your Claude limit{u.resetsAt ? `, it resets at ${formatTime(u.resetsAt)}` : ''}. If it runs
        out, queued runs wait for the reset.
      </span>
    </div>
  );
}
