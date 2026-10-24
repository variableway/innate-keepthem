import { type StateStorage } from "zustand/middleware";

// Web storage for Zustand persist: plain localStorage (the daemon's HTTP
// settings API remains the source of truth for server-side settings).
export const webStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(name);
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(name, value);
  },
  removeItem: (name: string): void => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(name);
  },
};
