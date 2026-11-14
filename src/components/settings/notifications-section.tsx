'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { SettingsSection } from '~/components/layout/app-page';
import { Button } from '~/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { Switch } from '~/components/ui/switch';
import { useMounted } from '~/hooks/use-mounted';
import { useNotificationPrefs } from '~/store/notifications.store';

/** Desktop notifications: the browser asks for permission the first time. */
export function NotificationsSection() {
  const mounted = useMounted();
  const { enabled, setEnabled } = useNotificationPrefs();
  // Only read after mount (rendering below is gated on `mounted`), so server and client agree.
  const [permission, setPermission] = React.useState<NotificationPermission | 'unsupported'>(() =>
    typeof window === 'undefined' ? 'default' : 'Notification' in window ? Notification.permission : 'unsupported',
  );

  const toggle = async (next: boolean) => {
    if (!next) return setEnabled(false);
    if (permission === 'unsupported') return toast.error('This browser doesn’t support desktop notifications.');
    const result = permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(result);
    if (result !== 'granted') return toast.error('Notifications are blocked for this site. Allow them in the browser’s site settings.');
    setEnabled(true);
    new Notification('Notifications are on', { body: 'Ticket2PR tells you when a card needs you.', icon: '/icon.svg' });
  };

  const on = mounted && enabled && permission === 'granted';

  return (
    <SettingsSection
      title="Notifications"
      description="While Ticket2PR is open in a tab, get a desktop notification when a card needs you and you’re in another app."
    >
      <Field orientation="horizontal" className="justify-between">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="desktop-notifications">Desktop notifications</FieldLabel>
          <FieldDescription>
            A run is ready for review or failed, Claude has questions, the client replied, or the Claude usage limit paused the queue. In
            the app, these show as toasts.
          </FieldDescription>
        </div>
        <Switch id="desktop-notifications" checked={on} onCheckedChange={(v) => void toggle(v)} disabled={!mounted} />
      </Field>
      {mounted && enabled && permission === 'denied' ? (
        <p className="text-[13px] text-warning-muted">
          The browser blocks notifications for this site. Allow them in its site settings, then turn this on again.{' '}
          <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setEnabled(false)}>
            Turn off
          </Button>
        </p>
      ) : null}
    </SettingsSection>
  );
}
