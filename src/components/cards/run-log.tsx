'use client';

import * as React from 'react';
import { ArrowRight2, Code, Danger, DocumentText1, Edit2, Flash, SearchNormal1, Setting2, TickCircle } from 'iconsax-react';
import { Spinner } from '~/components/ui/spinner';
import { formatDuration } from '~/lib/format';
import { cn } from '~/lib/utils';
import { formatTokens } from '~/lib/usage';
import type { RunEventDto } from '~/types/run';
import { CheckStatusChip } from './checks-tab';
import { COST_NOTE } from './usage-panel';

/**
 * A run's live log (spec §7.4): agent messages as text, tool calls as compact
 * rows ("Edit src/Header.tsx", "Bash npm test") that expand to show input and
 * output, setup output as a terminal block, and a summary card at the end.
 */
type ToolCall = Extract<RunEventDto, { type: 'tool_use' }>;
type ToolResult = Extract<RunEventDto, { type: 'tool_result' }>;
type Item =
  | { kind: 'event'; event: RunEventDto }
  | { kind: 'info'; key: number; lines: string[] }
  | { kind: 'tool'; call: ToolCall; result: ToolResult | null };

function group(events: RunEventDto[]): Item[] {
  const results = new Map<string, ToolResult>();
  for (const e of events) if (e.type === 'tool_result') results.set(e.toolUseId, e);
  const items: Item[] = [];
  for (const e of events) {
    if (e.type === 'tool_result') continue;
    if (e.type === 'tool_use') {
      items.push({ kind: 'tool', call: e, result: results.get(e.id) ?? null });
    } else if (e.type === 'info') {
      const last = items.at(-1);
      if (last?.kind === 'info') last.lines.push(e.message);
      else items.push({ kind: 'info', key: e.seq, lines: [e.message] });
    } else {
      items.push({ kind: 'event', event: e });
    }
  }
  return items;
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Edit: Edit2,
  MultiEdit: Edit2,
  Write: Edit2,
  Read: DocumentText1,
  Bash: Code,
  Glob: SearchNormal1,
  Grep: SearchNormal1,
};

/** The one argument worth showing inline: a path, a command or a pattern. */
function toolTarget(input: Record<string, unknown>) {
  const value = input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.url;
  return typeof value === 'string' ? value : null;
}

export function RunLog({ events, live }: { events: RunEventDto[]; live: boolean }) {
  const items = React.useMemo(() => group(events), [events]);
  const bottom = React.useRef<HTMLDivElement>(null);
  const container = React.useRef<HTMLDivElement>(null);

  // Follow new events while the reader is near the bottom.
  React.useEffect(() => {
    const el = container.current?.closest('[data-scroll-root]') as HTMLElement | null;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) bottom.current?.scrollIntoView({ block: 'end' });
  }, [events.length]);

  if (!events.length) {
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
        {live ? <Spinner className="size-3.5" /> : null}
        {live ? 'Waiting for the run to start…' : 'No events recorded for this run.'}
      </div>
    );
  }

  return (
    <div ref={container} className="flex flex-col gap-3" aria-live="polite">
      {items.map((item) => {
        if (item.kind === 'info') {
          return (
            <pre
              key={`info-${item.key}`}
              className="max-h-56 overflow-auto rounded-lg border bg-fill-faint px-3 py-2 font-mono text-[11.5px] leading-5 whitespace-pre-wrap text-muted-foreground scrollbar-thin"
            >
              {item.lines.join('\n')}
            </pre>
          );
        }
        if (item.kind === 'tool') return <ToolRow key={item.call.seq} call={item.call} result={item.result} live={live} />;
        return <EventRow key={item.event.seq} event={item.event} />;
      })}
      {live ? (
        <div className="flex items-center gap-2 text-xs text-subtle-foreground">
          <span aria-hidden className="dot-running size-1.5 rounded-full" />
          <span className="text-shimmer">Working…</span>
        </div>
      ) : null}
      <div ref={bottom} />
    </div>
  );
}

