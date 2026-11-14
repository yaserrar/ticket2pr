'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { runsApi } from '~/services/api/runs';
import type { RunEventDto } from '~/types/run';
import { refreshCard } from './cards';

export const useCancelRun = (projectId: string, cardId: string) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (runId: string) => runsApi.cancel(runId), onSettled: () => refreshCard(qc, projectId, cardId) });
};

/**
 * Live log of a run (spec §7.4) over EventSource: replays stored events, then
 * streams new ones, and refreshes the board and the card when the run ends.
 * EventSource reconnects on its own and resumes from the last event id.
 */
export function useRunStream(runId: string | null, opts: { projectId: string; cardId: string }) {
  const qc = useQueryClient();
  const [state, setState] = React.useState<{ runId: string | null; events: RunEventDto[]; ended: boolean }>({
    runId,
    events: [],
    ended: false,
  });
  // A different run starts from an empty log (reset during render, not in an effect).
  if (state.runId !== runId) setState({ runId, events: [], ended: false });

  const { projectId, cardId } = opts;
  React.useEffect(() => {
    if (!runId) return;
    const source = new EventSource(runsApi.streamUrl(runId));
    source.addEventListener('run-event', (e) => {
      const event = JSON.parse((e as MessageEvent<string>).data) as RunEventDto;
      setState((s) =>
        s.runId !== runId || s.events.some((x) => x.seq === event.seq) ? s : { ...s, events: [...s.events, event] },
      );
    });
    source.addEventListener('end', () => {
      source.close();
      setState((s) => (s.runId === runId ? { ...s, ended: true } : s));
      refreshCard(qc, projectId, cardId);
    });
    return () => source.close();
  }, [runId, projectId, cardId, qc]);

  return { events: state.runId === runId ? state.events : [], ended: state.ended };
}
