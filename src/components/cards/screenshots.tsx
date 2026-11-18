'use client';

import * as React from 'react';
import { Camera, ExportSquare, TickCircle } from 'iconsax-react';
import { toast } from 'sonner';
import { ReasonButton } from '~/components/shared/reason-button';
import { Input } from '~/components/ui/input';
import { useRetakeScreenshots } from '~/hooks/cards';
import { useBoard } from '~/hooks/projects';
import { getErrorMessage } from '~/lib/api-errors';
import { cn } from '~/lib/utils';
import type { CardDto } from '~/types/card';

/**
 * Screenshots of the change, taken after the run on the public pages Claude
 * named. The selected ones are attached to the Trello card with the client
 * update. "Retake" starts the app again, on the same or other pages.
 */
export function ScreenshotPicker({
  card,
  selected,
  onSelectedChange,
}: {
  card: CardDto;
  selected: string[];
  onSelectedChange: (files: string[]) => void;
}) {
  const board = useBoard(card.projectId);
  const enabled = Boolean(board.data?.project.previewEnabled);
  const { screenshots, error, pages } = card.preview;
  const retake = useRetakeScreenshots(card.projectId, card.id);
  const [pagesText, setPagesText] = React.useState((pages.length ? pages : ['/']).join(', '));
  const [retakeError, setRetakeError] = React.useState<string | null>(null);
  const running = Boolean(card.activeRun);

  if (!enabled && !screenshots.length) return null;

  const toggle = (file: string) => onSelectedChange(selected.includes(file) ? selected.filter((f) => f !== file) : [...selected, file]);
  const submitRetake = (e: React.FormEvent) => {
    e.preventDefault();
    const list = pagesText
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => (p.startsWith('/') ? p : `/${p}`));
    setRetakeError(null);
    retake.mutate(
      { pages: list },
      {
        onSuccess: (next) =>
          next.preview.screenshots.length
            ? toast.success(`${next.preview.screenshots.length === 1 ? 'Screenshot' : 'Screenshots'} retaken`)
            : setRetakeError(next.preview.error ?? 'No page could be captured.'),
        onError: (err) => setRetakeError(getErrorMessage(err)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <Camera className="size-4 shrink-0 text-muted-foreground" />
        Screenshots
        {screenshots.length ? <span className="font-normal text-subtle-foreground">· click to include or leave out</span> : null}
      </div>

      {screenshots.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {screenshots.map((shot) => {
            const on = selected.includes(shot.file);
            return (
              <div key={shot.file} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${on ? 'Leave out' : 'Include'} the screenshot of ${shot.page}`}
                  onClick={() => toggle(shot.file)}
                  className={cn(
                    'relative overflow-hidden rounded-lg border bg-fill outline-none transition-[border-color,opacity] focus-visible:ring-3 focus-visible:ring-ring/50',
                    on ? 'border-brand-border' : 'border-border opacity-50 hover:opacity-80',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local API image, no optimisation needed */}
                  <img src={shot.url} alt={`The app at ${shot.page}`} className="block aspect-[16/10] w-full object-cover object-top" loading="lazy" />
                  {on ? <TickCircle className="absolute top-2 right-2 size-5 rounded-full bg-surface text-brand" /> : null}
                </button>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <code className="truncate font-mono">{shot.page}</code>
                  <a href={shot.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                    Full size <ExportSquare className="size-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-subtle-foreground">
          {error ?? (pages.length ? 'No screenshot yet.' : 'Claude didn’t name a public page that shows this change.')}
        </p>
      )}
      {screenshots.length && error ? <p className="text-[13px] text-warning-muted">{error}</p> : null}

      {enabled ? (
        <form onSubmit={submitRetake} className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Input
              value={pagesText}
              onChange={(e) => setPagesText(e.target.value)}
              aria-label="Pages to screenshot"
              placeholder="/, /contact"
              className="h-8 font-mono text-xs"
              spellCheck={false}
            />
            <ReasonButton type="submit" size="sm" variant="outline" loading={retake.isPending} reason={running ? 'Wait for the run to finish.' : null}>
              <Camera className="size-4" />
              {screenshots.length ? 'Retake' : 'Take'}
            </ReasonButton>
          </div>
          <p className="text-xs text-subtle-foreground">
            {retake.isPending ? 'Starting the app and taking the screenshots…' : 'Public pages only, up to three, separated by commas.'}
          </p>
          {retakeError ? <p className="text-[13px] whitespace-pre-wrap text-danger-muted">{retakeError}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
