'use client';

import { useSyncExternalStore } from 'react';

/**
 * A shared, ticking "now" (ms) for relative times and countdowns without
 * calling Date.now() during render. One interval for the whole app.
 * Returns 0 on the server / before hydration.
 */
const TICK_MS = 15_000;
let now = typeof window === 'undefined' ? 0 : Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}
