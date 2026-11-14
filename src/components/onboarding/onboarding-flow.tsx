'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { TickCircle } from 'iconsax-react';
import { LogoMark } from '~/components/brand/logo';
import { ProjectForm } from '~/components/projects/project-form';
import { TrelloConnectWizard } from '~/components/settings/trello-connect-wizard';
import { ClaudeStatusPanel } from '~/components/settings/claude-status-panel';
import { useClaudeStatus } from '~/hooks/claude';
import { LightBeams } from '~/components/shared/light-beams';
import { Button } from '~/components/ui/button';
import { useSettings } from '~/hooks/settings';
import { cn } from '~/lib/utils';
import type { SettingsDto } from '~/types/settings';

type Step = 'claude' | 'trello' | 'project';

/**
 * First launch (spec §11.1): check Claude Code is signed in, connect Trello,
 * then create the first project.
 */
export function OnboardingFlow({ initialSettings }: { initialSettings: SettingsDto }) {
  const router = useRouter();
  const { data: settings = initialSettings } = useSettings();
  const [step, setStep] = React.useState<Step>(initialSettings.trelloConfigured ? 'project' : 'claude');
  const claude = useClaudeStatus();
  const claudeReady = Boolean(claude.data?.ok || claude.data?.runner === 'fake');
  const [replacing, setReplacing] = React.useState(false);

  return (
    <div className="relative isolate min-h-svh overflow-hidden">
      <LightBeams />
      <main id="main" className="relative mx-auto flex min-h-svh w-full max-w-[560px] flex-col justify-center px-4 py-14">
        <div className="mb-8 flex flex-col items-center gap-5 text-center">
          <LogoMark className="size-11 drop-shadow-[0_0_24px_var(--brand-border)]" />
          <h1 className="text-[34px] leading-[1.1] font-semibold tracking-tight sm:text-[40px]">Tickets in, pull requests out.</h1>
          <p className="max-w-md text-[15px] leading-relaxed font-medium text-muted-foreground">
            Connect the Trello board your client writes in. Ticket2PR pulls every new card onto your local board.
          </p>
        </div>

        <div className="window overflow-hidden rounded-2xl">
          <nav aria-label="Setup steps" className="grid grid-cols-3 border-b bg-fill-faint">
            <StepTab index={1} label="Claude Code" active={step === 'claude'} done={claudeReady} onClick={() => setStep('claude')} />
            <StepTab
              index={2}
              label="Trello"
              active={step === 'trello'}
              done={settings.trelloConfigured}
              onClick={() => setStep('trello')}
            />
            <StepTab
              index={3}
              label="First project"
              active={step === 'project'}
              done={false}
              disabled={!settings.trelloConfigured}
              onClick={() => setStep('project')}
            />
          </nav>

          <div className="p-5 sm:p-6">
            {step === 'claude' ? (
              <div className="flex flex-col gap-5">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Ticket2PR runs Claude Code on this machine with your own Claude Pro or Max subscription, through the login of the{' '}
                  <span className="font-mono text-foreground">claude</span> command. No API key, nothing extra to pay.
                </p>
                <ClaudeStatusPanel />
                <div>
                  <Button variant={claudeReady ? 'default' : 'outline'} onClick={() => setStep(settings.trelloConfigured ? 'project' : 'trello')}>
                    {claudeReady ? 'Continue' : 'Continue, I’ll sign in later'}
                  </Button>
                </div>
              </div>
            ) : step === 'trello' ? (
              settings.trelloConfigured && !replacing ? (
                <div className="flex flex-col gap-5">
                  <p className="flex items-center gap-2 text-sm text-success-muted">
                    <TickCircle className="size-4" />
                    <span>
                      Connected to Trello as <span className="font-medium">@{settings.trelloUsername}</span>
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setStep('project')}>Continue</Button>
                    <Button variant="outline" onClick={() => setReplacing(true)}>
                      Use other credentials
                    </Button>
                  </div>
                </div>
              ) : (
                <TrelloConnectWizard
                  onConnected={() => {
                    setReplacing(false);
                    setStep('project');
                  }}
                />
              )
            ) : (
              <ProjectForm submitLabel="Create project and open board" onSaved={(p) => router.push(`/projects/${p.id}`)} />
            )}
          </div>
        </div>

        <p className="mt-5 text-center font-mono text-[11px] leading-5 text-subtle-foreground">
          Runs on 127.0.0.1 only · Credentials stay in ./data on this machine
        </p>
      </main>
    </div>
  );
}

function StepTab({
  index,
  label,
  active,
  done,
  disabled,
  onClick,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'step' : undefined}
      className={cn(
        'relative flex h-12 min-w-0 items-center gap-2 px-3 text-left text-[13px] font-medium sm:gap-2.5 sm:px-5 outline-none transition-colors focus-visible:bg-fill disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {done ? (
        <TickCircle variant="Bold" className="size-4 text-success" />
      ) : (
        <span className="eyebrow text-subtle-foreground">{String(index).padStart(2, '0')}</span>
      )}
      <span className="truncate">{label}</span>
      {active ? <span aria-hidden className="absolute inset-x-3 -bottom-px sm:inset-x-5 h-px bg-brand shadow-[0_0_12px_1px] shadow-brand/70" /> : null}
    </button>
  );
}
