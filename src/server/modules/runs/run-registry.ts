import 'server-only';
import type { RunEventDto } from '~/types/run';

/**
 * Active runs and live subscribers (spec §7.4), on `globalThis` so they
 * survive dev hot reloads and are shared by every route module.
 */
export type RunSignal = { kind: 'event'; event: RunEventDto } | { kind: 'end' };
type Listener = (signal: RunSignal) => void;

type Registry = {
  active: Map<string, AbortController>;
  listeners: Map<string, Set<Listener>>;
};

const g = globalThis as unknown as { t2pRunRegistry?: Registry };
const registry: Registry = (g.t2pRunRegistry ??= { active: new Map(), listeners: new Map() });

export const runRegistry = {
  register(runId: string, controller: AbortController) {
    registry.active.set(runId, controller);
  },
  unregister(runId: string) {
    registry.active.delete(runId);
  },
  isActive: (runId: string) => registry.active.has(runId),
  activeCount: () => registry.active.size,
  activeIds: () => [...registry.active.keys()],
  /** Aborts a running run. Returns false if it isn't running in this process. */
  abort(runId: string) {
    const controller = registry.active.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  },
  subscribe(runId: string, listener: Listener) {
    const set = registry.listeners.get(runId) ?? new Set<Listener>();
    set.add(listener);
    registry.listeners.set(runId, set);
    return () => {
      set.delete(listener);
      if (!set.size) registry.listeners.delete(runId);
    };
  },
  publish(runId: string, signal: RunSignal) {
    for (const listener of registry.listeners.get(runId) ?? []) {
      try {
        listener(signal);
      } catch {
        // A closed stream must not break the run.
      }
    }
  },
};
