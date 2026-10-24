// Plugin registry: registration, lifecycle error isolation, slot lookup,
// safe mode. Host renders read the registry; plugins contribute via register().

import * as React from "react";
import {
  validateManifest,
  type PluginManifest,
  type SlotDeclaration,
} from "./manifest";
import { createScopedClient, type ScopedApiClient } from "./permissions";
import { registerTranslations } from "./i18n";
import type { PrimaryModule } from "./navigation";

// ── plugin contract ──────────────────────────────────────────────────────────

export type NavContribution = PrimaryModule & { order?: number };

export interface PageRegistration {
  /** App Router route this component serves, e.g. "/" or "/player/[id]" */
  route: string;
  component: React.ComponentType;
}

export interface PluginRegistration {
  nav?: NavContribution[];
  pages?: PageRegistration[];
  /** locale trees merged into the global translation table (deep merge) */
  locales?: Record<string, Record<string, unknown>>;
}

export interface PluginContext {
  manifest: PluginManifest;
  /** daemon API proxied through the plugin's permission whitelist */
  api: ScopedApiClient;
  register: (reg: PluginRegistration) => void;
  log: (...args: unknown[]) => void;
}

export type PluginStatus = "active" | "disabled" | "failed";

export interface VytdlPlugin {
  manifest: PluginManifest;
  activate: (ctx: PluginContext) => void | Promise<void>;
  deactivate?(): void;
}

export interface PluginState {
  id: string;
  name: string;
  version: string;
  builtin: boolean;
  status: PluginStatus;
  error?: string;
}

// ── registry ─────────────────────────────────────────────────────────────────

interface RegisteredPlugin {
  plugin: VytdlPlugin;
  state: PluginState;
  registrations: PluginRegistration[];
}

export class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>();
  private listeners = new Set<() => void>();
  safeMode = false;

  /** enter safe mode BEFORE registering: non-builtin plugins are skipped */
  setSafeMode(on: boolean): void {
    this.safeMode = on;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  register(plugin: VytdlPlugin): PluginState {
    const id = plugin.manifest?.id ?? "<unknown>";
    try {
      validateManifest(plugin.manifest);
    } catch (err) {
      const state: PluginState = {
        id,
        name: plugin.manifest?.name ?? id,
        version: plugin.manifest?.version ?? "0",
        builtin: plugin.manifest?.builtin ?? false,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
      this.plugins.set(id, { plugin, state, registrations: [] });
      console.error(`[plugins] manifest rejected: ${state.error}`);
      this.notify();
      return state;
    }

    if (this.safeMode && plugin.manifest.builtin !== true) {
      const state: PluginState = {
        id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        builtin: false,
        status: "disabled",
        error: "safe mode: non-builtin plugin not loaded",
      };
      this.plugins.set(id, { plugin, state, registrations: [] });
      console.warn(`[plugins] safe mode: skipped ${id}`);
      this.notify();
      return state;
    }

    const registered: RegisteredPlugin = {
      plugin,
      state: {
        id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        builtin: plugin.manifest.builtin ?? false,
        status: "active",
      },
      registrations: [],
    };
    this.plugins.set(id, registered);

    // Activate with error isolation: a throwing plugin is disabled, host lives on.
    try {
      const ctx: PluginContext = {
        manifest: plugin.manifest,
        api: createScopedClient(plugin.manifest),
        register: (reg) => {
          registered.registrations.push(reg);
          if (reg.locales) {
            for (const [locale, tree] of Object.entries(reg.locales)) {
              registerTranslations(locale, tree);
            }
          }
        },
        log: (...args: unknown[]) => console.log(`[${id}]`, ...args),
      };
      const result = plugin.activate(ctx);
      if (result instanceof Promise) {
        result.catch((err) => this.fail(id, err));
      }
    } catch (err) {
      this.fail(id, err);
    }
    this.notify();
    return registered.state;
  }

  private fail(id: string, err: unknown): void {
    const entry = this.plugins.get(id);
    if (!entry) return;
    entry.state.status = "failed";
    entry.state.error = err instanceof Error ? err.message : String(err);
    console.error(`[plugins] ${id} failed to activate:`, entry.state.error);
    this.notify();
  }

  /** Mark a plugin disabled at runtime (recovery UI / error boundary). */
  disable(id: string, reason: string): void {
    const entry = this.plugins.get(id);
    if (!entry) return;
    entry.state.status = "disabled";
    entry.state.error = reason;
    this.notify();
  }

  list(): PluginState[] {
    return [...this.plugins.values()].map((p) => ({ ...p.state }));
  }

  get(id: string): PluginState | undefined {
    const entry = this.plugins.get(id);
    return entry ? { ...entry.state } : undefined;
  }

  private activeRegistrations(): PluginRegistration[] {
    const out: PluginRegistration[] = [];
    for (const entry of this.plugins.values()) {
      if (entry.state.status === "active") out.push(...entry.registrations);
    }
    return out;
  }

  /** Nav contributions ordered by `order` (stable tiebreak on id). */
  getNav(): NavContribution[] {
    const items = this.activeRegistrations().flatMap((r) => r.nav ?? []);
    return items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));
  }

  /** Page component for a route, or null when no active plugin serves it. */
  getPage(route: string): React.ComponentType | null {
    for (const reg of this.activeRegistrations()) {
      for (const page of reg.pages ?? []) {
        if (page.route === route) return page.component;
      }
    }
    return null;
  }

  /** Manifest slot declarations of active plugins (diagnostics / UI gating). */
  getSlotDeclarations(slot: SlotDeclaration["slot"]): { pluginId: string; decl: SlotDeclaration }[] {
    const out: { pluginId: string; decl: SlotDeclaration }[] = [];
    for (const entry of this.plugins.values()) {
      if (entry.state.status !== "active") continue;
      for (const decl of entry.plugin.manifest.slots) {
        if (decl.slot === slot) out.push({ pluginId: entry.state.id, decl });
      }
    }
    return out.sort((a, b) => (a.decl.order ?? 100) - (b.decl.order ?? 100));
  }

  /** Register every plugin, collecting states (host bootstrap helper). */
  registerAll(plugins: VytdlPlugin[]): PluginState[] {
    return plugins.map((p) => this.register(p));
  }
}

export const pluginRuntime = new PluginRegistry();
