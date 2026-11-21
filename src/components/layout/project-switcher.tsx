'use client';

import Link from 'next/link';
import { AddSquare, ArrowDown2, Kanban, Setting4, TickCircle, Timer1 } from 'iconsax-react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Skeleton } from '~/components/ui/skeleton';
import { useProjects } from '~/hooks/projects';

export function ProjectSwitcher({ currentId }: { currentId?: string }) {
  const { data: projects, isPending } = useProjects();
  const current = projects?.find((p) => p.id === currentId);

  if (isPending) return <Skeleton className="h-6 w-28 rounded-md" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-56 gap-1.5 px-2 text-foreground">
          <span className="truncate">{current?.name ?? 'Projects'}</span>
          <ArrowDown2 className="size-3.5 text-subtle-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="eyebrow text-subtle-foreground">Projects</DropdownMenuLabel>
        {projects?.map((p) => (
          <DropdownMenuItem key={p.id} asChild>
            <Link href={`/projects/${p.id}`} className="flex items-center gap-2">
              <Kanban className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}</span>
                <span className="block truncate text-xs text-subtle-foreground">
                  {p.trelloBoardName} · {p.trelloSourceListName}
                </span>
              </span>
              {p.id === currentId ? <TickCircle className="size-4 text-brand" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {current ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/projects/${current.id}/usage`}>
                <Timer1 className="size-4" />
                Time and usage
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/projects/${current.id}/settings`}>
                <Setting4 className="size-4" />
                Project settings
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/projects/new">
            <AddSquare className="size-4" />
            New project
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
