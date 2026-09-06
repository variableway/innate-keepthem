"use client";

import { ReactNode, useEffect, useState } from "react";
import { Separator, SidebarInset, SidebarProvider, SidebarTrigger } from "@vytdl/ui";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SectionLayout } from "@/components/layout/section-layout";
import { useTranslation } from "@/i18n";

export function AppShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Cmd/Ctrl+R reloads the page — the desktop webviews ship no built-in
  // reload shortcut (macOS adds a native View→Reload menu item in lib.rs;
  // this handler covers the webview fallback and plain-browser mode).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-muted-foreground">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset className="min-w-0 flex flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {t("sidebar.toggleHint")}
          </span>
        </header>
        <SectionLayout>{children}</SectionLayout>
      </SidebarInset>
    </SidebarProvider>
  );
}
