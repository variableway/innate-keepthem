// Permission-gated API proxy: plugins may only call daemon commands whose
// capability domain their manifest declares (02-plugin-model.md §2).

import { apiInvoke } from "./client";
import type { PluginManifest } from "./manifest";

/** daemon command (snake or kebab case) → capability domain */
const COMMAND_DOMAINS: Record<string, string> = {
  start_download: "api:downloads",
  cancel_download: "api:downloads",
  retry_download: "api:downloads",
  get_downloads: "api:downloads",
  delete_download: "api:downloads",
  get_settings: "api:settings",
  update_settings: "api:settings",
  get_default_output_dir: "api:settings",
  get_video_info: "api:metadata",
  get_video_formats: "api:metadata",
  get_playlist_info: "api:metadata",
  analyze_vtt: "api:analyze",
  get_vtt_report: "api:analyze",
  list_vtt_reports: "api:analyze",
  delete_vtt_report: "api:analyze",
  extract_audio: "api:media",
  open_download_folder: "shell:reveal-folder",
  reveal_in_folder: "shell:reveal-folder",
};

export class PermissionDeniedError extends Error {
  constructor(pluginId: string, command: string, domain: string) {
    super(`${pluginId} is not permitted to call ${command} (missing "${domain}" permission)`);
    this.name = "PermissionDeniedError";
  }
}

export function domainOfCommand(command: string): string {
  const key = command.replace(/-/g, "_");
  return COMMAND_DOMAINS[key] ?? "api:other";
}

export function hasPermission(manifest: PluginManifest, domain: string): boolean {
  return manifest.permissions.some(
    (p) => p === domain || (p.endsWith(":*") && domain.startsWith(p.slice(0, -1))),
  );
}

/** apiInvoke guarded by the plugin's declared permissions. */
export function scopedInvoke<T>(
  manifest: PluginManifest,
  command: string,
  args?: Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const domain = domainOfCommand(command);
  if (!hasPermission(manifest, domain)) {
    return Promise.reject(new PermissionDeniedError(manifest.id, command, domain));
  }
  return apiInvoke<T>(command, args, options);
}

/** A minimal per-plugin client handed to activate(ctx). */
export interface ScopedApiClient {
  invoke: <T>(
    command: string,
    args?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<T>;
}

export function createScopedClient(manifest: PluginManifest): ScopedApiClient {
  return {
    invoke: <T,>(
      command: string,
      args?: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ) => scopedInvoke<T>(manifest, command, args, options),
  };
}
