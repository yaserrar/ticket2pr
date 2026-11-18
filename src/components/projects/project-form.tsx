'use client';

import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trello } from 'iconsax-react';
import { FormError, FormField } from '~/components/forms/form-field';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { useCreateProject, useUpdateProject } from '~/hooks/projects';
import { useTrelloBoards, useTrelloLists } from '~/hooks/trello';
import { applyFieldErrors, getErrorMessage } from '~/lib/api-errors';
import { projectBody, type ProjectInput } from '~/schemas/project';
import type { ProjectDto } from '~/types/project';
import { isApiError } from '~/lib/api-errors';
import { RepoFields } from './repo-fields';
import { WriteBackFields } from './write-back-fields';
import { ScopeFields } from './scope-fields';
import { ReviewFields } from './review-fields';
import { DEFAULT_SCOPE_RULES } from '~/lib/scope';

/**
 * Project form (spec §11.2): Trello board → source list → name, then the
 * repository (path, base branch, how cards are worked on, setup command).
 */
export function ProjectForm({
  project,
  submitLabel,
  onSaved,
  secondaryAction,
}: {
  project?: ProjectDto;
  submitLabel?: string;
  onSaved: (project: ProjectDto) => void;
  secondaryAction?: React.ReactNode;
}) {
  const form = useForm<ProjectInput>({
    resolver: zodResolver(projectBody),
    defaultValues: {
      name: project?.name ?? '',
      trelloBoardId: project?.trelloBoardId ?? '',
      trelloSourceListId: project?.trelloSourceListId ?? '',
      repoPath: project?.repoPath ?? '',
      baseBranch: project?.baseBranch ?? 'main',
      setupCommand: project?.setupCommand ?? '',
      extraInstructions: project?.extraInstructions ?? '',
      workMode: project?.workMode ?? 'BRANCH_PER_CARD',
      sharedBranch: project?.sharedBranch ?? '',
      sharedInRepo: project?.sharedInRepo ?? true,
      trelloInProgressListId: project?.trelloInProgressListId ?? null,
      trelloReviewListId: project?.trelloReviewListId ?? null,
      trelloDoneListId: project?.trelloDoneListId ?? null,
      trelloNeedsInfoListId: project?.trelloNeedsInfoListId ?? null,
      scopeCheck: project?.scopeCheck ?? false,
      scopeRules: project?.scopeRules ?? DEFAULT_SCOPE_RULES,
      trelloOutOfScopeListId: project?.trelloOutOfScopeListId ?? null,
      riskPaths: project?.riskPaths ?? '',
      previewEnabled: project?.previewEnabled ?? false,
      previewCommand: project?.previewCommand ?? '',
      previewUrl: project?.previewUrl ?? '',
    },
  });
  const boardId = useWatch({ control: form.control, name: 'trelloBoardId' });
  const boards = useTrelloBoards();
  const lists = useTrelloLists(boardId || undefined);
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const mutation = project ? update : create;
  const [formError, setFormError] = React.useState<string | null>(null);

  const onBoardChange = (nextId: string, onChange: (v: unknown) => void) => {
    const previous = boards.data?.find((b) => b.id === boardId);
    const next = boards.data?.find((b) => b.id === nextId);
    onChange(nextId);
    form.setValue('trelloSourceListId', '', { shouldValidate: false });
    for (const field of ['trelloInProgressListId', 'trelloReviewListId', 'trelloDoneListId', 'trelloNeedsInfoListId', 'trelloOutOfScopeListId'] as const) {
      form.setValue(field, null);
    }
    // Keep a custom name; otherwise follow the board name.
    const name = form.getValues('name').trim();
    if (next && (!name || name === previous?.name)) form.setValue('name', next.name, { shouldValidate: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      onSaved(await mutation.mutateAsync(values));
    } catch (error) {
      if (applyFieldErrors(error, form.setError)) return;
      // Repository errors point at their field.
      const field = isApiError(error) ? (error.details as { field?: string } | undefined)?.field : undefined;
      if (field && field in form.getValues()) {
        form.setError(field as keyof ProjectInput, { type: 'server', message: getErrorMessage(error) });
      } else setFormError(getErrorMessage(error));
    }
  });

  const pickerError = boards.error ?? lists.error;

  // While Trello answers, show the names stored on the project instead of a blank picker.
  const boardName = (id: string) =>
    boards.data?.find((b) => b.id === id)?.name ?? (id === project?.trelloBoardId ? project.trelloBoardName : undefined);
  const listName = (id: string) =>
    lists.data?.find((l) => l.id === id)?.name ??
    (id === project?.trelloSourceListId ? project.trelloSourceListName : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <h3 className="eyebrow font-medium text-subtle-foreground">Trello</h3>
      <FormField
        control={form.control}
        name="trelloBoardId"
        label="Trello board"
        description="The board your client adds cards to."
        render={({ id, value, onChange, invalid }) => (
          <Select value={(value as string) ?? ''} onValueChange={(v) => onBoardChange(v, onChange)} disabled={boards.isPending}>
            <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
              <Trello className="size-4 text-info" aria-hidden />
              <SelectValue placeholder={boards.isPending ? 'Loading boards…' : 'Pick a board'}>
                {value ? boardName(value as string) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {boards.data?.length ? (
                boards.data.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))
              ) : (
                <div className="px-2 py-3 text-sm text-muted-foreground">No open boards on this Trello account.</div>
              )}
            </SelectContent>
          </Select>
        )}
      />

      <FormField
        control={form.control}
        name="trelloSourceListId"
        label="Source list"
        description="Only new cards from this list are pulled in. Cards already tracked stay on the board."
        render={({ id, value, onChange, invalid }) => (
          <Select
            key={boardId}
            value={(value as string) ?? ''}
            onValueChange={onChange}
            disabled={!boardId || lists.isPending}
          >
            <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
              <SelectValue
                placeholder={!boardId ? 'Pick a board first' : lists.isPending ? 'Loading lists…' : 'Pick a list'}
              >
                {value ? listName(value as string) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {lists.data?.length ? (
                lists.data.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))
              ) : (
                <div className="px-2 py-3 text-sm text-muted-foreground">This board has no open lists.</div>
              )}
            </SelectContent>
          </Select>
        )}
      />

      <FormField control={form.control} name="name" label="Project name" placeholder="Client website" />

      <WriteBackFields form={form} lists={lists.data} disabled={!boardId || lists.isPending} />

      <div className="flex flex-col gap-1 border-t pt-5">
        <h3 className="eyebrow font-medium text-subtle-foreground">Scope</h3>
      </div>
      <ScopeFields form={form} lists={lists.data} disabled={!boardId || lists.isPending} />

      <div className="flex flex-col gap-1 border-t pt-5">
        <h3 className="eyebrow font-medium text-subtle-foreground">Repository</h3>
        <p className="text-[13px] text-muted-foreground">Needed to start work on cards. You can add it later.</p>
      </div>
      <RepoFields form={form} initialPath={project?.repoPath} />

      <div className="flex flex-col gap-1 border-t pt-5">
        <h3 className="eyebrow font-medium text-subtle-foreground">Review</h3>
      </div>
      <ReviewFields form={form} />

      <FormError message={pickerError ? getErrorMessage(pickerError) : null} />
      <FormError message={formError} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={mutation.isPending}>
          {submitLabel ?? (project ? 'Save changes' : 'Create project')}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
}
