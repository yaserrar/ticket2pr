import { cn } from '~/lib/utils';

/**
 * Raycast's signature artwork: grainy diagonal red light beams fading into
 * the near-black page. Decorative and static (nothing to reduce for motion).
 */
export function LightBeams({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute -top-[30%] left-1/2 h-[90%] w-[150%] -translate-x-1/2 bg-beams opacity-70 blur-[14px] [mask-image:radial-gradient(ellipse_50%_60%_at_50%_45%,black,transparent_75%)]" />
      <div className="absolute -top-[20%] left-1/2 h-[60%] w-[70%] -translate-x-1/2 rounded-full bg-brand/25 blur-[120px]" />
      <div className="absolute inset-0 bg-noise opacity-70 mix-blend-overlay" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
