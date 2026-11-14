'use client';

import * as React from 'react';
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';

/**
 * A button that, when disabled, says why in a tooltip (spec §11.6:
 * "Commit your changes before pushing"). Disabled buttons don't receive
 * pointer events, so the tooltip hangs on a wrapper.
 */
export function ReasonButton({
  reason,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { reason?: string | null }) {
  if (!reason) return <Button {...props}>{children}</Button>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Button {...props} disabled aria-disabled>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}
