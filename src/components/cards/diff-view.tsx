'use client';

import * as React from 'react';
import { ArrowRight2 } from 'iconsax-react';
import { cn } from '~/lib/utils';
import type { DiffFile } from '~/types/git';

const STATUS_LETTER: Record<DiffFile['status'], { letter: string; className: string; label: string }> = {
  added: { letter: 'A', className: 'text-success-muted', label: 'Added' },
  modified: { letter: 'M', className: 'text-warning-muted', label: 'Modified' },
  deleted: { letter: 'D', className: 'text-danger-muted', label: 'Deleted' },
  renamed: { letter: 'R', className: 'text-info-muted', label: 'Renamed' },
};

/** "+120 −34" in mono, coloured. */
export function DiffStat({ additions, deletions, className }: { additions: number; deletions: number; className?: string }) {
  return (
    <span className={cn('font-mono text-[11.5px]', className)}>
      <span className="text-success-muted">+{additions}</span> <span className="text-danger-muted">−{deletions}</span>
    </span>
  );
}

/** One file of a unified diff, collapsible, with old/new line numbers (spec §8.3). */
export function DiffFileView({ file, defaultOpen }: { file: DiffFile; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const status = STATUS_LETTER[file.status];
  return (
    <div className="overflow-hidden rounded-xl border bg-fill-faint">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-10 w-full items-center gap-2.5 px-3 text-left outline-none hover:bg-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <ArrowRight2 className={cn('size-3 shrink-0 text-subtle-foreground transition-transform', open && 'rotate-90')} />
        <span className={cn('w-3 shrink-0 font-mono text-[11px] font-semibold', status.className)} title={status.label}>
          {status.letter}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground" title={file.path}>
          {file.oldPath ? <span className="text-subtle-foreground">{file.oldPath} → </span> : null}
          {file.path}
        </span>
        <DiffStat additions={file.additions} deletions={file.deletions} className="shrink-0" />
      </button>
      {open ? (
        <div className="overflow-x-auto border-t scrollbar-thin">
          {file.binary ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Binary file, not shown.</p>
          ) : !file.hunks.length ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">No content changes.</p>
          ) : (
            <table className="w-full border-collapse font-mono text-[11.5px] leading-[1.6]">
              <tbody>
                {file.hunks.map((hunk, h) => (
                  <React.Fragment key={h}>
                    <tr className="bg-info-subtle/60">
                      <td colSpan={3} className="px-3 py-0.5 text-info-muted/80 select-none">
                        {hunk.header}
                      </td>
                    </tr>
                    {hunk.lines.map((line, i) => (
                      <tr
                        key={i}
                        className={cn(
                          line.type === 'add' && 'bg-success-subtle',
                          line.type === 'del' && 'bg-danger-subtle',
                        )}
                      >
                        <td className="w-10 border-r px-2 text-right text-subtle-foreground/70 select-none">{line.oldLine ?? ''}</td>
                        <td className="w-10 border-r px-2 text-right text-subtle-foreground/70 select-none">{line.newLine ?? ''}</td>
                        <td
                          className={cn(
                            'px-3 whitespace-pre',
                            line.type === 'add' && 'text-success-muted',
                            line.type === 'del' && 'text-danger-muted',
                            line.type === 'ctx' && 'text-foreground/80',
                            line.type === 'note' && 'text-subtle-foreground italic',
                          )}
                        >
                          <span className="inline-block w-3 select-none">
                            {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ''}
                          </span>
                          {line.text}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
          {file.truncated ? <p className="border-t px-3 py-2 text-xs text-muted-foreground">Long diff: the rest is not shown.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
