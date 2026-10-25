"use client";

// Plugin bootstrap: imports the built-in plugins and registers them with the
// runtime before any slot renders. Imported (for its side effect) by the app
// shell. Safe mode (?safe-mode=1 or localStorage vytdl-safe-mode=1) skips
// non-builtin plugins — with the current all-builtin set it still exercises
// the gate and exposes plugin states to the recovery UI.

import { pluginRuntime, isSafeMode, loadRemotePlugins } from "@vytdl/plugin-runtime";
import { plugin as downloads } from "@vytdl/plugin-downloads";
import { plugin as library } from "@vytdl/plugin-library";
import { plugin as settings } from "@vytdl/plugin-settings";
import { plugin as analyze } from "@vytdl/plugin-analyze";
import { plugin as workspace } from "@vytdl/plugin-workspace";

let bootstrapped = false;

export function bootstrapPlugins(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  pluginRuntime.setSafeMode(isSafeMode());
  pluginRuntime.registerAll([downloads, library, settings, analyze, workspace]);
  // Third-party plugins load asynchronously (inventory from the daemon);
  // slots re-render through the registry subscription.
  void loadRemotePlugins();
}
