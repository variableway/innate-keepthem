"use client";

import { useEffect } from "react";
import { AgentSelector } from "../components/agent-selector";
import { ChatPanel } from "../components/chat-panel";
import { ContextPanel } from "../components/context-panel";
import { hasShellBridge } from "@vytdl/plugin-runtime/client";
import { useChatStore } from "@vytdl/plugin-workspace/store";

function isTauriRuntime(): boolean {
  return hasShellBridge();
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
