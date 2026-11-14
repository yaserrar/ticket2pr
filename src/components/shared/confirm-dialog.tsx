'use client';

import * as React from 'react';
import { create } from 'zustand';
import { Danger } from 'iconsax-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { getErrorMessage } from '~/lib/api-errors';
import { cn } from '~/lib/utils';

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon. */
  destructive?: boolean;
  /** Typed confirmation: the user must type this exact text (e.g. the workspace name). */
  confirmText?: string;
};

/**
 * Controlled confirmation dialog. `onConfirm` may be async: the button shows a
 * spinner, errors are shown inline, and the dialog closes on success.
 *
 *   <ConfirmDialog open={open} onOpenChange={setOpen} title="Delete board?"
 *     destructive confirmText={board.name} onConfirm={() => del.mutateAsync(board.id)} />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  ...rest
}: ConfirmOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => unknown | Promise<unknown>;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        {/* The body mounts with the content, so its state resets every time the dialog opens. */}
        <ConfirmDialogBody {...rest} onPendingChange={setPending} onDone={() => onOpenChange(false)} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmDialogBody({
  onConfirm,
  onPendingChange,
  onDone,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  confirmText,
}: ConfirmOptions & {
  onConfirm: () => unknown | Promise<unknown>;
  onPendingChange: (pending: boolean) => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();
  const matches = !confirmText || typed.trim() === confirmText;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setPending(true);
    onPendingChange(true);
    setError(null);
    try {
      await onConfirm();
      onPendingChange(false);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(false);
      onPendingChange(false);
    }
  };

  return (
    <form onSubmit={handleConfirm} className="grid grid-cols-1 gap-5">
      {/* Titles carry emails, hosts and keys with no break point: let them wrap instead of widening the dialog. */}
      <AlertDialogHeader className="wrap-anywhere sm:place-items-start sm:text-left">
        {destructive ? (
          <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-danger-subtle text-danger-muted">
            <Danger className="size-5" />
          </div>
        ) : null}
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
      </AlertDialogHeader>
      {confirmText ? (
        <div className="grid gap-2">
          <Label htmlFor={inputId} className="flex-wrap gap-y-1 text-sm leading-snug font-normal text-muted-foreground">
            Type <span className="font-mono font-medium wrap-anywhere text-foreground">{confirmText}</span> to confirm
          </Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
            spellCheck={false}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-muted">
          {error}
        </p>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
        <Button
          type="submit"
          variant={destructive ? 'destructive' : 'default'}
          disabled={!matches}
          loading={pending}
          className={cn(destructive && 'bg-danger text-danger-foreground hover:bg-danger/90 dark:bg-danger dark:hover:bg-danger/90')}
        >
          {confirmLabel}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

// ─── Imperative API: const ok = await confirm({ title, destructive: true }) ────

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
const useConfirmStore = create<{ pending: Pending | null; set: (p: Pending | null) => void }>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
}));

/** Promise-based confirmation. Requires <ConfirmDialogHost/> (mounted by Providers). */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...options, resolve }));
}

export const useConfirm = () => confirm;

export function ConfirmDialogHost() {
  const pending = useConfirmStore((s) => s.pending);
  const set = useConfirmStore((s) => s.set);
  const resolved = React.useRef<Pending | null>(null);
  if (!pending) return null;
  const { resolve, ...options } = pending;
  return (
    <ConfirmDialog
      {...options}
      open
      onOpenChange={(open) => {
        if (!open) {
          if (resolved.current !== pending) resolve(false);
          set(null);
        }
      }}
      onConfirm={() => {
        resolved.current = pending;
        resolve(true);
      }}
    />
  );
}
