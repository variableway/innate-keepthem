"use client";

// Third-party plugin loading (sprint-0 model §6): installed plugins are
// served by the daemon under /api/plugins/<id>/files/… and imported at
// runtime. Loading is opt-out via safe mode; every failure is contained by
// the registry's isolation.

import { pluginRuntime, type VytdlPlugin } from "./runtime";
import { validateManifest } from "./manifest";

export interface RemotePluginInfo {
  id: string;
  name: string;
  version: string;
  engine: string;
  entry: string;
  disabled: boolean;
  pending: boolean;
  error?: string;
}

/**
 * Native dynamic import that the bundler cannot statically analyze — the
 * URL only exists at runtime (daemon-served plugin files).
 */
function runtimeImport(url: string): Promise<unknown> {
  const dynamicImport = new Function("u", "return import(u)") as (u: string) => Promise<unknown>;
  return dynamicImport(url);
}

/** Load installed third-party plugins from the daemon. Never throws. */
export async function loadRemotePlugins(apiBase = ""): Promise<void> {
  if (typeof window === "undefined") return; // SSR/prerender: no daemon to ask
  if (pluginRuntime.safeMode) {
    console.info("[plugins] safe mode: skipping remote plugins");
    return;
  }
  let infos: RemotePluginInfo[];
  try {
    const res = await fetch(`${apiBase}/api/plugins`);
    const body = (await res.json()) as { success: boolean; data?: RemotePluginInfo[] };
    infos = body.data ?? [];
  } catch (err) {
    console.warn("[plugins] plugin inventory unavailable:", err);
    return;
  }

  for (const info of infos) {
    if (info.disabled || info.pending || !info.entry) continue;
    try {
      const mod = (await runtimeImport(
        `${apiBase}/api/plugins/${encodeURIComponent(info.id)}/files/${info.entry}`,
      )) as { plugin?: VytdlPlugin; default?: VytdlPlugin };
      const plugin = mod.plugin ?? mod.default;
      if (!plugin?.manifest) throw new Error("module does not export a plugin");
      validateManifest({ ...plugin.manifest, builtin: false });
      pluginRuntime.register({ ...plugin, manifest: { ...plugin.manifest, builtin: false } });
    } catch (err) {
      console.error(`[plugins] failed to load remote plugin ${info.id}:`, err);
    }
  }
}
