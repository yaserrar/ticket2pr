'use client';

import * as React from 'react';
import { Copy, TickCircle } from 'iconsax-react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/utils';

/** Copies `value` to the clipboard with a 2 s check-mark confirmation. */
export function CopyButton({
  value,
  label = 'Copy',
  className,
  size = 'icon-sm',
  variant = 'ghost',
  showLabel = false,
  toastMessage,
}: {
  value: string;
  label?: string;
  className?: string;
  size?: React.ComponentProps<typeof Button>['size'];
  variant?: React.ComponentProps<typeof Button>['variant'];
  showLabel?: boolean;
  toastMessage?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (toastMessage) toast.success(toastMessage);
    } catch {
      toast.error('Copy failed. Select the text and copy it manually.');
    }
  };

  const Icon = copied ? TickCircle : Copy;
  const button = (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? 'sm' : size}
      onClick={onCopy}
      aria-label={copied ? 'Copied' : label}
      className={cn(copied && 'text-success-muted', className)}
    >
      <Icon className="size-4" />
      {showLabel ? <span>{copied ? 'Copied' : label}</span> : null}
    </Button>
  );
  if (showLabel) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{copied ? 'Copied' : label}</TooltipContent>
    </Tooltip>
  );
}
