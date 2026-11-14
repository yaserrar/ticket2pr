'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { claudeApi } from '~/services/api/claude';
import { qk } from '~/lib/query-keys';
import { useNotificationPrefs } from '~/store/notifications.store';
import type { NotificationDto } from '~/types/client-loop';

const FAST_MS = 5_000;
const SLOW_MS = 20_000;

const hrefOf = (e: NotificationDto) => (e.projectId ? `/projects/${e.projectId}${e.cardId ? `?card=${e.cardId}` : ''}` : '/');

/**
 * Tells the developer when something needs them: a run finished or failed,
 * Claude has questions, the client replied, the usage limit paused the queue.
 * A desktop notification when the app isn't in front (and they're enabled),
 * a toast otherwise. Polls faster while runs are going.
 */
export function RunNotifier() {
  const router = useRouter();
  const qc = useQueryClient();
  const enabled = useNotificationPrefs((s) => s.enabled);
  const enabledRef = React.useRef(enabled);
  React.useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  React.useEffect(() => {
    let cursor: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const seen = new Set<string>();

    const show = (e: NotificationDto) => {
      const href = hrefOf(e);
      const desktop =
        enabledRef.current && document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted';
      if (desktop) {
        const n = new Notification(e.title, { body: e.body, tag: e.id, icon: '/icon.svg' });
        n.onclick = () => {
          window.focus();
          router.push(href);
          n.close();
        };
        return;
      }
      const tone = e.kind === 'RUN_FAILED' ? toast.error : e.kind === 'PAUSED' ? toast.warning : toast.info;
      tone(e.title, { description: e.body, action: e.cardId ? { label: 'Open', onClick: () => router.push(href) } : undefined });
    };

    const tick = async () => {
      let delay = SLOW_MS;
      try {
        const feed = await claudeApi.notifications(cursor);
        cursor = feed.now;
        delay = feed.activeRuns ? FAST_MS : SLOW_MS;
        const fresh = feed.events.filter((e) => !seen.has(e.id));
        for (const e of fresh) {
          seen.add(e.id);
          show(e);
        }
        if (fresh.length) {
          void qc.invalidateQueries({ queryKey: qk.projects.all });
          void qc.invalidateQueries({ queryKey: qk.claude.usage });
        }
      } catch {
        // Offline or the server restarting: try again later.
      }
      if (!stopped) timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [router, qc]);

  return null;
}
