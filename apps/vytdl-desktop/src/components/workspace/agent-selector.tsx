"use client";

import { Bot, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@vytdl/ui";
import { useTranslation } from "@/i18n";
import { useChatStore } from "@/store/chatStore";
import type { AgentId } from "@/types";

export function AgentSelector() {
  const { t } = useTranslation();
  const agentId = useChatStore((s) => s.agentId);
  const setAgentId = useChatStore((s) => s.setAgentId);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedAssetIds = useChatStore((s) => s.selectedAssetIds);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const handleSummarize = () => {
    if (selectedAssetIds.length === 0) return;
    sendMessage(
      "请总结所选内容的要点，列出 5-8 条关键结论，并尽量引用时间戳。",
    );
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-l bg-muted/10">
      <div className="border-b p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t("workspace.agentTitle")}</h2>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("workspace.agentProvider")}</Label>
          <Select
            value={agentId}
            onValueChange={(v) => setAgentId(v as AgentId)}
            disabled={isStreaming}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">{t("workspace.agentMock")}</SelectItem>
              <SelectItem value="kimi">{t("workspace.agentKimi")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {agentId === "mock" && (
          <Badge variant="secondary" className="text-[10px]">
            {t("workspace.mockBadge")}
          </Badge>
        )}

        {agentId === "kimi" && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("workspace.kimiHint")}
          </p>
        )}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("workspace.quickActions")}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={handleSummarize}
          disabled={isStreaming || selectedAssetIds.length === 0}
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          {t("workspace.actionSummarize")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={clearMessages}
          disabled={isStreaming}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          {t("workspace.newSession")}
        </Button>
      </div>
    </aside>
  );
}
