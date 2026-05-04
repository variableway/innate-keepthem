"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tauriStorage } from "@/lib/tauri-storage";
import type { Settings, ApiResponse } from "@/types";

interface SettingsState {
  settings: Settings | null;
  isLoading: boolean;
  error: string | null;

  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(command, args);
}

const defaultSettings: Settings = {
  yt_dlp_path: null,
  default_output_dir: null,
  default_quality: "best",
  default_format: "mp4",
  default_sub_langs: ["en", "zh"],
  language: "zh",
  ai_provider: null,
  ai_api_key: null,
  ai_model: null,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: null,
      isLoading: false,
      error: null,

      fetchSettings: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await invoke<ApiResponse<Settings>>("get_settings");
          if (response.success && response.data) {
            set({ settings: response.data });
          } else {
            set({ settings: defaultSettings });
          }
        } catch (err) {
          set({ settings: defaultSettings, error: String(err) });
        } finally {
          set({ isLoading: false });
        }
      },

      updateSettings: async (settings: Settings) => {
        set({ isLoading: true, error: null });
        try {
          const response = await invoke<ApiResponse<void>>("update_settings", { settings });
          if (response.success) {
            set({ settings });
          } else {
            set({ error: response.error || "Failed to update settings" });
          }
        } catch (err) {
          set({ error: String(err) });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: "vytdl-settings",
      storage: tauriStorage,
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);
