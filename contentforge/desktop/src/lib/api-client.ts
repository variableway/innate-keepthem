/**
 * ContentForge API Client
 * 统一抽象层：Tauri IPC (桌面端) ↔ HTTP API (Web端)
 *
 * 设计原则：
 * - 同一套接口，自动适配运行环境
 * - 支持请求拦截、响应处理、错误统一
 * - 与 Zustand Store 解耦，通过 setXxxApiClient 注入
 */

import { invoke } from "@tauri-apps/api/core";

// ─────────────────────────── 环境检测 ───────────────────────────

/** 检测是否在 Tauri 环境中运行 */
function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).__TAURI__;
}

// ─────────────────────────── 配置 ───────────────────────────

interface ApiClientConfig {
  /** 基础 URL（Web 模式使用） */
  baseUrl: string;
  /** 请求超时（毫秒） */
  timeout: number;
  /** 重试次数 */
  retries: number;
  /** 请求头 */
  headers: Record<string, string>;
}

const DEFAULT_CONFIG: ApiClientConfig = {
  baseUrl: "http://localhost:3000/api",
  timeout: 30000,
  retries: 2,
  headers: {
    "Content-Type": "application/json",
  },
};

let globalConfig: ApiClientConfig = { ...DEFAULT_CONFIG };

export function configureApiClient(config: Partial<ApiClientConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

// ─────────────────────────── 核心 API 调用 ───────────────────────────

/**
 * 统一 API 调用
 * Desktop 模式：调用 Tauri IPC
 * Web 模式：调用 HTTP API
 */
export async function apiInvoke<T>(command: string, args?: unknown): Promise<T> {
  if (isTauri()) {
    // Tauri IPC 模式
    try {
      const result = await invoke<T>(command, args as Record<string, unknown>);
      return result;
    } catch (error) {
      throw normalizeError(error);
    }
  } else {
    // Web HTTP 模式
    return httpRequest<T>(command, args);
  }
}

/**
 * HTTP 请求实现（Web 模式）
 */
async function httpRequest<T>(command: string, args?: unknown): Promise<T> {
  const url = `${globalConfig.baseUrl}/${command}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), globalConfig.timeout);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= globalConfig.retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: globalConfig.headers,
        body: args ? JSON.stringify(args) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData
        );
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      lastError = normalizeError(error);
      if (attempt < globalConfig.retries) {
        // 指数退避重试
        await delay(1000 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error("请求失败");
}

/**
 * 统一事件监听
 * Desktop 模式：Tauri Event
 * Web 模式：WebSocket
 */
export function apiListen(event: string, handler: (payload: unknown) => void): () => void {
  if (isTauri()) {
    // Tauri Event 模式
    return listenTauriEvent(event, handler);
  } else {
    // WebSocket 模式
    return wsClient.subscribe(event, handler);
  }
}

// ─────────────────────────── 错误处理 ───────────────────────────

export class ApiError extends Error {
  statusCode: number;
  data: unknown;

  constructor(message: string, statusCode: number = 0, data: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("未知错误");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────── Tauri 事件监听 ───────────────────────────

let tauriListen: typeof import("@tauri-apps/api/event").listen | null = null;

async function listenTauriEvent(event: string, handler: (payload: unknown) => void): Promise<() => void> {
  if (!tauriListen) {
    const { listen } = await import("@tauri-apps/api/event");
    tauriListen = listen;
  }
  const unlisten = await tauriListen(event, (event) => {
    handler(event.payload);
  });
  return unlisten;
}

// ─────────────────────────── WebSocket 客户端 ───────────────────────────

class WebSocketClient {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, Set<(payload: unknown) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private url: string;
  private isConnecting = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        // 触发连接成功事件
        this.broadcast("ws.connected", {});
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type && data.payload !== undefined) {
            this.broadcast(data.type, data.payload);
          }
        } catch {
          // 非 JSON 消息，忽略
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
      };
    } catch {
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  subscribe(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event)!.add(handler);

    // 确保连接
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    }

    return () => {
      this.subscribers.get(event)?.delete(handler);
    };
  }

  send(type: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  private broadcast(type: string, payload: unknown): void {
    this.subscribers.get(type)?.forEach((handler) => {
      try {
        handler(payload);
      } catch {
        // 忽略订阅者错误
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.broadcast("ws.error", { message: "WebSocket 连接失败，请刷新页面重试" });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => this.connect(), delay);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// 全局 WebSocket 客户端实例
const wsClient = new WebSocketClient("ws://localhost:3000/ws");

// 导出 WebSocket 客户端供外部使用
export { wsClient };

// ─────────────────────────── 初始化 Store API 客户端 ───────────────────────────

import { setChatApiClient } from "../store/chatStore";
import { setAgentApiClient } from "../store/agentStore";
import { setAssetApiClient } from "../store/assetStore";
import { setDownloadApiClient } from "../store/downloadStore";

/** 初始化所有 Store 的 API 客户端 */
export function initApiClients(): void {
  setChatApiClient(apiInvoke, apiListen);
  setAgentApiClient(apiInvoke);
  setAssetApiClient(apiInvoke);
  setDownloadApiClient(apiInvoke, apiListen);
}

// 自动初始化（在应用启动时调用）
if (typeof window !== "undefined") {
  initApiClients();
}

// ─────────────────────────── 使用示例 ───────────────────────────

/**
 * 使用示例：
 *
 * ```typescript
 * import { apiInvoke, apiListen, wsClient } from "./api-client";
 *
 * // 发送请求
 * const sessions = await apiInvoke<{ sessions: ChatSession[] }>("get_chat_sessions");
 *
 * // 监听事件
 * const unsubscribe = apiListen("message.delta", (payload) => {
 *   console.log("收到消息增量:", payload);
 * });
 *
 * // 手动发送 WebSocket 消息
 * wsClient.send("ping", { timestamp: Date.now() });
 *
 * // 清理订阅
 * unsubscribe();
 * ```
 */
