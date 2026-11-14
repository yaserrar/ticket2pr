'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Desktop notification preference, kept in this browser (the permission is the browser's anyway). */
type NotificationPrefs = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const useNotificationPrefs = create<NotificationPrefs>()(
  persist((set) => ({ enabled: false, setEnabled: (enabled) => set({ enabled }) }), { name: 't2p-notifications' }),
);
