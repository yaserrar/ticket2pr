'use client';

import * as React from 'react';
import { Controller, useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import { Add, MagicStar, Trash } from 'iconsax-react';
import { Button } from '~/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';
import { useSuggestChecks } from '~/hooks/projects';
import { getErrorMessage } from '~/lib/api-errors';
import { DEFAULT_CHECK_TIMEOUT_MIN, MAX_CHECKS, MAX_FIX_ROUNDS, mergeChecks } from '~/lib/checks';
import { plural } from '~/lib/format';
import type { ProjectInput } from '~/schemas/project';

const TIMEOUTS = [1, 2, 5, 10, 15, 30, 60] as const;
const ROUNDS = Array.from({ length: MAX_FIX_ROUNDS }, (_, i) => i + 1);

/**
 * Checks before review: the project's own commands (typecheck, lint,
 * tests…) that Ticket2PR runs in the card's folder after each run. Turning
 * them on fills the list from the repository; every command stays editable.
 */
export function ChecksFields({ form }: { form: UseFormReturn<ProjectInput> }) {
  const enabled = useWatch({ control: form.control, name: 'checksEnabled' });
  const autoFix = useWatch({ control: form.control, name: 'checksAutoFix' });
  const repoPath = useWatch({ control: form.control, name: 'repoPath' });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'checks' });
  const suggest = useSuggestChecks();
  const [note, setNote] = React.useState<{ tone: 'muted' | 'error'; text: string } | null>(null);

  const fill = React.useCallback(
    async ({ quiet = false } = {}) => {
      if (!repoPath.trim()) {
        if (!quiet) setNote({ tone: 'muted', text: 'Add the repository path above first, so Ticket2PR can look for checks.' });
        return;
      }
      setNote(null);
      try {
        const { checks } = await suggest.mutateAsync(repoPath);
        const current = form.getValues('checks');
        const merged = mergeChecks(current, checks);
        replace(merged);
        const added = merged.length - current.length;
        setNote({
          tone: 'muted',
          text: added
            ? `Found ${plural(added, 'check')} in the repository. Review the commands before saving.`
            : checks.length
              ? 'Every check found in the repository is already in the list.'
              : 'No typecheck, lint or test script found in package.json, a Makefile or pyproject.toml. Add the commands yourself.',
        });
      } catch (error) {
        setNote({ tone: 'error', text: getErrorMessage(error) });
      }
    },
    [repoPath, suggest, form, replace],
  );

  const listError = form.formState.errors.checks?.root?.message ?? form.formState.errors.checks?.message;

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={form.control}
        name="checksEnabled"
        render={({ field }) => (
          <Field>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="checks-enabled">Check the work before review</FieldLabel>
                <FieldDescription>
                  After each run, Ticket2PR runs these commands in the card’s folder, with the same setup as the run. A card reaches
                  Review once they pass, or flagged “Checks failing”. Commands come from here only, never from a card.
                </FieldDescription>
              </div>
              <Switch
                id="checks-enabled"
                checked={Boolean(field.value)}
                onCheckedChange={(on) => {
                  field.onChange(on);
                  if (on && !form.getValues('checks').length) void fill({ quiet: true });
                }}
                className="mt-0.5"
              />
            </div>
          </Field>
        )}
      />

      {enabled ? (
        <div className="flex flex-col gap-4 rounded-xl border bg-fill-faint p-4">
          {fields.length ? (
            <div className="flex flex-col gap-3">
              <div aria-hidden className="hidden gap-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[9rem_minmax(0,1fr)_7.5rem_2rem]">
                <span>Name</span>
                <span>Command</span>
                <span>Timeout</span>
              </div>
              <ul className="flex flex-col gap-3" aria-label="Checks">
                {fields.map((item, index) => (
                  <CheckRow key={item.id} form={form} index={index} onRemove={() => remove(index)} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No checks yet. Find them in the repository, or add one.</p>
          )}

          {listError ? <p className="text-sm text-danger-muted">{listError}</p> : null}
          {note ? <p className={note.tone === 'error' ? 'text-sm text-danger-muted' : 'text-[13px] text-muted-foreground'}>{note.text}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" loading={suggest.isPending} onClick={() => void fill()}>
              <MagicStar className="size-4" />
              Find in repository
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={fields.length >= MAX_CHECKS}
              onClick={() => append({ name: '', command: '', timeoutMin: DEFAULT_CHECK_TIMEOUT_MIN }, { shouldFocus: true })}
            >
              <Add className="size-4" />
              Add check
            </Button>
          </div>

          <div className="flex flex-col gap-4 border-t pt-4">
            <Controller
              control={form.control}
              name="checksAutoFix"
              render={({ field }) => (
                <Field>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <FieldLabel htmlFor="checks-auto-fix">Let Claude fix failing checks</FieldLabel>
                      <FieldDescription>
                        Claude continues the same session with the end of the failing output and is asked to fix the cause, never to turn
                        tests or lint rules off. Then the checks run again.
                      </FieldDescription>
                    </div>
                    <Switch id="checks-auto-fix" checked={Boolean(field.value)} onCheckedChange={field.onChange} className="mt-0.5" />
                  </div>
                </Field>
              )}
            />
            {autoFix ? (
              <Controller
                control={form.control}
                name="checksMaxFixRounds"
                render={({ field }) => (
                  <Field orientation="horizontal" className="justify-between">
                    <div className="flex flex-col gap-1">
                      <FieldLabel htmlFor="checks-rounds">Fix rounds</FieldLabel>
                      <FieldDescription>Each round uses a little of your Claude plan.</FieldDescription>
                    </div>
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                      <SelectTrigger id="checks-rounds" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROUNDS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {plural(n, 'round')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CheckRow({ form, index, onRemove }: { form: UseFormReturn<ProjectInput>; index: number; onRemove: () => void }) {
  const errors = form.formState.errors.checks?.[index];
  const name = useWatch({ control: form.control, name: `checks.${index}.name` });
  const message = errors?.name?.message ?? errors?.command?.message ?? errors?.timeoutMin?.message;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_6rem_2rem] gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_7.5rem_2rem]">
        <Input
          {...form.register(`checks.${index}.name`)}
          aria-label={`Check ${index + 1} name`}
          aria-invalid={errors?.name ? true : undefined}
          placeholder="Tests"
          autoComplete="off"
          className="col-span-1"
        />
        <Input
          {...form.register(`checks.${index}.command`)}
          aria-label={`${name || `Check ${index + 1}`} command`}
          aria-invalid={errors?.command ? true : undefined}
          placeholder="npm test"
          spellCheck={false}
          autoComplete="off"
          className="order-last col-span-3 font-mono text-[12.5px] sm:order-none sm:col-span-1"
        />
        <Controller
          control={form.control}
          name={`checks.${index}.timeoutMin`}
          render={({ field }) => {
            const options = TIMEOUTS.includes(field.value as (typeof TIMEOUTS)[number]) ? TIMEOUTS : [...TIMEOUTS, field.value].sort((a, b) => a - b);
            return (
              <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger aria-label={`${name || `Check ${index + 1}`} timeout`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }}
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${name || `check ${index + 1}`}`} className="self-center">
          <Trash className="size-4" />
        </Button>
      </div>
      <FieldError errors={message ? [{ message }] : []} />
    </li>
  );
}
