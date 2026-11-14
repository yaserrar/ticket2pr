import 'server-only';
import { isActiveRunStatus } from '~/lib/workflow';
import type { RunEventDto } from '~/types/run';
import { runRegistry, type RunSignal } from './run-registry';
import { runsService } from './runs.service';

const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events for a run's log (spec §7.4):
 *  1. replays stored events with `seq > lastSeq` (reloads, reconnects),
 *  2. streams live events,
 *  3. sends a heartbeat comment every 15 s,
 *  4. sends `end` and closes when the run ends.
 * Subscribes before replaying, so nothing is lost in between.
 */
export async function runEventStream(runId: string, lastSeq: number, abortSignal: AbortSignal): Promise<Response> {
  const run = await runsService.get(runId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let sent = lastSeq;
      const buffered: RunSignal[] = [];
      let replaying = true;

      const write = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const sendEvent = (event: RunEventDto) => {
        if (event.seq <= sent) return;
        sent = event.seq;
        write(`id: ${event.seq}\nevent: run-event\ndata: ${JSON.stringify(event)}\n\n`);
      };
      const close = () => {
        if (closed) return;
        write('event: end\ndata: {}\n\n');
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      };
      const handle = (signal: RunSignal) => {
        if (signal.kind === 'event') sendEvent(signal.event);
        else close();
      };

      const unsubscribe = runRegistry.subscribe(runId, (signal) => (replaying ? buffered.push(signal) : handle(signal)));
      const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
      abortSignal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      });

      write('retry: 2000\n\n');
      for (const event of await runsService.events(runId, lastSeq)) sendEvent(event);
      replaying = false;
      for (const signal of buffered) handle(signal);

      // Already finished: everything was replayed above.
      const current = await runsService.get(runId).catch(() => run);
      if (!isActiveRunStatus(current.status)) {
        for (const event of await runsService.events(runId, sent)) sendEvent(event);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
