'use client';

import { create } from 'zustand';

/** App-shell UI state. Never server data: that lives in React Query. */
type UiState = {
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
