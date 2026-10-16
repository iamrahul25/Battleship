import { create } from 'zustand';

export type ToastKind = 'info' | 'error' | 'success' | 'badge';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Achievement id for badge toasts. */
  badgeId?: string;
}

interface UiState {
  toasts: Toast[];
  /** null until the first server health check completes. */
  serverOnline: boolean | null;
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  setServerOnline: (online: boolean) => void;
}

let nextId = 1;

export const useUiStore = create<UiState>()((set) => ({
  toasts: [],
  serverOnline: null,
  showToast: (toast) => set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id: nextId++ }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setServerOnline: (online) => set({ serverOnline: online }),
}));

export const toast = (title: string, message?: string, kind: ToastKind = 'info') =>
  useUiStore.getState().showToast({ title, message, kind });
