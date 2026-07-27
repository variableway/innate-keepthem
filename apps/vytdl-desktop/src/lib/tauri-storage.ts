import { type StateStorage } from "zustand/middleware";

async function getTauriStore() {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { Store } = await import("@tauri-apps/plugin-store");
    return Store.load("vytdl-store.bin");
  }
  return null;
}

export const tauriStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const store = await getTauriStore();
      if (store) {
        const value = await store.get<string>(name);
        return value ?? null;
      }
    } catch {
      // fallback
    }
    if (typeof window !== "undefined") {
      return localStorage.getItem(name);
    }
    return null;
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const store = await getTauriStore();
      if (store) {
        await store.set(name, value);
        await store.save();
        return;
      }
    } catch {
      // fallback
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(name, value);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      const store = await getTauriStore();
      if (store) {
        await store.delete(name);
        await store.save();
        return;
      }
    } catch {
      // fallback
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(name);
    }
  },
};
