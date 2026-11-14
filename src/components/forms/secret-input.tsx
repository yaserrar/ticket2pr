'use client';

import * as React from 'react';
import { Eye, EyeSlash } from 'iconsax-react';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

/** Secret input (API key, token) with a show/hide toggle. Never autofilled by password managers. */
export function SecretInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        className={cn('pr-10 font-mono text-[13px]', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide value' : 'Show value'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {visible ? <EyeSlash className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
