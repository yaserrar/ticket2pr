'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { TickCircle, Trello, Warning2 } from 'iconsax-react';
import { toast } from 'sonner';
import { AppPage, PageHeader, SettingsSection } from '~/components/layout/app-page';
import { ConfirmButton } from '~/components/shared/confirm-button';
import { Button } from '~/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { useDisconnectTrello, useSettings, useTestTrello, useUpdateSettings } from '~/hooks/settings';
import { getErrorMessage } from '~/lib/api-errors';
import { formatInterval } from '~/lib/format';
import { githubTokenSchema, MAX_PARALLEL_RUNS, MAX_TURNS_OPTIONS, POLL_INTERVALS, type GithubTokenInput } from '~/schemas/settings';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormError, FormField } from '~/components/forms/form-field';
import type { SettingsDto } from '~/types/settings';
import { TrelloConnectWizard } from './trello-connect-wizard';
import { ClaudeStatusPanel } from './claude-status-panel';
import { NotificationsSection } from './notifications-section';
import { UsageLine } from './usage-line';
import { useClaudeStatus } from '~/hooks/claude';

/** Settings page (spec §11.5): Trello credentials and sync interval. */
export function SettingsView() {
  const { data: settings, isPending } = useSettings();

  return (
    <AppPage>
      <PageHeader title="Settings" description="Stored in the local database on this machine." />
      {isPending || !settings ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : (
        <>
          <ClaudeSection settings={settings} />
          <TrelloSection settings={settings} />
          <SyncSection settings={settings} />
          <RunsSection settings={settings} />
          <NotificationsSection />
          <GithubSection settings={settings} />
          {settings.trelloConfigured ? <DisconnectSection /> : null}
        </>
      )}
    </AppPage>
  );
}

