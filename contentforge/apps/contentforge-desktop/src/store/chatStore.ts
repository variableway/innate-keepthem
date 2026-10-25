/**
 * ContentForge Chat Store
 * 基于 Zustand，管理会话、消息、流式响应、工具调用
 *
 * 特性：
 * - WebSocket 实时通信集成
 * - 流式响应状态管理
 * - 工具调用卡片状态机
 * - 乐观更新 + 错误回滚
 */

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  ChatSession,
  ChatMessage,
  MessageStatus,
  ToolCall,
  ToolCallStatus,
  ToolResult,
  SendMessageOptions,
  WSEvent,
  MessageDeltaPayload,
  MessageCompletedPayload,
  ToolCallStartPayload,
  ToolCallProgressPayload,
  ToolCallCompletedPayload,
  AgentSwitchedPayload,
  StreamChunk,
} from "../types/chat";
import { useAgentStore } from "./agentStore";
import { useAssetStore } from "./assetStore";

// ─────────────────────────── 状态定义 ───────────────────────────

interface ChatState {
  // 会话列表
  sessions: ChatSession[];
  // 当前会话ID
  currentSessionId: string | null;
  // 消息缓存（按 sessionId 分组）
  messagesBySession: Map<string, ChatMessage[]>;
  // 工具调用缓存（按 messageId 分组）
  toolCallsByMessage: Map<string, ToolCall[]>;
  // 发送中状态
  isSending: boolean;
  // 流式响应中状态
  isStreaming: boolean;
  // 当前流式消息ID
  streamingMessageId: string | null;
  // 错误状态
  error: string | null;
  // WebSocket 连接状态
  wsConnected: boolean;
  // 加载状态
  isLoadingSessions: boolean;
  isLoadingHistory: boolean;
  // 是否还有更多历史消息
  hasMoreHistory: boolean;
}

