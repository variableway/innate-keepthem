"use client";

import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import { webStorage } from "@vytdl/plugin-runtime/store";
import { apiInvoke } from "@vytdl/plugin-runtime/client";
import type { Settings, ApiResponse } from "@vytdl/plugin-runtime/types";

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
  proxy: null,
  cookie: null,
  rate_limit: null,
  concurrent_fragments: null,
  embed_thumbnail: false,
  embed_metadata: false,
  embed_chapters: false,
  sponsorblock_remove: false,
  filename_template: null,
  po_token: null,
  extractor_args: null,
  config_location: null,
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
      // Known zustand v5 typing gap (StateStorage vs PersistStorage) — runtime identical
      // to the desktop app; see AGENTS.md "Known Issues".
      storage: webStorage as unknown as PersistStorage<any>,
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);
