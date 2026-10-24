"use client";

import { create } from "zustand";
import type { AgentId, AssetContextPayload, ChatMessage, MediaAsset } from "@/types";
import { buildAssetContext, loadMediaAssets } from "@/lib/media-assets";

function newId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mockReply(
  message: string,
  assets: AssetContextPayload[],
): string {
  const assetList =
    assets.length > 0
      ? assets.map((a) => `- **${a.title}** (${a.type})`).join("\n")
      : "_No assets selected — attach context from the left panel._";

  return `**[Mock Agent]** This is a placeholder response.\n\n**Your question:** ${message}\n\n**Selected context:**\n${assetList}\n\n_Real Kimi CLI integration will replace this in step C._`;
}

interface ChatState {
  sessionId: string;
  messages: ChatMessage[];
  assets: MediaAsset[];
  selectedAssetIds: string[];
  agentId: AgentId;
  isLoadingAssets: boolean;
  isStreaming: boolean;
  error: string | null;

  loadAssets: () => Promise<void>;
  toggleAsset: (id: string) => void;
  selectAssets: (ids: string[]) => void;
  setAgentId: (agentId: AgentId) => void;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  appendToken: (token: string) => void;
  finishStreaming: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: `session_${Date.now()}`,
  messages: [],
  assets: [],
  selectedAssetIds: [],
  agentId: "mock",
  isLoadingAssets: false,
  isStreaming: false,
  error: null,

  loadAssets: async () => {
    set({ isLoadingAssets: true, error: null });
    try {
      const assets = await loadMediaAssets();
      set({ assets });
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ isLoadingAssets: false });
    }
  },

  toggleAsset: (id) => {
    set((state) => {
      const selected = new Set(state.selectedAssetIds);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { selectedAssetIds: Array.from(selected) };
    });
  },

  selectAssets: (ids) => set({ selectedAssetIds: ids }),

  setAgentId: (agentId) => set({ agentId }),

  sendMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const { assets, selectedAssetIds, agentId, sessionId } = get();
    const context = buildAssetContext(assets, selectedAssetIds);

    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
      asset_ids: selectedAssetIds,
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      error: null,
    }));

    if (agentId === "mock") {
      await new Promise((r) => setTimeout(r, 600));
      const assistantMessage: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: mockReply(trimmed, context),
        created_at: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isStreaming: false,
      }));
      return;
    }

    // Kimi path — wired in step C via agent_chat_send
    try {
      const { apiInvoke, apiListen } = await import("@/lib/api-client");

      const assistantId = newId();
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: assistantId,
            role: "assistant" as const,
            content: "",
            created_at: new Date().toISOString(),
          },
        ],
      }));

      const unsubToken = await apiListen<{ session_id: string; token: string }>(
        "agent:token",
        (payload) => {
          if (payload.session_id !== sessionId) return;
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + payload.token }
                : m,
            ),
          }));
        },
      );

      const unsubDone = await apiListen<{ session_id: string }>(
        "agent:done",
        (payload) => {
          if (payload.session_id !== sessionId) return;
          set({ isStreaming: false });
          unsubToken();
          unsubDone();
        },
      );

      const unsubError = await apiListen<{ session_id: string; error: string }>(
        "agent:error",
        (payload) => {
          if (payload.session_id !== sessionId) return;
          set({ isStreaming: false, error: payload.error });
          unsubToken();
          unsubDone();
          unsubError();
        },
      );

      const response = await apiInvoke<{
        success: boolean;
        error?: string;
      }>("agent_chat_send", {
        session_id: sessionId,
        message: trimmed,
        agent_id: agentId,
        context,
      });

      if (!response.success) {
        set((state) => ({
          isStreaming: false,
          error: response.error || "Agent request failed",
          messages: state.messages.filter((m) => m.id !== assistantId),
        }));
        unsubToken();
        unsubDone();
        unsubError();
        return;
      }
    } catch (err) {
      set((state) => ({
        isStreaming: false,
        error: String(err),
        messages: state.messages.filter(
          (m) => m.role !== "assistant" || m.content.length > 0,
        ),
      }));
    }
  },

  clearMessages: () =>
    set({
      messages: [],
      sessionId: `session_${Date.now()}`,
      error: null,
    }),

  appendToken: (token) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        messages[messages.length - 1] = { ...last, content: last.content + token };
      }
      return { messages };
    }),

  finishStreaming: () => set({ isStreaming: false }),
}));
