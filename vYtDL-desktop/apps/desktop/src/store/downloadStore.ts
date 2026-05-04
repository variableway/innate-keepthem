"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tauriStorage } from "@/lib/tauri-storage";
import type { Download, DownloadOptions, DownloadProgress, ApiResponse } from "@/types";

interface DownloadState {
  downloads: Download[];
  activeDownloads: Map<string, DownloadProgress>;
  isLoading: boolean;
  error: string | null;

  fetchDownloads: () => Promise<void>;
  startDownload: (options: DownloadOptions) => Promise<string | null>;
  cancelDownload: (id: string) => Promise<void>;
  deleteDownload: (id: string) => Promise<void>;
  subscribeToProgress: (id: string) => Promise<() => void>;
  clearError: () => void;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(command, args);
}

async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  const { listen: tauriListen } = await import("@tauri-apps/api/event");
  return tauriListen<T>(event, (e) => handler(e.payload));
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      downloads: [],
      activeDownloads: new Map(),
      isLoading: false,
      error: null,

      fetchDownloads: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await invoke<ApiResponse<Download[]>>("get_downloads");
          if (response.success && response.data) {
            set({ downloads: response.data });
          } else {
            set({ downloads: [], error: response.error || "Failed to fetch downloads" });
          }
        } catch (err) {
          set({ downloads: [], error: String(err) });
        } finally {
          set({ isLoading: false });
        }
      },

      startDownload: async (options: DownloadOptions) => {
        set({ error: null });
        try {
          const response = await invoke<ApiResponse<string>>("start_download", { request: options });
          if (response.success && response.data) {
            get().fetchDownloads();
            return response.data;
          } else {
            set({ error: response.error || "Failed to start download" });
            return null;
          }
        } catch (err) {
          set({ error: String(err) });
          return null;
        }
      },

      cancelDownload: async (id: string) => {
        try {
          await invoke<ApiResponse<void>>("cancel_download", { downloadId: id });
          get().fetchDownloads();
        } catch (err) {
          set({ error: String(err) });
        }
      },

      deleteDownload: async (id: string) => {
        try {
          await invoke<ApiResponse<void>>("delete_download", { id });
          get().fetchDownloads();
        } catch (err) {
          set({ error: String(err) });
        }
      },

      subscribeToProgress: async (id: string) => {
        const unlisten = await listen<DownloadProgress>(`download:progress:${id}`, (event) => {
          set((state) => {
            const newActive = new Map(state.activeDownloads);
            newActive.set(id, event);
            return { activeDownloads: newActive };
          });
        });

        const unlistenComplete = await listen(`download:complete:${id}`, () => {
          set((state) => {
            const newActive = new Map(state.activeDownloads);
            newActive.delete(id);
            return { activeDownloads: newActive };
          });
          get().fetchDownloads();
        });

        const unlistenError = await listen<string>(`download:error:${id}`, () => {
          set((state) => {
            const newActive = new Map(state.activeDownloads);
            newActive.delete(id);
            return { activeDownloads: newActive };
          });
          get().fetchDownloads();
        });

        return () => {
          unlisten();
          unlistenComplete();
          unlistenError();
        };
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "vytdl-downloads",
      storage: tauriStorage,
      partialize: (state) => ({
        // Only persist minimal state; downloads come from DB
      }),
    }
  )
);
