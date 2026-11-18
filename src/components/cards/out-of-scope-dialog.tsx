'use client';

import * as React from 'react';
import { InfoCircle } from 'iconsax-react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import { useOutOfScope } from '~/hooks/cards';
import { useBoard } from '~/hooks/projects';
import { useTrelloLists } from '~/hooks/trello';
import { getErrorMessage } from '~/lib/api-errors';
import type { CardDto } from '~/types/card';

const DEFAULT_NOTE =
  'Thank you for your request. It goes beyond the maintenance we currently provide, so it needs a separate agreement. Our project manager will contact you to discuss it.';

/**
 * New → Out of scope. The card waits for a new agreement with the client:
 * it moves to the project's out-of-scope list on Trello (the project manager
 * watches it), and a note can be posted on the card for the client.
 */
export function OutOfScopeDialog({ card, onOpenChange }: { card: CardDto | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(card)} onOpenChange={onOpenChange}>
      <DialogContent className="window rounded-2xl! sm:max-w-lg">
        {card ? <OutOfScopeForm card={card} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function OutOfScopeForm({ card, onDone }: { card: CardDto; onDone: () => void }) {
  const board = useBoard(card.projectId);
  const project = board.data?.project;
  const lists = useTrelloLists(project?.trelloOutOfScopeListId ? project.trelloBoardId : undefined);
  const listName = project?.trelloOutOfScopeListId ? lists.data?.find((l) => l.id === project.trelloOutOfScopeListId)?.name : null;
  const mutation = useOutOfScope(card.projectId, card.id);
  const [post, setPost] = React.useState(!card.removedFromTrello);
  const [note, setNote] = React.useState(card.scope.clientNote ?? DEFAULT_NOTE);
  const [error, setError] = React.useState<string | null>(null);
  const noteId = React.useId();
  const postId = React.useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (post && !note.trim()) return setError('Write the note, or turn off posting it.');
    setError(null);
    try {
      await mutation.mutateAsync({ note: post ? note.trim() : null });
      toast.success('Moved to Out of scope', {
        description: post ? 'The note is on the Trello card.' : 'Nothing was posted on Trello.',
      });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Set aside as out of scope</DialogTitle>
        <DialogDescription>
          “{card.title}” won’t be worked on until the client agrees to the new work. Move it back to New when they do.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={postId}>Post a note for the client on Trello</FieldLabel>
            <FieldDescription>
              {card.removedFromTrello ? 'This card was removed from Trello.' : 'So they know why nothing is happening yet.'}
            </FieldDescription>
          </div>
          <Switch id={postId} checked={post} onCheckedChange={setPost} disabled={card.removedFromTrello} className="mt-0.5" />
        </div>
      </Field>

      {post ? (
        <Field data-invalid={error && !note.trim() ? true : undefined}>
          <FieldLabel htmlFor={noteId}>Note</FieldLabel>
          <Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={5000} />
          <FieldDescription>
            {card.scope.clientNote ? 'Drafted by Claude in the language of the card. Edit it as you like.' : 'Edit it as you like.'}
          </FieldDescription>
        </Field>
      ) : null}

      <p className="flex gap-2 text-[13px] text-muted-foreground">
        <InfoCircle className="mt-0.5 size-4 shrink-0" />
        <span>
          {project?.trelloOutOfScopeListId
            ? `The card moves to ${listName ? `“${listName}”` : 'your out-of-scope list'} on Trello, where your project manager can pick it up.`
            : 'The card stays in its Trello list. To tell your project manager, choose an out-of-scope list in Project settings.'}
        </span>
      </p>

      <FieldError>{error}</FieldError>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {post ? 'Post note and set aside' : 'Set aside'}
        </Button>
      </DialogFooter>
    </form>
  );
}
