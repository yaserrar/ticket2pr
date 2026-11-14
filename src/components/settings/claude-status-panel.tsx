'use client';

import { InfoCircle, TickCircle, Warning2 } from 'iconsax-react';
import { CopyButton } from '~/components/shared/copy-button';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useClaudeStatus, useRecheckClaude } from '~/hooks/claude';
import { getErrorMessage } from '~/lib/api-errors';

/**
 * Is Claude Code ready (spec §11.1 step 1)? Runs use the developer's Claude
 * subscription through their local `claude` login, never an API key.
 */
export function ClaudeStatusPanel() {
  const status = useClaudeStatus();
  const recheck = useRecheckClaude();

  if (status.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  const data = status.data;
  const error = status.error ? getErrorMessage(status.error) : (data?.error ?? null);

  if (data?.runner === 'fake') {
    return (
      <p className="flex gap-2.5 rounded-xl border bg-fill px-3 py-2.5 text-[13px] text-muted-foreground">
        <InfoCircle className="mt-0.5 size-4 shrink-0 text-info" />
        <span>
          <span className="text-foreground">RUNNER=&quot;fake&quot;</span> is set: runs are simulated and don’t use Claude. Remove it from
          .env to use Claude Code.
        </span>
      </p>
    );
  }

  if (data?.ok) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm text-success-muted">
            <TickCircle className="size-4 shrink-0" />
            <span>
              Signed in as <span className="font-medium">{data.email ?? 'your Claude account'}</span>
              {data.subscriptionType ? <span className="text-muted-foreground"> · {data.subscriptionType}</span> : null}
            </span>
          </p>
          <p className="pl-6 text-xs text-subtle-foreground">
            {data.usingSubscription ? 'Runs use your Claude subscription, not an API key.' : 'Runs use an API key from your Claude Code setup.'}
            {data.claudeCodeVersion ? ` Claude Code ${data.claudeCodeVersion}.` : ''}
          </p>
        </div>
        <Button size="sm" variant="ghost" loading={recheck.isPending} onClick={() => recheck.mutate()}>
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="flex gap-2 text-sm text-warning-muted">
        <Warning2 className="mt-0.5 size-4 shrink-0" />
        <span>{error ?? 'Claude Code is not signed in.'}</span>
      </p>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13px] leading-relaxed text-muted-foreground marker:font-mono marker:text-xs marker:text-subtle-foreground">
        <li>
          Open a terminal and run
          <span className="ml-2 inline-flex items-center gap-1 rounded-md border bg-fill px-2 py-0.5 align-middle font-mono text-xs text-foreground">
            claude
            <CopyButton value="claude" size="icon-xs" label="Copy command" />
          </span>
        </li>
        <li>
          Type <span className="font-mono text-foreground">/login</span> and sign in with the Claude account that has your Pro or Max plan.
        </li>
        <li>Come back here and check again. No API key is needed.</li>
      </ol>
      <div>
        <Button size="sm" variant="outline" loading={recheck.isPending} onClick={() => recheck.mutate()}>
          Check again
        </Button>
      </div>
    </div>
  );
}
