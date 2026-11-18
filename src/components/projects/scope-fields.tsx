'use client';

import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { FormField } from '~/components/forms/form-field';
import { Button } from '~/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';
import { DEFAULT_SCOPE_RULES } from '~/lib/scope';
import type { ProjectInput } from '~/schemas/project';
import type { TrelloListDto } from '~/types/trello';

/** Select can't hold null: this stands for "don't move the card". */
const NONE = '__none__';

/**
 * Scope check: for projects in maintenance. Claude sorts each new card into
 * in scope (bugs, small changes) or out of scope (new work that needs a new
 * agreement with the client); out-of-scope cards wait in their own list.
 */
export function ScopeFields({
  form,
  lists,
  disabled,
}: {
  form: UseFormReturn<ProjectInput>;
  lists: TrelloListDto[] | undefined;
  disabled: boolean;
}) {
  const enabled = useWatch({ control: form.control, name: 'scopeCheck' });
  const rules = useWatch({ control: form.control, name: 'scopeRules' });
  const sourceListId = useWatch({ control: form.control, name: 'trelloSourceListId' });
  const options = (lists ?? []).filter((l) => l.id !== sourceListId);

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={form.control}
        name="scopeCheck"
        render={({ field }) => (
          <Field>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="scope-check">Check the scope of new cards</FieldLabel>
                <FieldDescription>
                  For projects in maintenance. Claude reads each new card (and the repository, read-only) and says whether the
                  agreement covers it. Cards that look like new work don’t start without you, and can wait in their own list for
                  the project manager. Each check uses a little of your Claude plan.
                </FieldDescription>
              </div>
              <Switch id="scope-check" checked={Boolean(field.value)} onCheckedChange={field.onChange} className="mt-0.5" />
            </div>
          </Field>
        )}
      />

      {enabled ? (
        <>
          <FormField
            control={form.control}
            name="scopeRules"
            type="textarea"
            label="What maintenance covers"
            labelAside={
              rules.trim() !== DEFAULT_SCOPE_RULES ? (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0"
                  onClick={() => form.setValue('scopeRules', DEFAULT_SCOPE_RULES, { shouldDirty: true })}
                >
                  Use the default
                </Button>
              ) : null
            }
            description="Write it like your contract: what's included, what counts as new work. Claude follows it to the letter. Changing it checks the new cards again."
            className="[&_textarea]:min-h-56 [&_textarea]:font-mono [&_textarea]:text-[12.5px]"
          />

          <FormField
            control={form.control}
            name="trelloOutOfScopeListId"
            label="Out-of-scope list on Trello"
            description="Cards you set aside move here, for the project manager to discuss with the client. Moving one back to the source list on Trello brings it back to New."
            render={({ id, value, onChange, invalid }) => (
              <Select value={(value as string | null) ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
                <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full sm:w-1/2">
                  <SelectValue>
                    {value ? (lists?.find((l) => l.id === value)?.name ?? 'List not found') : <span className="text-subtle-foreground">Don’t move</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  <SelectItem value={NONE}>Don’t move</SelectItem>
                  {options.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </>
      ) : null}
    </div>
  );
}
