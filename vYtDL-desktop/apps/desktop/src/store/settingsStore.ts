"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tauriStorage } from "@/lib/tauri-storage";
import { apiInvoke } from "@/lib/api-client";
import type { Settings, ApiResponse } from "@/types";

interface SettingsState {
  settings: Settings | null;
  isLoading: boolean;
  error: string | null;

  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
}

const defaultSettings: Settings = {
  yt_dlp_path: null,
  default_output_dir: null,
  default_quality: "best",
  default_format: "mp4",
  default_sub_langs: ["en", "zh"],
  language: "zh",
  max_concurrent_downloads: 3,
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
          const response = await apiInvoke<ApiResponse<Settings>>("get_settings");
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
          const response = await apiInvoke<ApiResponse<void>>("update_settings", { settings });
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