function EventRow({ event }: { event: RunEventDto }) {
  switch (event.type) {
    case 'system':
      return (
        <p className="flex items-center gap-2 text-xs text-subtle-foreground">
          <Setting2 className="size-3.5 shrink-0" />
          {event.message}
        </p>
      );
    case 'assistant_text':
      return <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground/90 [overflow-wrap:anywhere]">{event.text}</p>;
    case 'error':
      return (
        <p role="alert" className="flex gap-2 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-[13px] whitespace-pre-wrap text-danger-muted">
          <Danger className="mt-0.5 size-4 shrink-0" />
          {event.message}
        </p>
      );
    case 'result':
      return (
        <div className={cn('rounded-xl border p-3', event.isError ? 'border-danger/25 bg-danger-subtle' : 'border-success/25 bg-success-subtle')}>
          <p className={cn('flex items-center gap-2 text-[13px] font-medium', event.isError ? 'text-danger-muted' : 'text-success-muted')}>
            {event.isError ? <Danger className="size-4" /> : <TickCircle className="size-4" />}
            {event.isError ? 'Run finished with an error' : 'Run finished'}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11.5px] text-muted-foreground">
            <div className="flex gap-1.5">
              <dt>turns</dt>
              <dd className="text-foreground">{event.numTurns}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>duration</dt>
              <dd className="text-foreground">{formatDuration(event.durationMs)}</dd>
            </div>
            {event.tokens !== undefined ? (
              <div className="flex gap-1.5">
                <dt>tokens</dt>
                <dd className="text-foreground">{formatTokens(event.tokens)}</dd>
              </div>
            ) : null}
            <div className="flex gap-1.5" title={event.costIsEstimate ? COST_NOTE : undefined}>
              <dt>{event.costIsEstimate ? 'API-equivalent' : 'cost'}</dt>
              <dd className="text-foreground">
                {event.costIsEstimate ? '≈ ' : ''}${event.costUsd.toFixed(2)}
                {event.costIsEstimate ? <span className="text-subtle-foreground"> · covered by your plan</span> : null}
              </dd>
            </div>
          </dl>
        </div>
      );
    case 'check':
      return (
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          <CheckStatusChip status={event.status} />
          <span className="font-medium text-foreground">{event.name}</span>
          <code className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">{event.command}</code>
          <span className="ml-auto font-mono text-[11px] text-subtle-foreground">{formatDuration(event.durationMs)}</span>
        </p>
      );
    default:
      return null;
  }
}

function ToolRow({ call, result, live }: { call: ToolCall; result: ToolResult | null; live: boolean }) {
  const Icon = TOOL_ICONS[call.name] ?? Flash;
  const target = toolTarget(call.input);
  const pending = !result && live;
  return (
    <details className="group/tool rounded-lg border bg-fill-faint open:bg-fill">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3 text-[12.5px] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ArrowRight2 className="size-3 shrink-0 text-subtle-foreground transition-transform group-open/tool:rotate-90" />
        <Icon className={cn('size-3.5 shrink-0', result?.isError ? 'text-danger-muted' : 'text-muted-foreground')} />
        <span className="font-medium text-foreground">{call.name}</span>
        {target ? <code className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">{target}</code> : null}
        <span className="ml-auto shrink-0">
          {pending ? <Spinner className="size-3" /> : result?.isError ? <span className="text-[11px] text-danger-muted">failed</span> : null}
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t px-3 py-2.5">
        <pre className="overflow-x-auto font-mono text-[11px] leading-5 text-subtle-foreground scrollbar-thin">
          {JSON.stringify(call.input, null, 2)}
        </pre>
        {result ? (
          <pre
            className={cn(
              'max-h-64 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11px] leading-5 whitespace-pre-wrap scrollbar-thin',
              result.isError ? 'text-danger-muted' : 'text-muted-foreground',
            )}
          >
            {result.output || '(no output)'}
          </pre>
        ) : null}
      </div>
    </details>
  );
}
