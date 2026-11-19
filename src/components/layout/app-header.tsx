'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SearchNormal1, Setting2 } from 'iconsax-react';
import { LogoMark } from '~/components/brand/logo';
import { Shortcut } from '~/components/shared/kbd';
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { ThemeToggle } from './theme-toggle';
import { useUiStore } from '~/store/ui.store';
import { ProjectSwitcher } from './project-switcher';

/**
 * Floating glass bar (Raycast nav): logo · project switcher on the left, the
 * search bar in the middle (opens ⌘K), settings on the right.
 */
export function AppHeader() {
  const params = useParams<{ projectId?: string }>();
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);

  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <div className="glass flex h-12 items-center gap-1.5 rounded-xl border px-2 shadow-md">
        <Link
          href="/"
          aria-label="Ticket2PR home"
          className="flex items-center gap-2 rounded-md p-1 outline-none hover:bg-fill focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LogoMark />
        </Link>
        <span aria-hidden className="text-subtle-foreground/60 select-none">
          /
        </span>
        <ProjectSwitcher currentId={params.projectId} />

        <div className="flex min-w-0 flex-1 justify-center px-2">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="group flex h-8 w-full max-w-md items-center gap-2 rounded-lg border bg-fill px-2.5 text-left text-[13px] text-subtle-foreground transition-colors outline-none hover:border-border-strong hover:bg-fill-raised focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SearchNormal1 className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Search cards and actions…</span>
            <Shortcut keys={['mod', 'K']} className="hidden sm:inline-flex" />
          </button>
        </div>

        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/settings" aria-label="Settings">
                <Setting2 className="size-[18px]" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
