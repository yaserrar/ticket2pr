import * as React from 'react';
import type { Icon as IconsaxIcon } from 'iconsax-react';
import { cn } from '~/lib/utils';

type IconComponent = IconsaxIcon | React.ComponentType<{ className?: string }>;

/**
 * Every list and page has an empty state. Illustration-free:
 * an icon tile over a faint dot-matrix, a precise title, one calm sentence
 * and at most two actions.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  children,
  size = 'md',
  variant = 'dashed',
  className,
}: {
  icon?: IconComponent;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  children?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dashed' | 'plain' | 'card';
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'relative isolate flex w-full flex-col items-center justify-center overflow-hidden text-center text-balance',
        size === 'sm' && 'gap-3 px-4 py-8',
        size === 'md' && 'gap-4 px-6 py-14',
        size === 'lg' && 'gap-5 px-6 py-20',
        variant === 'dashed' && 'rounded-lg border border-dashed border-border-strong',
        variant === 'card' && 'rounded-lg border bg-card shadow-xs',
        className,
      )}
    >
      <div aria-hidden className="bg-grid-lines mask-radial pointer-events-none absolute inset-0 -z-10" />
      {Icon ? (
        <div
          className={cn(
            'flex items-center justify-center rounded-lg border bg-fill text-muted-foreground shadow-keycap',
            size === 'sm' ? 'size-9' : 'size-11',
          )}
        >
          <Icon className={size === 'sm' ? 'size-4' : 'size-5'} />
        </div>
      ) : null}
      <div className="flex max-w-sm flex-col items-center gap-1.5">
        <h3 className={cn('font-heading font-medium tracking-tight text-foreground', size === 'sm' ? 'text-sm' : 'text-base')}>
          {title}
        </h3>
        {description ? <div className="text-sm leading-relaxed text-muted-foreground">{description}</div> : null}
      </div>
      {children}
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
