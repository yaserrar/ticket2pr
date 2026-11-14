'use client';

import * as React from 'react';
import { ExportSquare, InfoCircle, TickCircle, Warning2 } from 'iconsax-react';
import { toast } from 'sonner';
import { FormError } from '~/components/forms/form-field';
import { SecretInput } from '~/components/forms/secret-input';
import { CopyButton } from '~/components/shared/copy-button';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Spinner } from '~/components/ui/spinner';
import { TRELLO_LINKS } from '~/constants/site';
import { useUpdateSettings } from '~/hooks/settings';
import { getErrorMessage } from '~/lib/api-errors';
import { checkTrelloKey, checkTrelloToken } from '~/lib/trello-credentials';
import { cn } from '~/lib/utils';
import type { SettingsDto } from '~/types/settings';

/**
 * Guided Trello connection (spec §6.1). Trello gives every app its own API
 * key through a Power-Up, then the user allows access and gets a token. Three
 * steps, each with the exact clicks and field values, checks on paste, and an
 * automatic connection as soon as a valid token is pasted.
 */
export function TrelloConnectWizard({
  startAtKey = false,
  onConnected,
}: {
  /** Skip "Create a Power-Up" (replacing credentials: the Power-Up already exists). */
  startAtKey?: boolean;
  onConnected?: (settings: SettingsDto) => void;
}) {
  const [step, setStep] = React.useState(startAtKey ? 1 : 0);
  const [keyRaw, setKeyRaw] = React.useState('');
  const [tokenRaw, setTokenRaw] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const save = useUpdateSettings();

  const key = checkTrelloKey(keyRaw);
  const token = checkTrelloToken(tokenRaw);

  const connect = async (tokenValue: string) => {
    setError(null);
    try {
      const settings = await save.mutateAsync({ trelloApiKey: key.value, trelloToken: tokenValue });
      toast.success(`Connected to Trello as @${settings.trelloUsername}`);
      onConnected?.(settings);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="flex gap-2.5 rounded-xl border bg-fill px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
        <InfoCircle className="mt-0.5 size-4 shrink-0 text-info" />
        <span>
          Trello asks every app to have its own key. This is a one-time setup of about 2 minutes. You need to be an
          admin of a Trello Workspace (a free one works).
        </span>
      </p>

      <ol className="flex flex-col">
        <Step
          index={0}
          current={step}
          title="Create a Power-Up for Ticket2PR"
          summary="Power-Up ready"
          onEdit={() => setStep(0)}
        >
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            A Power-Up is how Trello hands out keys. Nothing gets installed on your boards.
          </p>
          <div>
            <Button asChild size="sm" className="gap-2">
              <a href={TRELLO_LINKS.apiKeys} target="_blank" rel="noreferrer noopener">
                Open Trello Power-Up admin
                <ExportSquare className="size-4" />
              </a>
            </Button>
          </div>
          <Instructions>
            <li>
              Sign in to Trello if asked, then click <Ui>New</Ui> at the top right.
            </li>
            <li>
              Fill in the form:
              <FieldTable
                rows={[
                  { field: 'New Power-Up or Integration', value: 'Ticket2PR', copy: true },
                  { field: 'Workspace', value: 'Any Workspace you are an admin of' },
                  { field: 'Iframe connector URL', value: 'Leave it empty' },
                  { field: 'Email', value: 'Your email' },
                  { field: 'Support contact', value: 'Your email' },
                  { field: 'Author', value: 'Your name' },
                ]}
              />
            </li>
            <li>
              Click <Ui>Create</Ui>.
            </li>
          </Instructions>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setStep(1)}>
              I created it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep(1)}>
              I already have a Power-Up
            </Button>
          </div>
        </Step>

        <Step
          index={1}
          current={step}
          title="Copy the API key"
          summary={key.status === 'ok' ? <span className="font-mono">••••{key.value.slice(-4)}</span> : null}
          onEdit={() => setStep(1)}
        >
          <Instructions>
            <li>
              In your Power-Up, open <Ui>API key</Ui> in the left sidebar.
            </li>
            <li>
              Click <Ui>Generate a new API key</Ui>, then <Ui>Generate API key</Ui> to confirm. Skip this if a key is
              already shown.
            </li>
            <li>
              Copy the <Ui>API key</Ui> (32 characters). Not the <Ui>Secret</Ui> shown below it.
            </li>
          </Instructions>
          <div className="flex flex-col gap-2">
            <Label htmlFor="trello-key">API key</Label>
            <Input
              id="trello-key"
              value={keyRaw}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              placeholder="Paste the 32-character key"
              aria-invalid={key.status === 'secret' || key.status === 'invalid' || undefined}
              aria-describedby="trello-key-status"
              className="font-mono text-[13px]"
              onChange={(e) => setKeyRaw(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (checkTrelloKey(pasted).status === 'ok') {
                  e.preventDefault();
                  setKeyRaw(checkTrelloKey(pasted).value);
                  setStep(2);
                }
              }}
            />
            <Status id="trello-key-status" {...keyStatus(key.status)} />
          </div>
          <div>
            <Button size="sm" variant="outline" disabled={key.status !== 'ok'} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </Step>

        <Step index={2} current={step} title="Allow access and paste the token" last>
          <Instructions>
            <li>Click the button below. Trello asks whether Ticket2PR may use your account.</li>
            <li>
              Scroll down and click <Ui>Allow</Ui>.
            </li>
            <li>
              Trello shows a token starting with <Ui>ATTA</Ui>. Copy it and paste it here.
            </li>
          </Instructions>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button asChild size="sm" className="gap-2">
              <a href={TRELLO_LINKS.authorize(key.value)} target="_blank" rel="noreferrer noopener">
                Open Trello authorization
                <ExportSquare className="size-4" />
              </a>
            </Button>
            <span className="text-xs text-subtle-foreground">
              Same as clicking <span className="text-muted-foreground">Token</span> next to your API key in Trello.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="trello-token">Token</Label>
            <SecretInput
              id="trello-token"
              value={tokenRaw}
              autoComplete="off"
              placeholder="ATTA…"
              disabled={save.isPending}
              aria-invalid={token.status === 'looks-like-key' || token.status === 'invalid' || undefined}
              aria-describedby="trello-token-status"
              onChange={(e) => setTokenRaw(e.target.value)}
              onPaste={(e) => {
                const pasted = checkTrelloToken(e.clipboardData.getData('text'));
                if (pasted.status === 'ok') {
                  e.preventDefault();
                  setTokenRaw(pasted.value);
                  void connect(pasted.value);
                }
              }}
            />
            {save.isPending ? (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="size-3" />
                Checking with Trello…
              </p>
            ) : (
              <Status id="trello-token-status" {...tokenStatus(token.status)} />
            )}
          </div>
          <p className="text-xs leading-relaxed text-subtle-foreground">
            Ticket2PR reads your boards and cards. Write access is used later to move cards and post pull request
            links. You can revoke it anytime in your Trello account settings.
          </p>
          <FormError message={error} />
          <div>
            <Button
              size="sm"
              disabled={key.status !== 'ok' || token.status !== 'ok'}
              loading={save.isPending}
              onClick={() => void connect(token.value)}
            >
              Connect Trello
            </Button>
          </div>
        </Step>
      </ol>
    </div>
  );
}

