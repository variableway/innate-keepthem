"use client";

// Slot mounts: host route files and layout render these; the registry decides
// what actually appears. A missing plugin renders the fallback, never a crash.

import * as React from "react";
import { pluginRuntime, type PluginState } from "./runtime";

/** Error boundary around one plugin-provided subtree: a crashing plugin is
 *  disabled and the host shows a recovery card instead of a white page. */
export class PluginErrorBoundary extends React.Component<
  { pluginId: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    pluginRuntime.disable(this.props.pluginId, `render error: ${error.message}`);
    console.error(`[plugins] ${this.props.pluginId} crashed:`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
          <p className="font-medium">Plugin error: {this.props.pluginId}</p>
          <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            The plugin has been disabled. Reload the page to retry, or start in safe mode
            (?safe-mode=1).
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function usePluginPage(route: string): { Component: React.ComponentType | null; ready: boolean } {
  const [state, setState] = React.useState(() => ({
    Component: pluginRuntime.getPage(route),
    ready: pluginRuntime.list().length > 0,
  }));

  React.useEffect(() => {
    // registration happens at module init (static plugin imports); one tick is
    // enough — re-read in case this component mounted before registration.
    setState({
      Component: pluginRuntime.getPage(route),
      ready: pluginRuntime.list().length > 0,
    });
  }, [route]);

  return state;
}

/** Mount point for a plugin-owned route page. */
export function PluginPage({
  route,
  pluginId,
  fallback,
}: {
  route: string;
  /** owning plugin id, for error isolation */
  pluginId?: string;
  fallback?: React.ReactNode;
}) {
  const { Component } = usePluginPage(route);
  if (!Component) {
    return (
      <>{fallback ?? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          No plugin provides this page.
        </div>
      )}</>
    );
  }
  const Wrapped = Component;
  if (pluginId) {
    return (
      <PluginErrorBoundary pluginId={pluginId}>
        <Wrapped />
      </PluginErrorBoundary>
    );
  }
  return <Wrapped />;
}

/** Live plugin states for management/recovery UIs. */
export function usePluginStates(): PluginState[] {
  const [states, setStates] = React.useState<PluginState[]>(() => pluginRuntime.list());
  React.useEffect(() => {
    const sync = () => setStates(pluginRuntime.list());
    sync();
    return pluginRuntime.subscribe(sync);
  }, []);
  return states;
}

export function isSafeMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has("safe-mode")) return true;
  return window.localStorage.getItem("vytdl-safe-mode") === "1";
}
