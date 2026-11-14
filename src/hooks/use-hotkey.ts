'use client';

import * as React from 'react';

/** True when the event comes from a text field, where single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

/**
 * A single-key shortcut (`r`, `/`, `?`) that ignores modifier combos, typing in
 * fields, and open dialogs (unless `inDialogs`).
 */
export function useHotkey(key: string, handler: () => void, options: { enabled?: boolean; inDialogs?: boolean } = {}) {
  const { enabled = true, inDialogs = false } = options;
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  });

  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (isTypingTarget(e.target)) return;
      if (!inDialogs && document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]')) return;
      e.preventDefault();
      handlerRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, enabled, inDialogs]);
}
