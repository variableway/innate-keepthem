"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Youtube, ChevronUp } from "lucide-react";
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
} from "@vytdl/ui";
import { useTranslation } from "@/i18n";
import { getPlatform } from "@/lib/api-client";
import { isModuleActive, primaryModules } from "@/lib/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [platform, setPlatform] = useState("web");
  const { t } = useTranslation();

  useEffect(() => {
    setPlatform(getPlatform());
  }, []);

  const platformIcon =
    platform.includes("macos") ? "🍎" :
    platform.includes("windows") ? "🪟" :
    platform.includes("linux") ? "🐧" : "🌐";

  const enabledModules = primaryModules.filter((m) => m.enabled !== false);

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
          <SidebarGroupLabel>{t("sidebar.modules")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {enabledModules.map((module) => (
                <SidebarMenuItem key={module.id}>
                  <SidebarMenuButton
                    isActive={isModuleActive(pathname, module)}
                    tooltip={t(module.titleKey)}
                    onClick={() => router.push(module.href)}
                  >
                    <module.icon className="size-4" />
                    <span>{t(module.titleKey)}</span>
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
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
              <span className="text-sm">{platformIcon}</span>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium text-sm">{platform}</span>
              </div>
              <ChevronUp className="ml-auto size-4 opacity-0" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
