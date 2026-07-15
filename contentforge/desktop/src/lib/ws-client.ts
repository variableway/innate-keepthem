/**
 * ContentForge WebSocket 客户端
 * 专门处理 Chat 相关的流式通信
 *
 * 特性：
 * - 自动重连
 * - 心跳检测
 * - 事件订阅/发布
 * - 与 chatStore 集成
 */

import { WSEvent, StreamChunk } from "../types/chat";

// ─────────────────────────── 配置 ───────────────────────────

interface WSClientConfig {
  url: string;
  heartbeatInterval: number;
  reconnectInterval: number;
  maxReconnectAttempts: number;
}

const DEFAULT_CONFIG: WSClientConfig = {
  url: "ws://localhost:3000/ws",
  heartbeatInterval: 30000,
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
};

// ─────────────────────────── 事件类型 ───────────────────────────

type WSConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

type WSEventHandler = (event: WSEvent) => void;
type WSStatusHandler = (status: WSConnectionStatus) => void;

// ─────────────────────────── WebSocket 客户端 ───────────────────────────

export class ChatWebSocketClient {
  private ws: WebSocket | null = null;
  private config: WSClientConfig;
  private status: WSConnectionStatus = "disconnected";
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventHandlers: Map<string, Set<WSEventHandler>> = new Map();
  private statusHandlers: Set<WSStatusHandler> = new Set();
  private pendingMessages: string[] = [];
  private sessionId: string | null = null;

  constructor(config?: Partial<WSClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─────────────────── 连接管理 ───────────────────

  connect(sessionId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    this.sessionId = sessionId || this.sessionId;
    this.setStatus("connecting");

    try {
      const url = this.sessionId
        ? `${this.config.url}?sessionId=${this.sessionId}`
        : this.config.url;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus("connected");
        this.startHeartbeat();

        // 发送待处理消息
        while (this.pendingMessages.length > 0) {
          const msg = this.pendingMessages.shift();
          if (msg) this.ws?.send(msg);
        }

        // 发送会话绑定消息
        if (this.sessionId) {
          this.sendRaw(
            JSON.stringify({
              type: "session.bind",
              payload: { sessionId: this.sessionId },
            })
          );
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        if (!event.wasClean) {
          this.setStatus("reconnecting");
          this.scheduleReconnect();
        } else {
          this.setStatus("disconnected");
        }
      };

      this.ws.onerror = () => {
        this.setStatus("error");
      };
    } catch (error) {
      this.setStatus("error");
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.ws?.close(1000, "Client disconnect");
    this.ws = null;
    this.setStatus("disconnected");
  }

  reconnect(): void {
    this.disconnect();
    this.connect();
  }

  // ─────────────────── 消息发送 ───────────────────

  send(event: WSEvent): void {
    const message = JSON.stringify(event);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.pendingMessages.push(message);
      if (this.status !== "connecting") {
        this.connect();
      }
    }
  }

  sendChatMessage(sessionId: string, message: string, options?: Record<string, unknown>): void {
    this.send({
      type: "chat.send",
      sessionId,
      payload: {
        message,
        ...options,
      },
      timestamp: new Date().toISOString(),
    });
  }

  sendToolConfirm(messageId: string, callId: string, approved: boolean): void {
    this.send({
      type: "tool.confirm",
      sessionId: this.sessionId || "",
      payload: {
        messageId,
        callId,
        approved,
      },
      timestamp: new Date().toISOString(),
    });
  }

  sendCancelStream(messageId: string): void {
    this.send({
      type: "stream.cancel",
      sessionId: this.sessionId || "",
      payload: { messageId },
      timestamp: new Date().toISOString(),
    });
  }

  private sendRaw(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  // ─────────────────── 事件订阅 ───────────────────

  onEvent(eventType: string, handler: WSEventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  onStatusChange(handler: WSStatusHandler): () => void {
    this.statusHandlers.add(handler);
    // 立即通知当前状态
    handler(this.status);

    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  // ─────────────────── 消息处理 ───────────────────

  private handleMessage(data: string): void {
    try {
      const event = JSON.parse(data) as WSEvent;

      // 验证事件结构
      if (!event.type || !event.payload) {
        console.warn("[WS] Invalid event structure:", data);
        return;
      }

      // 分发到具体处理器
      const handlers = this.eventHandlers.get(event.type);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(event);
          } catch (err) {
            console.error("[WS] Event handler error:", err);
          }
        });
      }

      // 也分发到通配符处理器
      const wildcardHandlers = this.eventHandlers.get("*");
      if (wildcardHandlers) {
        wildcardHandlers.forEach((handler) => {
          try {
            handler(event);
          } catch (err) {
            console.error("[WS] Wildcard handler error:", err);
          }
        });
      }
    } catch (error) {
      console.error("[WS] Message parse error:", error);
    }
  }

