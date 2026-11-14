import { TickSquare } from 'iconsax-react';
import { cn } from '~/lib/utils';
import type { Checklist } from '~/types/card';

/** A Trello checklist, read-only: progress bar, then items. */
export function ChecklistView({ checklist }: { checklist: Checklist }) {
  const done = checklist.items.filter((i) => i.state === 'complete').length;
  const total = checklist.items.length;
  const ratio = total ? done / total : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="truncate text-[13px] font-medium text-foreground">{checklist.name}</h4>
        <span className="font-mono text-[11px] text-subtle-foreground">
          {done}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${checklist.name} progress`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1 overflow-hidden rounded-full bg-fill-raised"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', ratio === 1 ? 'bg-success' : 'bg-foreground/60')}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {total ? (
        <ul className="flex flex-col">
          {checklist.items.map((item) => {
            const complete = item.state === 'complete';
            return (
              <li key={item.id} className="flex items-start gap-2.5 py-1 text-[13px]">
                {complete ? (
                  <TickSquare variant="Bold" className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <span aria-label="To do" className="mt-0.5 size-4 shrink-0 rounded-[5px] border-[1.5px] border-border-strong" />
                )}
                <span className={cn('[overflow-wrap:anywhere]', complete ? 'text-subtle-foreground line-through' : 'text-foreground/90')}>
                  {item.name}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
