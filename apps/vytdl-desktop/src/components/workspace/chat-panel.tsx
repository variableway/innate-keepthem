"use client";

import { useEffect, useRef, useState } from "react";
import { Send, User, Bot } from "lucide-react";
import { Button, Spinner, Textarea } from "@vytdl/ui";
import { useTranslation } from "@/i18n";
import { useChatStore } from "@/store/chatStore";
import type { ChatMessage } from "@/types";

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {!message.content && message.role === "assistant" && (
          <Spinner className="h-4 w-4" />
        )}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { t } = useTranslation();
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const error = useChatStore((s) => s.error);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await sendMessage(text);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-lg font-semibold">{t("workspace.chatTitle")}</h1>
        <p className="text-xs text-muted-foreground">{t("workspace.chatSubtitle")}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
            <Bot className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t("workspace.emptyTitle")}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t("workspace.emptyHint")}
            </p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("workspace.inputPlaceholder")}
            className="min-h-[44px] max-h-32 resize-none text-sm"
            rows={1}
            disabled={isStreaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" size="icon" disabled={isStreaming || !input.trim()}>
            {isStreaming ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