interface ChatActions {
  // 会话管理
  loadSessions: () => Promise<void>;
  createSession: (agentId: string, title?: string) => Promise<string>;
  switchSession: (sessionId: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  pinSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;

  // 消息操作
  sendMessage: (text: string, options?: SendMessageOptions) => Promise<void>;
  cancelStream: () => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;

  // 流式响应处理
  handleStreamChunk: (chunk: StreamChunk) => void;
  handleStreamDone: (messageId: string) => void;
  handleStreamError: (messageId: string, error: string) => void;

  // 工具调用处理
  handleToolCallStart: (payload: ToolCallStartPayload) => void;
  handleToolCallProgress: (payload: ToolCallProgressPayload) => void;
  handleToolCallCompleted: (payload: ToolCallCompletedPayload) => void;
  handleToolCallFailed: (messageId: string, callId: string, error: string) => void;

  // Agent 切换处理
  handleAgentSwitched: (payload: AgentSwitchedPayload) => void;

  // WebSocket 事件处理
  handleWSEvent: (event: WSEvent) => void;
  setWsConnected: (connected: boolean) => void;

  // 工具调用确认（用户交互）
  confirmToolCall: (messageId: string, callId: string, approved: boolean) => Promise<void>;

  // 加载历史消息
  loadHistory: (sessionId: string, cursor?: string) => Promise<void>;

  // 清除错误
  clearError: () => void;
}

// ─────────────────────────── 辅助函数 ───────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ─────────────────────────── API 调用（占位，实际由 api-client 提供）

// 这些函数将在 api-client.ts 中实现
// 这里使用类型声明，实际运行时注入
let apiInvoke: <T>(command: string, args?: unknown) => Promise<T>;
let apiListen: (event: string, handler: (payload: unknown) => void) => () => void;

export function setChatApiClient(
  invoke: <T>(command: string, args?: unknown) => Promise<T>,
  listen: (event: string, handler: (payload: unknown) => void) => () => void
) {
  apiInvoke = invoke;
  apiListen = listen;
}

// ─────────────────────────── Store 实现 ───────────────────────────

export const useChatStore = create<ChatState & ChatActions>()(
  devtools(
    immer((set, get) => ({
      // ─────────────────── 初始状态 ───────────────────
      sessions: [],
      currentSessionId: null,
      messagesBySession: new Map(),
      toolCallsByMessage: new Map(),
      isSending: false,
      isStreaming: false,
      streamingMessageId: null,
      error: null,
      wsConnected: false,
      isLoadingSessions: false,
      isLoadingHistory: false,
      hasMoreHistory: true,

      // ─────────────────── 会话管理 ───────────────────

      loadSessions: async () => {
        set((state) => {
          state.isLoadingSessions = true;
        });
        try {
          const response = await apiInvoke<{ sessions: ChatSession[] }>("get_chat_sessions");
          set((state) => {
            state.sessions = response.sessions;
            state.isLoadingSessions = false;
          });
        } catch (err) {
          set((state) => {
            state.error = err instanceof Error ? err.message : "加载会话失败";
            state.isLoadingSessions = false;
          });
        }
      },

      createSession: async (agentId: string, title?: string) => {
        const sessionId = generateId();
        const newSession: ChatSession = {
          id: sessionId,
          title: title || "新会话",
          agentId,
          status: "active",
          linkedAssetIds: [],
          createdAt: now(),
          updatedAt: now(),
        };

        // 乐观更新
        set((state) => {
          state.sessions.unshift(newSession);
          state.currentSessionId = sessionId;
          state.messagesBySession.set(sessionId, []);
        });

        try {
          await apiInvoke("create_chat_session", {
            sessionId,
            agentId,
            title: newSession.title,
          });
          return sessionId;
        } catch (err) {
          // 回滚
          set((state) => {
            state.sessions = state.sessions.filter((s) => s.id !== sessionId);
            if (state.currentSessionId === sessionId) {
              state.currentSessionId = state.sessions[0]?.id || null;
            }
            state.messagesBySession.delete(sessionId);
            state.error = err instanceof Error ? err.message : "创建会话失败";
          });
          throw err;
        }
      },

      switchSession: async (sessionId: string) => {
        const currentId = get().currentSessionId;
        if (currentId === sessionId) return;

        set((state) => {
          state.currentSessionId = sessionId;
          state.error = null;
        });

        // 如果消息未加载，加载历史
        if (!get().messagesBySession.has(sessionId)) {
          await get().loadHistory(sessionId);
        }
      },

      archiveSession: async (sessionId: string) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) {
            session.status = "archived";
            session.updatedAt = now();
          }
        });
        try {
          await apiInvoke("archive_chat_session", { sessionId });
        } catch (err) {
          set((state) => {
            const session = state.sessions.find((s) => s.id === sessionId);
            if (session) {
              session.status = "active";
            }
            state.error = err instanceof Error ? err.message : "归档会话失败";
          });
        }
      },

      pinSession: async (sessionId: string) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) {
            session.status = session.status === "pinned" ? "active" : "pinned";
            session.updatedAt = now();
          }
        });
        try {
          await apiInvoke("pin_chat_session", { sessionId });
        } catch {
          // 静默失败，不影响用户体验
        }
      },

      updateSessionTitle: async (sessionId: string, title: string) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) {
            session.title = title;
            session.updatedAt = now();
          }
        });
        try {
          await apiInvoke("update_chat_session_title", { sessionId, title });
        } catch {
          // 静默失败
        }
      },

      deleteSession: async (sessionId: string) => {
        const previousSessions = get().sessions;
        const previousMessages = get().messagesBySession;

        set((state) => {
          state.sessions = state.sessions.filter((s) => s.id !== sessionId);
          state.messagesBySession.delete(sessionId);
          if (state.currentSessionId === sessionId) {
            state.currentSessionId = state.sessions.find((s) => s.status === "active")?.id || null;
          }
        });

        try {
          await apiInvoke("delete_chat_session", { sessionId });
        } catch (err) {
          // 回滚
          set((state) => {
            state.sessions = previousSessions;
            state.messagesBySession = previousMessages;
            state.currentSessionId = sessionId;
            state.error = err instanceof Error ? err.message : "删除会话失败";
          });
        }
      },

      // ─────────────────── 消息操作 ───────────────────

      sendMessage: async (text: string, options?: SendMessageOptions) => {
        const state = get();
        const sessionId = options?.agentId
          ? state.currentSessionId || (await get().createSession(options.agentId))
          : state.currentSessionId;

        if (!sessionId) {
          // 没有会话，创建默认会话
          const defaultAgentId = useAgentStore.getState().currentAgentId;
          const newSessionId = await get().createSession(defaultAgentId);
          return get().sendMessage(text, { ...options, agentId: defaultAgentId });
        }

        const userMessageId = generateId();
        const assistantMessageId = generateId();

        const userMessage: ChatMessage = {
          id: userMessageId,
          sessionId,
          role: "user",
          content: text,
          selectedAssetIds: options?.selectedAssetIds || useAssetStore.getState().selection.selectedIds,
          status: "completed",
          createdAt: now(),
          updatedAt: now(),
        };

        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          sessionId,
          role: "assistant",
          content: "",
          status: "streaming",
          createdAt: now(),
          updatedAt: now(),
        };

        // 乐观更新：添加用户消息 + 占位助手消息
        set((state) => {
          const messages = state.messagesBySession.get(sessionId) || [];
          messages.push(userMessage, assistantMessage);
          state.messagesBySession.set(sessionId, messages);
          state.isSending = true;
          state.isStreaming = true;
          state.streamingMessageId = assistantMessageId;
          state.error = null;
        });

        try {
          const response = await apiInvoke<{ messageId: string; status: string }>("chat_send", {
            sessionId,
            message: text,
            agentId: options?.agentId,
            selectedAssetIds: userMessage.selectedAssetIds,
            attachments: options?.attachments,
            streaming: options?.streaming ?? true,
          });

          if (response.status !== "accepted") {
            throw new Error("消息发送被拒绝");
          }

          set((state) => {
            state.isSending = false;
          });
        } catch (err) {
          // 更新助手消息为失败状态
          set((state) => {
            const messages = state.messagesBySession.get(sessionId) || [];
            const assistantMsg = messages.find((m) => m.id === assistantMessageId);
            if (assistantMsg) {
              assistantMsg.status = "failed";
              assistantMsg.error = err instanceof Error ? err.message : "发送失败";
            }
            state.isSending = false;
            state.isStreaming = false;
            state.streamingMessageId = null;
            state.error = err instanceof Error ? err.message : "发送失败";
          });
        }
      },

      cancelStream: async () => {
        const streamingMessageId = get().streamingMessageId;
        if (!streamingMessageId) return;

        try {
          await apiInvoke("cancel_chat_stream", { messageId: streamingMessageId });
        } catch {
          // 静默失败
        }

        set((state) => {
          const messages = state.messagesBySession.get(state.currentSessionId || "") || [];
          const msg = messages.find((m) => m.id === streamingMessageId);
          if (msg) {
            msg.status = "cancelled";
            msg.updatedAt = now();
          }
          state.isStreaming = false;
          state.streamingMessageId = null;
        });
      },

      retryMessage: async (messageId: string) => {
        const state = get();
        const sessionId = state.currentSessionId;
        if (!sessionId) return;

        const messages = state.messagesBySession.get(sessionId) || [];
        const failedMessage = messages.find((m) => m.id === messageId);
        if (!failedMessage || failedMessage.role !== "assistant") return;

        // 找到对应的用户消息（前一个消息）
        const msgIndex = messages.findIndex((m) => m.id === messageId);
        const userMessage = messages[msgIndex - 1];
        if (!userMessage || userMessage.role !== "user") return;

        // 重置状态并重试
        set((state) => {
          failedMessage.status = "streaming";
          failedMessage.content = "";
          failedMessage.error = undefined;
          failedMessage.toolCalls = undefined;
          failedMessage.toolResults = undefined;
          state.isStreaming = true;
          state.streamingMessageId = messageId;
          state.error = null;
        });

        try {
          await apiInvoke("chat_retry", {
            sessionId,
            messageId,
            message: userMessage.content,
            selectedAssetIds: userMessage.selectedAssetIds,
          });
        } catch (err) {
          set((state) => {
            failedMessage.status = "failed";
            failedMessage.error = err instanceof Error ? err.message : "重试失败";
            state.isStreaming = false;
            state.streamingMessageId = null;
          });
        }
      },

      deleteMessage: async (messageId: string) => {
        const sessionId = get().currentSessionId;
        if (!sessionId) return;

        set((state) => {
          const messages = state.messagesBySession.get(sessionId) || [];
          state.messagesBySession.set(
            sessionId,
            messages.filter((m) => m.id !== messageId)
          );
        });

        try {
          await apiInvoke("delete_chat_message", { sessionId, messageId });
        } catch {
          // 静默失败
        }
      },

      // ─────────────────── 流式响应处理 ───────────────────

      handleStreamChunk: (chunk: StreamChunk) => {
        const sessionId = get().currentSessionId;
        if (!sessionId) return;

        set((state) => {
          const messages = state.messagesBySession.get(sessionId) || [];
          const message = messages.find((m) => m.id === chunk.messageId);
          if (!message) return;

          switch (chunk.type) {
            case "text":
              if (chunk.text) {
                message.content += chunk.text;
                message.delta = chunk.text;
              }
              break;

            case "tool_call":
              if (chunk.toolCall) {
                if (!message.toolCalls) message.toolCalls = [];
                message.toolCalls.push(chunk.toolCall);
              }
              break;

            case "tool_result":
              if (chunk.toolResult) {
                if (!message.toolResults) message.toolResults = [];
                message.toolResults.push(chunk.toolResult);
                // 更新对应 toolCall 状态
                const tc = message.toolCalls?.find((t) => t.id === chunk.toolResult!.callId);
                if (tc) {
                  tc.status = chunk.toolResult.error ? "failed" : "completed";
                  tc.result = chunk.toolResult.output;
                  tc.error = chunk.toolResult.error;
                  tc.completedAt = now();
                  tc.durationMs = chunk.toolResult.durationMs;
                }
              }
              break;

            case "error":
              message.status = "failed";
              message.error = chunk.error || "流式响应错误";
              state.isStreaming = false;
              state.streamingMessageId = null;
              break;

            case "done":
              message.status = "completed";
              state.isStreaming = false;
              state.streamingMessageId = null;
              break;
          }

          message.updatedAt = now();
        });
      },

      handleStreamDone: (messageId: string) => {
        const sessionId = get().currentSessionId;
        if (!sessionId) return;

        set((state) => {
          const messages = state.messagesBySession.get(sessionId) || [];
          const message = messages.find((m) => m.id === messageId);
          if (message) {
            message.status = "completed";
            message.updatedAt = now();
          }
          state.isStreaming = false;
          state.streamingMessageId = null;
        });
      },

      handleStreamError: (messageId: string, error: string) => {
        const sessionId = get().currentSessionId;
        if (!sessionId) return;

        set((state) => {
          const messages = state.messagesBySession.get(sessionId) || [];
          const message = messages.find((m) => m.id === messageId);
          if (message) {
            message.status = "failed";
            message.error = error;
            message.updatedAt = now();
          }
          state.isStreaming = false;
          state.streamingMessageId = null;
          state.error = error;
        });
      },

      // ─────────────────── 工具调用处理 ───────────────────

      handleToolCallStart: (payload: ToolCallStartPayload) => {
        set((state) => {
          const messages = state.messagesBySession.get(state.currentSessionId || "") || [];
          const message = messages.find((m) => m.id === payload.messageId);
          if (!message) return;

          if (!message.toolCalls) message.toolCalls = [];
          message.toolCalls.push({
            ...payload.toolCall,
            status: "running",
            startedAt: now(),
          });
        });
      },

      handleToolCallProgress: (payload: ToolCallProgressPayload) => {
        set((state) => {
          const messages = state.messagesBySession.get(state.currentSessionId || "") || [];
          const message = messages.find((m) => m.id === payload.messageId);
          if (!message || !message.toolCalls) return;

          const toolCall = message.toolCalls.find((t) => t.id === payload.callId);
          if (toolCall) {
            // 可扩展：添加进度字段到 ToolCall
            (toolCall as unknown as Record<string, unknown>).progress = payload.progress;
          }
        });
      },

      handleToolCallCompleted: (payload: ToolCallCompletedPayload) => {
        set((state) => {
          const messages = state.messagesBySession.get(state.currentSessionId || "") || [];
          const message = messages.find((m) => m.id === payload.messageId);
          if (!message || !message.toolCalls) return;

          const toolCall = message.toolCalls.find((t) => t.id === payload.callId);
          if (toolCall) {
            toolCall.status = "completed";
            toolCall.result = payload.result;
            toolCall.completedAt = now();
            toolCall.durationMs = payload.durationMs;
          }

          if (!message.toolResults) message.toolResults = [];
          message.toolResults.push({
            callId: payload.callId,
            name: toolCall?.name || "",
            output: payload.result,
            durationMs: payload.durationMs,
          });
        });
      },

      handleToolCallFailed: (messageId: string, callId: string, error: string) => {
        set((state) => {
          const messages = state.messagesBySession.get(state.currentSessionId || "") || [];
          const message = messages.find((m) => m.id === messageId);
          if (!message || !message.toolCalls) return;

          const toolCall = message.toolCalls.find((t) => t.id === callId);
          if (toolCall) {
            toolCall.status = "failed";
            toolCall.error = error;
            toolCall.completedAt = now();
          }
        });
      },

      // ─────────────────── Agent 切换处理 ───────────────────

      handleAgentSwitched: (payload: AgentSwitchedPayload) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === state.currentSessionId);
          if (session) {
            session.agentId = payload.currentAgentId;
            session.updatedAt = now();
          }
        });

        // 同步更新 AgentStore
        useAgentStore.getState().setCurrentAgentId(payload.currentAgentId, payload.reason);
      },

      // ─────────────────── WebSocket 事件处理 ───────────────────

      handleWSEvent: (event: WSEvent) => {
        switch (event.type) {
          case "message.delta":
            get().handleStreamChunk({
              type: "text",
              messageId: (event.payload as MessageDeltaPayload).messageId,
              text: (event.payload as MessageDeltaPayload).delta,
            });
            break;

          case "message.completed":
            get().handleStreamDone((event.payload as MessageCompletedPayload).messageId);
            break;

          case "message.failed":
            get().handleStreamError(
              (event.payload as { messageId: string; error: string }).messageId,
              (event.payload as { messageId: string; error: string }).error
            );
            break;

          case "tool.call.start":
            get().handleToolCallStart(event.payload as ToolCallStartPayload);
            break;

          case "tool.call.progress":
            get().handleToolCallProgress(event.payload as ToolCallProgressPayload);
            break;

          case "tool.call.completed":
            get().handleToolCallCompleted(event.payload as ToolCallCompletedPayload);
            break;

          case "tool.call.failed":
            get().handleToolCallFailed(
              (event.payload as { messageId: string; callId: string; error: string }).messageId,
              (event.payload as { messageId: string; callId: string; error: string }).callId,
              (event.payload as { messageId: string; callId: string; error: string }).error
            );
            break;

          case "agent.switched":
            get().handleAgentSwitched(event.payload as AgentSwitchedPayload);
            break;

          case "error":
            set((state) => {
              state.error = (event.payload as { message: string }).message || "WebSocket 错误";
            });
            break;
        }
      },

      setWsConnected: (connected: boolean) => {
        set((state) => {
          state.wsConnected = connected;
        });
      },

      // ─────────────────── 工具调用确认 ───────────────────

      confirmToolCall: async (messageId: string, callId: string, approved: boolean) => {
        try {
          await apiInvoke("confirm_tool_call", {
            messageId,
            callId,
            approved,
          });
        } catch (err) {
          set((state) => {
            state.error = err instanceof Error ? err.message : "确认失败";
          });
        }
      },

      // ─────────────────── 加载历史消息 ───────────────────

      loadHistory: async (sessionId: string, cursor?: string) => {
        set((state) => {
          state.isLoadingHistory = true;
        });

        try {
          const response = await apiInvoke<{
            messages: ChatMessage[];
            hasMore: boolean;
            nextCursor?: string;
          }>("get_chat_history", { sessionId, cursor });

          set((state) => {
            const existing = state.messagesBySession.get(sessionId) || [];
            // 新消息在前（历史消息），或根据时间合并
            const merged = cursor
              ? [...response.messages, ...existing]
              : [...existing, ...response.messages];
            // 去重
            const seen = new Set<string>();
            const deduped = merged.filter((m) => {
              if (seen.has(m.id)) return false;
              seen.add(m.id);
              return true;
            });
            state.messagesBySession.set(sessionId, deduped);
            state.hasMoreHistory = response.hasMore;
            state.isLoadingHistory = false;
          });
        } catch (err) {
          set((state) => {
            state.error = err instanceof Error ? err.message : "加载历史失败";
            state.isLoadingHistory = false;
          });
        }
      },

      clearError: () => {
        set((state) => {
          state.error = null;
        });
      },
    })),
    { name: "chat-store" }
  )
);

// ─────────────────────────── Selector Hooks ───────────────────────────

/** 获取当前会话的消息列表 */
export function useCurrentMessages(): ChatMessage[] {
  return useChatStore((state) => {
    const sessionId = state.currentSessionId;
    return sessionId ? state.messagesBySession.get(sessionId) || [] : [];
  });
}

/** 获取当前会话 */
export function useCurrentSession(): ChatSession | null {
  return useChatStore((state) => {
    return state.sessions.find((s) => s.id === state.currentSessionId) || null;
  });
}

/** 获取流式消息 */
export function useStreamingMessage(): ChatMessage | null {
  return useChatStore((state) => {
    if (!state.streamingMessageId) return null;
    const sessionId = state.currentSessionId;
    if (!sessionId) return null;
    const messages = state.messagesBySession.get(sessionId) || [];
    return messages.find((m) => m.id === state.streamingMessageId) || null;
  });
}

/** 获取当前会话的工具调用 */
export function useCurrentToolCalls(): ToolCall[] {
  return useChatStore((state) => {
    const sessionId = state.currentSessionId;
    if (!sessionId) return [];
    const messages = state.messagesBySession.get(sessionId) || [];
    return messages.flatMap((m) => m.toolCalls || []);
  });
}
