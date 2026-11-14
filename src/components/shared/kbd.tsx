import * as React from 'react';
import { Kbd as KbdBase, KbdGroup } from '~/components/ui/kbd';
import { cn } from '~/lib/utils';

/** A keyboard key. */
export function Kbd({ className, ...props }: React.ComponentProps<typeof KbdBase>) {
  return <KbdBase className={cn('font-mono text-[11px]', className)} {...props} />;
}

/**
 * A shortcut: <Shortcut keys={['mod', 'K']} />. `mod` renders ⌘ on macOS and Ctrl elsewhere
 * (<html data-platform> is set by <Providers/>).
 */
export function Shortcut({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <KbdGroup className={className}>
      {keys.map((k) => (
        <Kbd key={k}>{k === 'mod' ? <ModKey /> : k}</Kbd>
      ))}
    </KbdGroup>
  );
}

function ModKey() {
  return (
    <>
      <span className="[[data-platform=other]_&]:hidden">⌘</span>
      <span className="hidden [[data-platform=other]_&]:inline">Ctrl</span>
    </>
  );
}
