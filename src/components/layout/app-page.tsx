import * as React from 'react';
import { cn } from '~/lib/utils';

/** Padded page container for form pages (the board canvas opts out). */
export function AppPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-10', className)}>{children}</div>;
}

/** Page title in the Raycast two-tone style: a white claim, then a gray line. */
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      {eyebrow ? <p className="eyebrow text-brand-muted">{eyebrow}</p> : null}
      <h1 className="text-2xl tracking-tight">{title}</h1>
      {description ? <p className="text-[15px] font-medium text-muted-foreground">{description}</p> : null}
    </header>
  );
}

/** A settings panel: faint fill, hairline border, title + one calm sentence. */
export function SettingsSection({
  title,
  description,
  aside,
  tone = 'default',
  children,
}: {
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-5 rounded-2xl border bg-fill-faint p-5 sm:p-6',
        tone === 'danger' && 'border-danger/20',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] tracking-tight">{title}</h2>
          {description ? <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