function Step({
  index,
  current,
  title,
  summary,
  onEdit,
  last,
  children,
}: {
  index: number;
  current: number;
  title: string;
  summary?: React.ReactNode;
  onEdit?: () => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  const active = index === current;
  const done = index < current;
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0" aria-current={active ? 'step' : undefined}>
      {!last ? <span aria-hidden className="absolute top-8 bottom-1 left-[13px] w-px bg-border" /> : null}
      <span
        className={cn(
          'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs',
          active && 'glow-brand border-brand-border bg-brand-subtle text-brand-muted',
          done && 'border-success/30 bg-success-subtle text-success',
          !active && !done && 'bg-fill text-subtle-foreground',
        )}
      >
        {done ? <TickCircle variant="Bold" className="size-4" /> : index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4 pt-0.5">
        <div className="flex min-h-6 items-center justify-between gap-3">
          <h3 className={cn('text-sm font-medium', active || done ? 'text-foreground' : 'text-subtle-foreground')}>
            {title}
          </h3>
          {done ? (
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              {summary}
              {onEdit ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded text-brand-muted underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Change
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        {active ? <div className="flex animate-fade-up flex-col gap-4">{children}</div> : null}
      </div>
    </li>
  );
}

function Instructions({ children }: { children: React.ReactNode }) {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13px] leading-relaxed text-muted-foreground marker:font-mono marker:text-xs marker:text-subtle-foreground">
      {children}
    </ol>
  );
}

/** A button or label as it appears in Trello's UI. */
function Ui({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function FieldTable({ rows }: { rows: { field: string; value: string; copy?: boolean }[] }) {
  return (
    <dl className="mt-2 divide-y overflow-hidden rounded-xl border bg-fill-faint">
      {rows.map((row) => (
        <div key={row.field} className="flex min-h-10 items-center justify-between gap-3 px-3 py-1.5">
          <dt className="text-[12.5px] text-muted-foreground">{row.field}</dt>
          <dd className="flex items-center gap-1 text-right text-[12.5px]">
            <span className={row.copy ? 'font-mono text-foreground' : 'text-subtle-foreground'}>{row.value}</span>
            {row.copy ? <CopyButton value={row.value} size="icon-xs" label={`Copy “${row.value}”`} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type StatusProps = { tone: 'muted' | 'ok' | 'error'; text: string | null };

function Status({ id, tone, text }: StatusProps & { id: string }) {
  if (!text) return <p id={id} className="sr-only" />;
  const Icon = tone === 'ok' ? TickCircle : tone === 'error' ? Warning2 : null;
  return (
    <p
      id={id}
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-1.5 text-xs leading-relaxed',
        tone === 'ok' && 'text-success-muted',
        tone === 'error' && 'text-danger-muted',
        tone === 'muted' && 'text-subtle-foreground',
      )}
    >
      {Icon ? <Icon className="mt-px size-3.5 shrink-0" /> : null}
      {text}
    </p>
  );
}

function keyStatus(status: ReturnType<typeof checkTrelloKey>['status']): StatusProps {
  switch (status) {
    case 'ok':
      return { tone: 'ok', text: 'Looks right.' };
    case 'secret':
      return { tone: 'error', text: 'This is the Secret (64 characters). Copy the API key shown above it instead.' };
    case 'invalid':
      return { tone: 'error', text: 'An API key is 32 letters and digits, with no spaces.' };
    default:
      return { tone: 'muted', text: 'Pasting a valid key takes you to the next step.' };
  }
}

function tokenStatus(status: ReturnType<typeof checkTrelloToken>['status']): StatusProps {
  switch (status) {
    case 'ok':
      return { tone: 'ok', text: 'Looks right. Click Connect Trello.' };
    case 'looks-like-key':
      return { tone: 'error', text: 'This is the API key. The token starts with ATTA and is longer.' };
    case 'invalid':
      return { tone: 'error', text: 'A token starts with ATTA and is about 76 characters long.' };
    default:
      return { tone: 'muted', text: 'Pasting a valid token connects right away.' };
  }
}
