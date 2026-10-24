"use client";

// Base URL of the daemon API. Empty in production, where the API is served
// same-origin by `vytdl serve --static`; set in .env.development so a plain
// browser on the Next dev port can reach the daemon.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");

// ── Shell bridge (Electron preload) ──────────────────────────────────────────
// The desktop shell exposes window.vytdlShell via contextBridge. In a plain
// browser it is undefined and native-only actions degrade/hide.

export interface VytdlShellBridge {
  platform: string;
  versions: () => Promise<Record<string, string>>;
  revealFolder: (path: string) => Promise<void>;
  openFolder: (path: string) => Promise<void>;
  pickFolder: () => Promise<string | null>;
  clipboardWriteText: (text: string) => Promise<void>;
  detectTerminals: () => Promise<unknown>;
  listAgentProviders: () => Promise<unknown>;
  detectAgentClis: () => Promise<unknown>;
  launchAgentTerminal: (req: unknown) => Promise<unknown>;
}

export function shellBridge(): VytdlShellBridge | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { vytdlShell?: VytdlShellBridge }).vytdlShell) ?? null;
}

export function hasShellBridge(): boolean {
  return shellBridge() !== null;
}

// ── WebSocket progress bus ───────────────────────────────────────────────────

let ws: WebSocket | null = null;
let wsListeners: Map<string, ((data: unknown) => void)[]> = new Map();
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function ensureWebSocket() {
  if (ws?.readyState === WebSocket.OPEN) return;
  if (ws?.readyState === WebSocket.CONNECTING) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsOrigin = API_BASE ? API_BASE.replace(/^http/, "ws") : `${protocol}//${window.location.host}`;
  const wsUrl = `${wsOrigin}/api/ws`;

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
  args?: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<T> {
  const endpoint = command.replace(/_/g, "-");
  const response = await fetch(`${API_BASE}/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
    signal: options?.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    // Avoid dumping whole HTML error pages (e.g. a dev-server 404) into the UI
    const isJson = (response.headers.get("content-type") || "").includes("json");
    throw new Error(
      isJson ? text || `HTTP ${response.status}` : `API request failed (HTTP ${response.status} on /api/${endpoint})`
    );
  }

  return response.json();
}

export async function apiListen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
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
  _options?: { title?: string; kind?: string }
): Promise<boolean> {
  return window.confirm(message);
}

export function getPlatform(): string {
  const bridge = shellBridge();
  if (bridge) return bridge.platform;
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
  const res = await apiInvoke<{ success: boolean; data: { reportId: string }; error?: string }>(
    "analyze_vtt",
    { url }
  );
  if (!res.success || !res.data) {
    throw new Error(res.error || "Analysis failed");
  }
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
  const res = await apiInvoke<{ success: boolean; error?: string }>("delete_vtt_report", { id });
  if (!res.success) {
    throw new Error(res.error || "Delete failed");
  }
}
