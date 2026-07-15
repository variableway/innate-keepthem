"use client";

import { useEffect } from "react";
import { AgentSelector } from "@/components/workspace/agent-selector";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { ContextPanel } from "@/components/workspace/context-panel";
import { useChatStore } from "@/store/chatStore";

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window as Window & { __TAURI__?: unknown }).__TAURI__ !== undefined ||
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined
  );
}

export default function WorkspacePage() {
  const loadAssets = useChatStore((s) => s.loadAssets);
  const setAgentId = useChatStore((s) => s.setAgentId);
  const assets = useChatStore((s) => s.assets);
  const selectedAssetIds = useChatStore((s) => s.selectedAssetIds);
  const selectAssets = useChatStore((s) => s.selectAssets);

  useEffect(() => {
    loadAssets();
    if (isTauriRuntime()) {
      setAgentId("kimi");
    }
  }, [loadAssets, setAgentId]);

  // Auto-select first transcript report when none selected (helps first-run E2E)
  useEffect(() => {
    if (selectedAssetIds.length > 0 || assets.length === 0) return;
    const firstReport = assets.find((a) => a.type === "vtt_report" && a.transcript);
    if (firstReport) {
      selectAssets([firstReport.id]);
    }
  }, [assets, selectedAssetIds.length, selectAssets]);

  return (
    <div className="flex min-h-[calc(100vh-3rem)] w-full">
      <ContextPanel />
      <ChatPanel />
      <AgentSelector />
    </div>
  );
}
