'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Command as CommandPrimitive } from 'cmdk';
import { AddSquare, ExportSquare, Kanban, Refresh, SearchNormal1, Setting2, Setting4, Timer1 } from 'iconsax-react';
import { LogoMark } from '~/components/brand/logo';
import { useRefreshBoard } from '~/components/board/use-refresh-board';
import { Kbd } from '~/components/shared/kbd';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { useBoard, useProjects } from '~/hooks/projects';
import { CARD_STATUSES } from '~/schemas/common';
import { STATUS_META } from '~/constants/statuses';
import { useUiStore } from '~/store/ui.store';
import { cn } from '~/lib/utils';

/**
 * ⌘K, Raycast style: a large search bar, grouped results (cards of the open
 * project, actions, projects) and an action bar footer. Opens with ⌘K / Ctrl+K
 * and "/".
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const router = useRouter();
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId;
  const { data: projects = [] } = useProjects();
  const board = useBoard(projectId ?? '');
  const { refresh } = useRefreshBoard(projectId);
  const project = projects.find((p) => p.id === projectId);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandOpen);
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const cards = projectId && board.data ? CARD_STATUSES.flatMap((s) => board.data!.columns[s]) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="window top-[16%] translate-y-0 gap-0 overflow-hidden rounded-2xl! p-0 sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search cards, run actions and switch projects</DialogDescription>
        <CommandPrimitive loop className="flex flex-col">
          <div className="flex items-center gap-3 border-b px-4">
            <SearchNormal1 className="size-[18px] shrink-0 text-subtle-foreground" aria-hidden />
            <CommandPrimitive.Input
              autoFocus
              placeholder={project ? `Search ${project.name}…` : 'Search for actions…'}
              className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-subtle-foreground"
            />
          </div>

          <CommandPrimitive.List className="scrollbar-thin max-h-[min(420px,55vh)] scroll-py-2 overflow-y-auto p-2">
            <CommandPrimitive.Empty className="py-10 text-center text-sm text-muted-foreground">
              No results
            </CommandPrimitive.Empty>

            {cards.length ? (
              <Group heading="Cards">
                {cards.map((card) => (
                  <Item
                    key={card.id}
                    value={`card ${card.title} ${card.shortLink} ${card.id}`}
                    onSelect={() => run(() => router.push(`/projects/${projectId}?card=${card.id}`))}
                  >
                    <span className="w-20 shrink-0 truncate font-mono text-[11px] text-subtle-foreground">{card.shortLink}</span>
                    <span className="min-w-0 flex-1 truncate">{card.title}</span>
                    <span className="shrink-0 text-xs text-subtle-foreground">{STATUS_META[card.status].label}</span>
                  </Item>
                ))}
              </Group>
            ) : null}

            <Group heading="Actions">
              {project ? (
                <>
                  <Item value="sync refresh trello" onSelect={() => run(refresh)} shortcut="R">
                    <Refresh className="size-4 text-muted-foreground" />
                    Sync with Trello
                  </Item>
                  {project.trelloBoardUrl ? (
                    <Item
                      value="open board in trello"
                      onSelect={() => run(() => window.open(project.trelloBoardUrl!, '_blank', 'noopener'))}
                    >
                      <ExportSquare className="size-4 text-muted-foreground" />
                      Open board in Trello
                    </Item>
                  ) : null}
                  <Item value="time usage tokens cost billing csv export" onSelect={() => run(() => router.push(`/projects/${project.id}/usage`))}>
                    <Timer1 className="size-4 text-muted-foreground" />
                    Time and usage
                  </Item>
                  <Item value="project settings" onSelect={() => run(() => router.push(`/projects/${project.id}/settings`))}>
                    <Setting4 className="size-4 text-muted-foreground" />
                    Project settings
                  </Item>
                </>
              ) : null}
              <Item value="new project" onSelect={() => run(() => router.push('/projects/new'))}>
                <AddSquare className="size-4 text-muted-foreground" />
                New project
              </Item>
              <Item value="settings trello credentials preferences" onSelect={() => run(() => router.push('/settings'))}>
                <Setting2 className="size-4 text-muted-foreground" />
                Settings
              </Item>
            </Group>

            {projects.length ? (
              <Group heading="Projects">
                {projects.map((p) => (
                  <Item key={p.id} value={`project ${p.name} ${p.id}`} onSelect={() => run(() => router.push(`/projects/${p.id}`))}>
                    <Kanban className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 truncate text-xs text-subtle-foreground">{p.trelloBoardName}</span>
                  </Item>
                ))}
              </Group>
            ) : null}
          </CommandPrimitive.List>

          <footer className="flex h-11 items-center justify-between gap-3 border-t bg-fill-faint px-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <LogoMark className="size-4" />
              Ticket2PR
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                Open <Kbd>↵</Kbd>
              </span>
              <span aria-hidden className="h-4 w-px bg-border" />
              <span className="flex items-center gap-1.5">
                Close <Kbd>esc</Kbd>
              </span>
            </span>
          </footer>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <CommandPrimitive.Group
      heading={heading}
      className="pb-1 **:[[cmdk-group-heading]]:eyebrow **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-subtle-foreground"
    >
      {children}
    </CommandPrimitive.Group>
  );
}

function Item({
  children,
  shortcut,
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & { shortcut?: string }) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'flex h-10 cursor-default items-center gap-3 rounded-lg px-2 text-[13.5px] text-foreground outline-none select-none data-[selected=true]:bg-fill-raised',
        className,
      )}
      {...props}
    >
      {children}
      {shortcut ? <Kbd className="ml-auto">{shortcut}</Kbd> : null}
    </CommandPrimitive.Item>
  );
}
