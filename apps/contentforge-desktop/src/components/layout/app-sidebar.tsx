"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Download,
  Sparkles,
  Globe,
  Workflow,
  Settings,
  ChevronUp,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { primaryModules, isModuleActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [platform, setPlatform] = useState("web");
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke<string>("get_platform"))
        .then(setPlatform)
        .catch(() => setPlatform("unknown"));
    } else if (typeof window !== "undefined") {
      const ua = window.navigator.userAgent.toLowerCase();
      if (ua.includes("mac")) setPlatform("macos");
      else if (ua.includes("win")) setPlatform("windows");
      else if (ua.includes("linux")) setPlatform("linux");
      else setPlatform("unknown");
    }
  }, []);

  // 从 localStorage 读取折叠状态
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("contentforge-sidebar-collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      }
    }
  }, []);

  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    if (typeof window !== "undefined") {
      localStorage.setItem("contentforge-sidebar-collapsed", String(newState));
    }
  };

  const platformIcon =
    platform.includes("macos") ? "🍎" :
    platform.includes("windows") ? "🪟" :
    platform.includes("linux") ? "🐧" : "🌐";

  const enabledModules = primaryModules.filter((m) => m.enabled !== false);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-card border-r border-border shrink-0 transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header - App Logo */}
      <div className="p-4 border-b border-border">
        <button
          onClick={() => router.push("/download")}
          className="flex items-center gap-3 w-full hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shrink-0">
            <Download className="w-4 h-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col items-start leading-none">
              <span className="font-semibold text-sm">{t("sidebar.appName")}</span>
              <span className="text-xs text-muted-foreground">{t("sidebar.appSubtitle")}</span>
            </div>
          )}
        </button>
      </div>

      {/* Navigation - Modules */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-auto">
        {!collapsed && (
          <div className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("sidebar.modules")}
          </div>
        )}
        {enabledModules.map((module) => {
          const isActive = isModuleActive(pathname, module);
          return (
            <button
              key={module.id}
              onClick={() => router.push(module.href)}
              className={cn(
                "flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? t(module.titleKey) : undefined}
            >
              <module.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{t(module.titleKey)}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer - Platform Info & Toggle */}
      <div className="p-3 border-t border-border space-y-2">
        {/* 折叠切换按钮 */}
        <button
          onClick={toggleCollapsed}
          className={cn(
            "flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? t("sidebar.toggleHint") : undefined}
        >
          <ChevronUp
            className={cn(
              "w-4 h-4 shrink-0 transition-transform",
              collapsed ? "rotate-90" : "-rotate-90"
            )}
          />
          {!collapsed && <span className="text-xs">{t("sidebar.toggleHint")}</span>}
        </button>

        {/* 平台信息 */}
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground",
            collapsed && "justify-center px-2"
          )}
        >
          <span className="text-sm shrink-0">{platformIcon}</span>
          {!collapsed && <span className="text-xs capitalize">{platform}</span>}
        </div>
      </div>
    </aside>
  );
}
