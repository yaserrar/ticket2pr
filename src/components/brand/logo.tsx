import { cn } from '~/lib/utils';

/**
 * Ticket2PR mark: a red squircle crossed by diagonal light slats (a nod to
 * Raycast's beams) carrying a ticket-to-branch arrow.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-6 shrink-0', className)}>
      <defs>
        <linearGradient id="t2p-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-hover)" />
          <stop offset="1" stopColor="var(--brand)" />
        </linearGradient>
        <clipPath id="t2p-clip">
          <rect width="32" height="32" rx="8" />
        </clipPath>
      </defs>
      <g clipPath="url(#t2p-clip)">
        <rect width="32" height="32" fill="url(#t2p-fill)" />
        <path d="M-4 30 30 -4h5L1 30Z M6 36 40 2v5L11 36Z" fill="white" opacity="0.14" />
      </g>
      <path
        d="M10 11.5h7.5M10 16h5M10 20.5h7.5M20 9.5v13m0 0-3-3m3 3 3-3"
        fill="none"
        stroke="var(--brand-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-[14px] font-semibold tracking-tight text-foreground">Ticket2PR</span>
    </span>
  );
}
