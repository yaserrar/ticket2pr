'use client';

import type { UseFormReturn } from 'react-hook-form';
import { FormField } from '~/components/forms/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import type { ProjectInput } from '~/schemas/project';
import type { TrelloListDto } from '~/types/trello';

/** Select can't hold null: this stands for "don't move the card". */
const NONE = '__none__';

const FIELDS = [
  { name: 'trelloInProgressListId', label: 'In progress', hint: 'When Claude starts' },
  { name: 'trelloReviewListId', label: 'Review', hint: 'When the work is ready for you' },
  { name: 'trelloNeedsInfoListId', label: 'Needs info', hint: 'When you ask the client questions' },
  { name: 'trelloDoneListId', label: 'Done', hint: 'When you push or mark it done' },
] as const;

/**
 * Trello write-back (spec §6.5): the list each card moves to when its status
 * changes here, so the client sees progress on their board. All optional.
 */
export function WriteBackFields({
  form,
  lists,
  disabled,
}: {
  form: UseFormReturn<ProjectInput>;
  lists: TrelloListDto[] | undefined;
  disabled: boolean;
}) {
  const sourceListId = form.watch('trelloSourceListId');
  const options = (lists ?? []).filter((l) => l.id !== sourceListId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium text-foreground">Move cards on Trello (optional)</h4>
        <p className="text-[13px] text-muted-foreground">
          When a card changes status here, it moves to this list on Trello, so the client sees progress. Discarded cards go back to the
          source list.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <FormField
            key={f.name}
            control={form.control}
            name={f.name}
            label={f.label}
            description={f.hint}
            render={({ id, value, onChange, invalid }) => (
              <Select value={(value as string | null) ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
                <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
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
        ))}
      </div>
    </div>
  );
}
