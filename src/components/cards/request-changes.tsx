'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { FormField } from '~/components/forms/form-field';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { useCreateRun } from '~/hooks/cards';
import type { CardDto } from '~/types/card';

const schema = z.object({ followUpText: z.string().trim().min(1, 'Describe the changes you want').max(4000) });

/**
 * "Request changes" (spec §9.2): sends the reviewer's text as a follow-up
 * run that resumes the agent session, and moves the card back to In progress.
 */
export function RequestChangesForm({
  card,
  onDone,
  autoFocus,
}: {
  card: CardDto;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { followUpText: '' } });
  const createRun = useCreateRun(card.projectId, card.id);

  const onSubmit = form.handleSubmit((values) =>
    createRun.mutate(
      { kind: 'FOLLOW_UP', followUpText: values.followUpText },
      {
        onSuccess: () => {
          form.reset();
          toast.success('Changes requested. The agent is back on it.');
          onDone?.();
        },
      },
    ),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <FormField
        control={form.control}
        name="followUpText"
        type="textarea"
        label="What should change?"
        placeholder="The button should use the brand red, and keep the old link as a redirect."
        autoFocus={autoFocus}
      />
      <div>
        <Button type="submit" size="sm" loading={createRun.isPending}>
          Request changes
        </Button>
      </div>
    </form>
  );
}

export function RequestChangesDialog({ card, onOpenChange }: { card: CardDto | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(card)} onOpenChange={onOpenChange}>
      <DialogContent className="window rounded-2xl! sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>
            {card ? `“${card.title}” goes back to In progress and the agent continues from where it stopped.` : null}
          </DialogDescription>
        </DialogHeader>
        {card ? <RequestChangesForm card={card} autoFocus onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