function TrelloSection({ settings }: { settings: SettingsDto }) {
  const test = useTestTrello();
  const [editing, setEditing] = React.useState(!settings.trelloConfigured);

  const runTest = () =>
    test.mutate(
      {},
      {
        onSuccess: (member) => toast.success(`Connection works. Signed in as @${member.username}`),
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );

  return (
    <SettingsSection
      title="Trello"
      description="An API key and a token with read and write access. They are never sent back to the browser in full."
      aside={<Trello className="size-5 text-info" aria-hidden />}
    >
      {settings.trelloConfigured ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-success-muted">
            <TickCircle className="size-4" />
            <span>
              Connected as <span className="font-medium">@{settings.trelloUsername}</span>
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">API key</dt>
            <dd className="font-mono text-xs text-foreground">{settings.trelloApiKeyMasked}</dd>
            <dt className="text-muted-foreground">Token</dt>
            <dd className="font-mono text-xs text-foreground">{settings.trelloTokenMasked}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={runTest} loading={test.isPending}>
              Test connection
            </Button>
            {!editing ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Replace credentials
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-warning-muted">
          <Warning2 className="size-4" />
          Not connected. Projects can&apos;t sync until Trello is connected.
        </p>
      )}

      {editing ? (
        <div className={settings.trelloConfigured ? 'border-t pt-5' : undefined}>
          <TrelloConnectWizard startAtKey={settings.trelloConfigured} onConnected={() => setEditing(false)} />
        </div>
      ) : null}
    </SettingsSection>
  );
}

function SyncSection({ settings }: { settings: SettingsDto }) {
  const update = useUpdateSettings();
  const options = POLL_INTERVALS.includes(settings.pollIntervalSec as (typeof POLL_INTERVALS)[number])
    ? POLL_INTERVALS
    : [...POLL_INTERVALS, settings.pollIntervalSec].sort((a, b) => a - b);

  return (
    <SettingsSection
      title="Sync"
      description="While a board is open, Ticket2PR checks Trello on this interval. Nothing runs when the app is closed."
    >
      <Field orientation="horizontal" className="justify-between">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="poll-interval">Check Trello every</FieldLabel>
          <FieldDescription>The Refresh button syncs right away.</FieldDescription>
        </div>
        <Select
          value={String(settings.pollIntervalSec)}
          disabled={update.isPending}
          onValueChange={(value) =>
            update.mutate(
              { pollIntervalSec: Number(value) },
              { onSuccess: (next) => toast.success(`Trello is now checked every ${formatInterval(next.pollIntervalSec)}`) },
            )
          }
        >
          <SelectTrigger id="poll-interval" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((sec) => (
              <SelectItem key={sec} value={String(sec)}>
                {formatInterval(sec)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </SettingsSection>
  );
}

/** Claude Code: login status (subscription), model and turn limit. */
function ClaudeSection({ settings }: { settings: SettingsDto }) {
  const update = useUpdateSettings();
  const status = useClaudeStatus();
  // Aliases first ("default", "opus", "sonnet"…), then full model ids.
  const models = status.data?.models.length ? status.data.models : ['default', 'opus', 'sonnet', 'haiku'];
  const current = settings.claudeModel ?? 'default';
  const options = models.includes(current) ? models : [current, ...models];
  const turns = MAX_TURNS_OPTIONS.includes(settings.maxTurns as (typeof MAX_TURNS_OPTIONS)[number])
    ? MAX_TURNS_OPTIONS
    : [...MAX_TURNS_OPTIONS, settings.maxTurns].sort((a, b) => a - b);

  return (
    <SettingsSection
      title="Claude Code"
      description="Runs Claude Code on this machine with your own Claude subscription (the login of the claude command). No API key."
    >
      <ClaudeStatusPanel />
      <UsageLine />
      <div className="flex flex-col gap-4 border-t pt-5">
        <Field orientation="horizontal" className="justify-between">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="claude-model">Model</FieldLabel>
            <FieldDescription>“default” follows Claude Code’s own choice for your plan.</FieldDescription>
          </div>
          <Select
            value={current}
            disabled={update.isPending}
            onValueChange={(value) =>
              update.mutate({ claudeModel: value }, { onSuccess: () => toast.success(`Model: ${value}`) })
            }
          >
            <SelectTrigger id="claude-model" className="w-52 font-mono text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {options.map((m) => (
                <SelectItem key={m} value={m} className="font-mono text-[13px]">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal" className="justify-between">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="max-turns">Turn limit per run</FieldLabel>
            <FieldDescription>A run stops after this many agent turns. Retry continues the same branch.</FieldDescription>
          </div>
          <Select
            value={String(settings.maxTurns)}
            disabled={update.isPending}
            onValueChange={(value) =>
              update.mutate({ maxTurns: Number(value) }, { onSuccess: (next) => toast.success(`Up to ${next.maxTurns} turns per run`) })
            }
          >
            <SelectTrigger id="max-turns" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {turns.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} turns
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </SettingsSection>
  );
}

function RunsSection({ settings }: { settings: SettingsDto }) {
  const update = useUpdateSettings();
  return (
    <SettingsSection
      title="Runs"
      description="How many cards the agent works on at the same time. Extra cards wait in line and show their place in the queue."
    >
      <Field orientation="horizontal" className="justify-between">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="parallel-runs">Runs at the same time</FieldLabel>
          <FieldDescription>Each run uses its own worktree and agent session.</FieldDescription>
        </div>
        <Select
          value={String(settings.maxParallelRuns)}
          disabled={update.isPending}
          onValueChange={(value) =>
            update.mutate(
              { maxParallelRuns: Number(value) },
              { onSuccess: (next) => toast.success(`Up to ${next.maxParallelRuns} at the same time`) },
            )
          }
        >
          <SelectTrigger id="parallel-runs" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAX_PARALLEL_RUNS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n === 1 ? '1 (one by one)' : n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </SettingsSection>
  );
}

/** Optional GitHub token (spec §8.5): with it, pull requests open from Ticket2PR. */
function GithubSection({ settings }: { settings: SettingsDto }) {
  const update = useUpdateSettings();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<GithubTokenInput>({ resolver: zodResolver(githubTokenSchema), defaultValues: { githubToken: '' } });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    update.mutate(
      { githubToken: values.githubToken },
      {
        onSuccess: () => {
          form.reset();
          toast.success('GitHub token saved');
        },
        onError: (e) => setError(getErrorMessage(e)),
      },
    );
  });

  return (
    <SettingsSection
      title="GitHub (optional)"
      description={
        <>
          With a token, “Open pull request” creates the PR and moves the card to Done. Without one, Ticket2PR opens GitHub’s compare page
          and you click “Create pull request” there. Use a{' '}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer noopener"
            className="text-brand-muted underline-offset-4 hover:underline"
          >
            fine-grained token
          </a>{' '}
          with <span className="text-foreground">Pull requests: Read and write</span> on your repositories.
        </>
      }
    >
      {settings.githubTokenMasked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-success-muted">
            <TickCircle className="size-4" />
            <span>
              Token saved <span className="font-mono text-xs text-foreground">{settings.githubTokenMasked}</span>
            </span>
          </p>
          <Button
            size="sm"
            variant="ghost"
            loading={update.isPending}
            onClick={() => update.mutate({ githubToken: null }, { onSuccess: () => toast.success('GitHub token removed') })}
          >
            Remove token
          </Button>
        </div>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <FormField
          control={form.control}
          name="githubToken"
          type="password"
          label={settings.githubTokenMasked ? 'Replace the token' : 'Personal access token'}
          placeholder="github_pat_…"
          autoComplete="off"
        />
        <FormError message={error} />
        <div>
          <Button type="submit" size="sm" variant="outline" loading={update.isPending}>
            Check and save
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

function DisconnectSection() {
  const disconnect = useDisconnectTrello();
  const router = useRouter();
  return (
    <SettingsSection
      tone="danger"
      title="Disconnect Trello"
      description="Forgets the key and token. Projects and their cards stay, and sync resumes once you connect again."
    >
      <div>
        <ConfirmButton
          label="Disconnect Trello"
          title="Disconnect Trello?"
          description="Ticket2PR will stop syncing until you connect again. Your projects and cards are kept."
          confirmLabel="Disconnect"
          pending={disconnect.isPending}
          onConfirm={async () => {
            await disconnect.mutateAsync();
            toast.success('Trello disconnected');
            router.push('/onboarding');
          }}
        />
      </div>
    </SettingsSection>
  );
}
