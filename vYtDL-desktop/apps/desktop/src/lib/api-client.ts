"use client";

// Detect if running inside Tauri
function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window as any).__TAURI__ !== undefined ||
    (window as any).__TAURI_INTERNALS__ !== undefined
  );
}

// Lazy-load Tauri APIs
let tauriInvoke: (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null = null;
let tauriListen: ((event: string, handler: (payload: unknown) => void) => Promise<() => void>) | null = null;
let tauriConfirm: ((message: string, options?: unknown) => Promise<boolean>) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any

async function loadTauri() {
  if (!isTauri()) return;
  if (!tauriInvoke) {
    const core = await import("@tauri-apps/api/core");
    tauriInvoke = core.invoke;
  }
  if (!tauriListen) {
    const event = await import("@tauri-apps/api/event");
    tauriListen = (evt: string, handler: (payload: unknown) => void) =>
      event.listen(evt, (e: unknown) => handler((e as { payload: unknown }).payload));
  }
  if (!tauriConfirm) {
    try {
      const dialog = await import("@tauri-apps/plugin-dialog");
      tauriConfirm = dialog.confirm as any;
    } catch {
      // dialog plugin not available
    }
  }
}

// WebSocket for web mode
let ws: WebSocket | null = null;
let wsListeners: Map<string, ((data: unknown) => void)[]> = new Map();
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function ensureWebSocket() {
  if (isTauri() || ws?.readyState === WebSocket.OPEN) return;
  if (ws?.readyState === WebSocket.CONNECTING) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("[vYtDL] WebSocket connected");
  };

  ws.onmessage = (event) => {
    try {
      const { event: evtName, data } = JSON.parse(event.data);
      const listeners = wsListeners.get(evtName) || [];
      listeners.forEach((cb) => cb(data));
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    console.log("[vYtDL] WebSocket disconnected, reconnecting...");
    ws = null;
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(() => ensureWebSocket(), 3000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

// ── Public API ──

export async function apiInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  await loadTauri();

  if (tauriInvoke) {
    return tauriInvoke<T>(command, args);
  }

  // Web mode: HTTP API
  const endpoint = command.replace(/_/g, "-");
  const response = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function apiListen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  await loadTauri();

  if (tauriListen) {
    return tauriListen(event, handler as (payload: unknown) => void);
  }

  // Web mode: WebSocket
  ensureWebSocket();
  const listeners = wsListeners.get(event) || [];
  listeners.push(handler as (data: unknown) => void);
  wsListeners.set(event, listeners);

  return () => {
    const list = wsListeners.get(event) || [];
    wsListeners.set(
      event,
      list.filter((cb) => cb !== handler)
    );
  };
}

export async function apiConfirm(
  message: string,
  options?: { title?: string; kind?: string }
): Promise<boolean> {
  await loadTauri();

  if (tauriConfirm) {
    return tauriConfirm(message, options);
  }

  // Web mode: native confirm
  return window.confirm(message);
}

export function getPlatform(): string {
  if (typeof window === "undefined") return "unknown";
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "macos";
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

export async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

export interface VttReport {
  id: string;
  youtube_url: string;
  video_id: string | null;
  title: string | null;
  language: string | null;
  content: string;
  cue_count: number;
  duration_sec: number | null;
  created_at: string;
  status: "pending" | "processing" | "done" | "failed";
  error: string | null;
}

export async function startVttAnalysis(url: string): Promise<{ reportId: string }> {
  const res = await apiInvoke<{ success: boolean; data: { reportId: string } }>(
    "analyze-vtt",
    { url }
  );
  return res.data;
}

export async function getVttReport(id: string): Promise<VttReport> {
  const res = await apiFetch<{ success: boolean; data: VttReport }>(
    `/api/vtt-report/${id}`
  );
  return res.data;
}

export async function listVttReports(page = 1, limit = 20, lang?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (lang) params.set("lang", lang);
  const res = await apiFetch<{
    success: boolean;
    data: { reports: VttReport[]; total: number };
  }>(`/api/vtt-reports?${params}`);
  return res.data;
}

export async function deleteVttReport(id: string): Promise<void> {
  await apiInvoke("delete-vtt-report", { id });
}
