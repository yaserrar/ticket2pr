'use client';

import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { FormField } from '~/components/forms/form-field';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { Switch } from '~/components/ui/switch';
import type { ProjectInput } from '~/schemas/project';

/**
 * Review: the risk flag's extra sensitive paths, and screenshots of UI
 * changes for the client (the app is started in the card's folder after
 * each run; public pages only).
 */
export function ReviewFields({ form }: { form: UseFormReturn<ProjectInput> }) {
  const preview = useWatch({ control: form.control, name: 'previewEnabled' });

  return (
    <div className="flex flex-col gap-5">
      <FormField
        control={form.control}
        name="riskPaths"
        type="textarea"
        label="Sensitive paths (optional)"
        placeholder={'src/server/billing/**\nsrc/lib/permissions.ts\n*.sql'}
        description="Changes to these files are high risk and need a careful review before pushing, like payments, login, migrations and secrets (those are built in). One path or glob per line."
        className="[&_textarea]:min-h-20 [&_textarea]:font-mono [&_textarea]:text-[12.5px]"
      />

      <Controller
        control={form.control}
        name="previewEnabled"
        render={({ field }) => (
          <Field>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="preview-enabled">Screenshots for the client</FieldLabel>
                <FieldDescription>
                  When Claude changes something visible, Ticket2PR starts the app in the card’s folder, takes a screenshot of the pages
                  Claude names, and you can attach them to the client update on Trello. Public pages only (no login). Uses Google Chrome.
                </FieldDescription>
              </div>
              <Switch id="preview-enabled" checked={Boolean(field.value)} onCheckedChange={field.onChange} className="mt-0.5" />
            </div>
          </Field>
        )}
      />

      {preview ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="previewCommand"
            label="Start command"
            placeholder="npm run dev -- --port $PORT"
            description="Run in the card’s folder after the setup command. $PORT is a free port; $REPO_PATH is your repository, e.g. cp $REPO_PATH/.env . && npm run dev -- --port $PORT"
            className="[&_input]:font-mono [&_input]:text-[12.5px]"
          />
          <FormField
            control={form.control}
            name="previewUrl"
            label="App address (optional)"
            placeholder="http://localhost:$PORT"
            description="Where the app answers once started. Local addresses only."
            className="[&_input]:font-mono [&_input]:text-[12.5px]"
          />
        </div>
      ) : null}
    </div>
  );
}
