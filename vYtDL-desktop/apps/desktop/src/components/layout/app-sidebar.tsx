"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Download,
  Library,
  Settings,
  Youtube,
  ChevronUp,
  FileText,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vytdl/ui";
import { useTranslation } from "@/i18n";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [platform, setPlatform] = useState("web");
  const { t } = useTranslation();

  const navItems = [
    { titleKey: "common.home", href: "/", icon: Download },
    { titleKey: "analyze.nav", href: "/analyze", icon: FileText },
    { titleKey: "common.library", href: "/library", icon: Library },
    { titleKey: "common.settings", href: "/settings", icon: Settings },
  ];

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

  const platformIcon =
    platform.includes("macos") ? "🍎" :
    platform.includes("windows") ? "🪟" :
    platform.includes("linux") ? "🐧" : "🌐";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => router.push("/")}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Youtube className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">{t("sidebar.appName")}</span>
                <span className="text-xs text-muted-foreground">{t("sidebar.appSubtitle")}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={t(item.titleKey)}
                    onClick={() => router.push(item.href)}
                  >
                    <item.icon className="size-4" />
                    <span>{t(item.titleKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[open]:bg-sidebar-accent"
                >
                  <span className="text-sm">{platformIcon}</span>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-medium text-sm">{platform}</span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="min-w-[8rem]"
              >
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <Settings className="mr-2 size-4" />
                  {t("common.settings")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
