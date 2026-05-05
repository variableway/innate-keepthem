"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tauriStorage } from "@/lib/tauri-storage";
import { apiInvoke, apiListen } from "@/lib/api-client";
import type { Download, DownloadLog, DownloadOptions, DownloadProgress, ApiResponse } from "@/types";

interface DownloadState {
  downloads: Download[];
  activeDownloads: Map<string, DownloadProgress>;
  downloadLogs: Map<string, DownloadLog[]>;
  isLoading: boolean;
  error: string | null;

  fetchDownloads: () => Promise<void>;
  startDownload: (options: DownloadOptions) => Promise<string | null>;
  cancelDownload: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<string | null>;
  deleteDownload: (id: string) => Promise<void>;
  subscribeToProgress: (id: string) => Promise<() => void>;
  subscribeToLogs: (id: string) => Promise<() => void>;
  clearLogs: (id: string) => void;
  clearError: () => void;
}


export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      downloads: [],
      activeDownloads: new Map(),
      downloadLogs: new Map(),
      isLoading: false,
      error: null,

      fetchDownloads: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiInvoke<ApiResponse<Download[]>>("get_downloads");
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
          const response = await apiInvoke<ApiResponse<string>>("start_download", { request: options });
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
          await apiInvoke<ApiResponse<void>>("cancel_download", { downloadId: id });
          get().fetchDownloads();
        } catch (err) {
          set({ error: String(err) });
        }
      },

      retryDownload: async (id: string) => {
        set({ error: null });
        try {
          const response = await apiInvoke<ApiResponse<string>>("retry_download", { id });
          if (response.success && response.data) {
            get().fetchDownloads();
            return response.data;
          } else {
            set({ error: response.error || "Failed to retry download" });
            return null;
          }
        } catch (err) {
          set({ error: String(err) });
          return null;
        }
      },

      deleteDownload: async (id: string) => {
        try {
          await apiInvoke<ApiResponse<void>>("delete_download", { id });
          get().fetchDownloads();
        } catch (err) {
          set({ error: String(err) });
        }
      },

      subscribeToProgress: async (id: string) => {
        const unlisten = await apiListen<DownloadProgress>(`download:progress:${id}`, (event) => {
          set((state) => {
            const newActive = new Map(state.activeDownloads);
            newActive.set(id, event);
            return { activeDownloads: newActive };
          });
        });

        const unlistenComplete = await apiListen(`download:complete:${id}`, () => {
          set((state) => {
            const newActive = new Map(state.activeDownloads);
            newActive.delete(id);
            return { activeDownloads: newActive };
          });
          get().fetchDownloads();
        });

        const unlistenError = await apiListen<string>(`download:error:${id}`, () => {
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

      subscribeToLogs: async (id: string) => {
        const unlisten = await apiListen<DownloadLog>(`download:log:${id}`, (event) => {
          set((state) => {
            const newLogs = new Map(state.downloadLogs);
            const existing = newLogs.get(id) || [];
            newLogs.set(id, [...existing, event]);
            return { downloadLogs: newLogs };
          });
        });

        return () => {
          unlisten();
        };
      },

      clearLogs: (id: string) => {
        set((state) => {
          const newLogs = new Map(state.downloadLogs);
          newLogs.delete(id);
          return { downloadLogs: newLogs };
        });
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
