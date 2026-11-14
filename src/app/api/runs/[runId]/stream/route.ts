import { route } from '~/server/http/route';
import { runParams, runStreamQuery } from '~/schemas/card';
import { runEventStream } from '~/server/modules/runs/run-stream';

/** SSE log of a run. EventSource reconnects send `Last-Event-ID`, which wins over `?lastSeq=`. */
export const GET = route({ params: runParams, query: runStreamQuery }, ({ params, query, req }) => {
  const header = req.headers.get('last-event-id');
  const lastEventId = header ? Number(header) : NaN;
  const lastSeq = Number.isInteger(lastEventId) && lastEventId > query.lastSeq ? lastEventId : query.lastSeq;
  return runEventStream(params.runId, lastSeq, req.signal);
});