  // ─────────────────── 心跳检测 ───────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw(
        JSON.stringify({
          type: "ping",
          payload: { timestamp: Date.now() },
        })
      );
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─────────────────── 重连机制 ───────────────────

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setStatus("error");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, Math.min(delay, 30000)); // 最大 30 秒
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─────────────────── 状态管理 ───────────────────

  private setStatus(status: WSConnectionStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => {
      try {
        handler(status);
      } catch {
        // 忽略状态处理器错误
      }
    });
  }

  get connectionStatus(): WSConnectionStatus {
    return this.status;
  }

  get isConnected(): boolean {
    return this.status === "connected";
  }

  get isReconnecting(): boolean {
    return this.status === "reconnecting";
  }

  // ─────────────────── 会话管理 ───────────────────

  bindSession(sessionId: string): void {
    this.sessionId = sessionId;
    if (this.isConnected) {
      this.sendRaw(
        JSON.stringify({
          type: "session.bind",
          payload: { sessionId },
        })
      );
    }
  }

  unbindSession(): void {
    this.sessionId = null;
  }
}

// ─────────────────────────── 全局实例 ───────────────────────────

let globalClient: ChatWebSocketClient | null = null;

export function getWebSocketClient(config?: Partial<WSClientConfig>): ChatWebSocketClient {
  if (!globalClient) {
    globalClient = new ChatWebSocketClient(config);
  }
  return globalClient;
}

export function resetWebSocketClient(): void {
  globalClient?.disconnect();
  globalClient = null;
}

// ─────────────────────────── 与 chatStore 集成辅助函数 ───────────────────────────

import { useChatStore } from "../store/chatStore";

/** 初始化 WebSocket 并绑定到 chatStore */
export function initChatWebSocket(sessionId?: string): ChatWebSocketClient {
  const client = getWebSocketClient();

  // 订阅所有事件并转发到 chatStore
  client.onEvent("*", (event) => {
    useChatStore.getState().handleWSEvent(event);
  });

  // 连接状态同步
  client.onStatusChange((status) => {
    useChatStore.getState().setWsConnected(status === "connected");
  });

  client.connect(sessionId);
  return client;
}

// ─────────────────────────── 使用示例 ───────────────────────────

/**
 * 使用示例：
 *
 * ```typescript
 * import { getWebSocketClient, initChatWebSocket } from "./ws-client";
 *
 * // 初始化并绑定到 chatStore
 * const client = initChatWebSocket("session-123");
 *
 * // 发送消息
 * client.sendChatMessage("session-123", "分析这个视频", {
 *   agentId: "content_analyst",
 *   selectedAssetIds: ["asset-1"],
 * });
 *
 * // 监听特定事件
 * const unsubscribe = client.onEvent("message.delta", (event) => {
 *   console.log("收到增量:", event.payload);
 * });
 *
 * // 监听连接状态
 * const unsubStatus = client.onStatusChange((status) => {
 *   console.log("连接状态:", status);
 * });
 *
 * // 清理
 * unsubscribe();
 * unsubStatus();
 * client.disconnect();
 * ```
 */
