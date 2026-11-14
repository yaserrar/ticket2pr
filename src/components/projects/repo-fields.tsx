'use client';

import * as React from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { Briefcase, CloseCircle, Folder2, Hierarchy, InfoCircle, TickCircle, Warning2 } from 'iconsax-react';
import { FormField } from '~/components/forms/form-field';
import { Button } from '~/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Switch } from '~/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { useValidateRepo } from '~/hooks/projects';
import { getErrorMessage } from '~/lib/api-errors';
import { plural } from '~/lib/format';
import { cn } from '~/lib/utils';
import type { ProjectInput, WorkMode } from '~/schemas/project';
import type { RepoValidationDto } from '~/types/git';

/**
 * Repository part of the project form (spec §8.1, §11.2). Browsers can't
 * return folder paths, so the path is typed and checked server-side: Validate
 * lists the checks and fills the base branch picker.
 */
export function RepoFields({ form, initialPath }: { form: UseFormReturn<ProjectInput>; initialPath?: string | null }) {
  const validate = useValidateRepo();
  const [result, setResult] = React.useState<RepoValidationDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const repoPath = useWatch({ control: form.control, name: 'repoPath' });
  const workMode = useWatch({ control: form.control, name: 'workMode' });
  const baseBranch = useWatch({ control: form.control, name: 'baseBranch' });
  const sharedBranch = useWatch({ control: form.control, name: 'sharedBranch' });
  const sharedInRepo = useWatch({ control: form.control, name: 'sharedInRepo' });
  const shared = workMode === 'SHARED_BRANCH';
  const workBranch = sharedBranch || baseBranch || 'main';
  const stale = result && result.repoPath !== repoPath.trim() && !result.checks.some((c) => !c.ok && c.blocking);

  const run = React.useCallback(
    async (path: string) => {
      if (!path.trim()) return;
      setError(null);
      try {
        const res = await validate.mutateAsync(path);
        setResult(res);
        if (res.ok && res.repoPath) {
          form.setValue('repoPath', res.repoPath, { shouldValidate: true });
          const current = form.getValues('baseBranch');
          if (!res.branches.includes(current) && res.defaultBranch) form.setValue('baseBranch', res.defaultBranch, { shouldValidate: true });
        }
      } catch (e) {
        setError(getErrorMessage(e));
      }
    },
    [validate, form],
  );

  // Editing a project: load its branches right away.
  const ran = React.useRef(false);
  React.useEffect(() => {
    if (ran.current || !initialPath) return;
    ran.current = true;
    void run(initialPath);
  }, [initialPath, run]);

  const branches = result?.ok && !stale ? result.branches : null;
  const currentBranch = result?.ok && !stale ? result.currentBranch : null;

  return (
    <div className="flex flex-col gap-5">
      <FormField
        control={form.control}
        name="repoPath"
        label="Repository path"
        description={
          shared && sharedInRepo
            ? 'The folder of the local git repository, for example ~/code/client-site. Claude works directly in this folder, on the shared branch.'
            : 'The folder of the local git repository, for example ~/code/client-site. Cards work in separate folders (worktrees), so this folder is never touched.'
        }
        render={({ id, value, onChange, onBlur, invalid }) => (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Folder2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input
                id={id}
                value={(value as string) ?? ''}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => {
                  onBlur();
                  const v = form.getValues('repoPath');
                  if (v.trim() && v.trim() !== result?.repoPath) void run(v);
                }}
                aria-invalid={invalid || undefined}
                placeholder="~/code/client-site"
                spellCheck={false}
                autoComplete="off"
                className="pl-8 font-mono text-[13px]"
              />
            </div>
            <Button type="button" variant="outline" onClick={() => void run(repoPath)} loading={validate.isPending} disabled={!repoPath.trim()}>
              Validate
            </Button>
          </div>
        )}
      />

      {error ? <p className="text-sm text-danger-muted">{error}</p> : null}
      {result && !stale ? (
        <ul className="flex flex-col gap-1.5 rounded-xl border bg-fill-faint p-3 text-[13px]" aria-label="Repository checks">
          {result.checks.map((check) => {
            const Icon = check.ok ? TickCircle : check.blocking ? CloseCircle : InfoCircle;
            return (
              <li key={check.label} className="flex items-start gap-2">
                <Icon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    check.ok ? 'text-success' : check.blocking ? 'text-danger' : 'text-warning',
                  )}
                />
                <span className="min-w-0">
                  <span className="text-foreground">{check.label}</span>
                  {check.detail ? <span className="block truncate font-mono text-xs text-muted-foreground">{check.detail}</span> : null}
                </span>
              </li>
            );
          })}
          {result.ok ? (
            <li className="pt-1 text-xs text-subtle-foreground">
              {plural(result.branches.length, 'branch', 'branches')} found{result.defaultBranch ? `, default ${result.defaultBranch}` : ''}.
            </li>
          ) : null}
        </ul>
      ) : null}

      <FormField
        control={form.control}
        name="baseBranch"
        label="Base branch"
        description={
          shared
            ? 'Your main branch. Release pull requests from the shared branch target it.'
            : 'New card branches start from the latest origin version of this branch, and pull requests target it.'
        }
        render={({ id, value, onChange, invalid }) =>
          branches ? (
            <Select value={(value as string) ?? ''} onValueChange={onChange}>
              <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full font-mono text-[13px]">
                <SelectValue placeholder="Pick a branch" />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-72">
                {branches.map((b) => (
                  <SelectItem key={b} value={b} className="font-mono text-[13px]">
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={id}
              value={(value as string) ?? ''}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={invalid || undefined}
              placeholder="main"
              spellCheck={false}
              className="font-mono text-[13px]"
            />
          )
        }
      />

      <FormField
        control={form.control}
        name="workMode"
        label="How cards are worked on"
        render={({ value, onChange }) => <WorkModePicker value={value as WorkMode} onChange={onChange} />}
      />

      {shared ? (
        <div className="flex flex-col gap-5 rounded-xl border bg-fill-faint p-4">
          <FormField
            control={form.control}
            name="sharedBranch"
            label="Shared branch"
            description="Every card works on this branch. It must already exist; each card starts by pulling its latest version."
            render={({ id, value, onChange, invalid }) =>
              branches ? (
                <Select value={(value as string) || BASE} onValueChange={(v) => onChange(v === BASE ? '' : v)}>
                  <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full font-mono text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-72">
                    <SelectItem value={BASE} className="font-mono text-[13px]">
                      {baseBranch || 'main'} <span className="font-sans text-subtle-foreground">· the base branch</span>
                    </SelectItem>
                    {branches
                      .filter((b) => b !== baseBranch)
                      .map((b) => (
                        <SelectItem key={b} value={b} className="font-mono text-[13px]">
                          {b}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={id}
                  value={(value as string) ?? ''}
                  onChange={(e) => onChange(e.target.value)}
                  aria-invalid={invalid || undefined}
                  placeholder={`${baseBranch || 'main'} (the base branch)`}
                  spellCheck={false}
                  className="font-mono text-[13px]"
                />
              )
            }
          />

          <Controller
            control={form.control}
            name="sharedInRepo"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <FieldLabel htmlFor="shared-in-repo">Work directly in my repository folder</FieldLabel>
                    <FieldDescription>
                      {sharedInRepo
                        ? `Your folder always has the latest work. It must be on ${workBranch}, with nothing uncommitted, when a card starts. Ticket2PR never switches its branch.`
                        : `Cards work in a separate folder for ${workBranch}. Pull in your own folder to see their changes.`}
                    </FieldDescription>
                  </div>
                  <Switch id="shared-in-repo" checked={Boolean(field.value)} onCheckedChange={field.onChange} className="mt-0.5" />
                </div>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {currentBranch && sharedInRepo && currentBranch !== workBranch ? (
            <p className="flex gap-2 text-[13px] text-warning-muted">
              <Warning2 className="mt-0.5 size-4 shrink-0" />
              <span>
                Your folder is on <span className="font-mono">{currentBranch}</span> right now. Run{' '}
                <span className="font-mono text-foreground">git switch {workBranch}</span> in it before starting a card.
              </span>
            </p>
          ) : null}
          {currentBranch && !sharedInRepo && currentBranch === workBranch ? (
            <p className="flex gap-2 text-[13px] text-warning-muted">
              <Warning2 className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-mono">{workBranch}</span> is checked out in your folder, and git allows a branch in one folder at a
                time. Work directly in the folder, or pick another branch.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {!(shared && sharedInRepo) ? (
        <FormField
          control={form.control}
          name="setupCommand"
          label="Setup command (optional)"
          placeholder="npm ci"
          description={
            shared
              ? 'Runs once when the separate folder is created, so tests can run there. Leave empty for faster runs.'
              : "Runs once in each new worktree so tests can run (node_modules isn't shared between worktrees). Leave empty for faster runs."
          }
          className="[&_input]:font-mono [&_input]:text-[13px]"
        />
      ) : null}

      <FormField
        control={form.control}
        name="extraInstructions"
        type="textarea"
        label="Instructions for Claude (optional)"
        placeholder="Use the existing Tailwind tokens. Never edit files under /legacy. Write tests with Vitest."
        description="Added to every card's prompt for this project, after Ticket2PR's rules. The repository's CLAUDE.md is read too."
      />
    </div>
  );
}

/** Select can't hold an empty value: this stands for "the base branch". */
const BASE = '__base__';

const MODES: { value: WorkMode; title: string; description: string; icon: typeof Hierarchy }[] = [
  {
    value: 'BRANCH_PER_CARD',
    title: 'A branch per card',
    description: 'Each card gets its own branch and a pull request. Cards can run side by side.',
    icon: Hierarchy,
  },
  {
    value: 'SHARED_BRANCH',
    title: 'One shared branch',
    description: 'Every card works on the same branch, one at a time. Commit and push, no pull request per card.',
    icon: Briefcase,
  },
];

function WorkModePicker({ value, onChange }: { value: WorkMode; onChange: (value: WorkMode) => void }) {
  return (
    <div role="radiogroup" aria-label="How cards are worked on" className="grid gap-2 sm:grid-cols-2">
      {MODES.map((mode) => {
        const selected = value === mode.value;
        const Icon = mode.icon;
        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mode.value)}
            className={cn(
              'flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'border-brand-border bg-brand-subtle' : 'bg-fill-faint hover:bg-fill',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon className={cn('size-4', selected ? 'text-brand' : 'text-muted-foreground')} />
              {mode.title}
            </span>
            <span className="text-[13px] leading-snug text-muted-foreground">{mode.description}</span>
          </button>
        );
      })}
    </div>
  );
}
