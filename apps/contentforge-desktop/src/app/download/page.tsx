"use client";

import { useState, useEffect } from "react";
import {
  Download,
  ListVideo,
  Sparkles,
  Loader2,
} from "lucide-react";
import { DownloadForm } from "@/components/download/download-form";
import { DownloadList } from "@/components/download/download-list";
import { useTranslation } from "@/i18n";

export default function DownloadPage() {
  const [activeTab, setActiveTab] = useState<"single" | "batch" | "smart">("single");
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setMounted(true);
  }, []);

  const tabs = [
    { key: "single" as const, icon: Download, label: t("download.single") },
    { key: "batch" as const, icon: ListVideo, label: t("download.batch") },
    { key: "smart" as const, icon: Sparkles, label: t("download.smart") },
  ];

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="text-muted-foreground">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 页面头部 */}
      <div className="shrink-0 px-6 py-5 border-b border-border">
        <div className="max-w-4xl">
          <h1 className="text-2xl font-bold">{t("download.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("download.subtitle")}</p>
        </div>
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {/* 模式切换标签 */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/50 w-fit">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  }`}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 下载表单 */}
          <DownloadForm mode={activeTab} />

          {/* 下载任务列表 */}
          <DownloadList />
        </div>
      </div>
    </div>
  );
}
