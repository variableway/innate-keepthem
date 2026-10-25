import type { LucideIcon } from "lucide-react";
import {
  Download,
  Sparkles,
  Globe,
  Workflow,
  Settings,
} from "lucide-react";

export type AppSection = "ingestion" | "processing" | "publishing" | "workflows" | "settings";

export type PrimaryModule = {
  id: AppSection;
  href: string;
  icon: LucideIcon;
  titleKey: string;
  enabled?: boolean;
};

export type SectionNavItem = {
  id: string;
  href: string;
  icon?: LucideIcon;
  titleKey: string;
  hash?: string;
};

// ─────────────────────────── 主模块 ───────────────────────────

export const primaryModules: PrimaryModule[] = [
  {
    id: "ingestion",
    href: "/download",
    icon: Download,
    titleKey: "nav.modules.ingestion",
    enabled: true,
  },
  {
    id: "processing",
    href: "/processing",
    icon: Sparkles,
    titleKey: "nav.modules.processing",
    enabled: true,
  },
  {
    id: "publishing",
    href: "/publishing",
    icon: Globe,
    titleKey: "nav.modules.publishing",
    enabled: true,
  },
  {
    id: "workflows",
    href: "/workflows",
    icon: Workflow,
    titleKey: "nav.modules.workflows",
    enabled: true,
  },
  {
    id: "settings",
    href: "/settings",
    icon: Settings,
    titleKey: "nav.modules.settings",
    enabled: true,
  },
];

// ─────────────────────────── 子导航项 ───────────────────────────

export const ingestionNavItems: SectionNavItem[] = [
  {
    id: "download",
    href: "/download",
    icon: Download,
    titleKey: "nav.ingestion.download",
  },
  {
    id: "library",
    href: "/library",
    icon: Download,
    titleKey: "nav.ingestion.library",
  },
];

export const processingNavItems: SectionNavItem[] = [
  {
    id: "chat",
    href: "/processing",
    icon: Sparkles,
    titleKey: "nav.processing.chat",
  },
  {
    id: "assets",
    href: "/processing/assets",
    icon: Sparkles,
    titleKey: "nav.processing.assets",
  },
];

export const publishingNavItems: SectionNavItem[] = [
  {
    id: "publish",
    href: "/publishing",
    icon: Globe,
    titleKey: "nav.publishing.publish",
  },
];

export const workflowsNavItems: SectionNavItem[] = [
  {
    id: "workflows",
    href: "/workflows",
    icon: Workflow,
    titleKey: "nav.workflows.list",
  },
];

export const settingsNavItems: SectionNavItem[] = [
  {
    id: "general",
    href: "/settings",
    hash: "general",
    titleKey: "nav.settings.general",
  },
  {
    id: "download",
    href: "/settings",
    hash: "download",
    titleKey: "nav.settings.download",
  },
  {
    id: "ai",
    href: "/settings",
    hash: "ai",
    titleKey: "nav.settings.ai",
  },
];

// ─────────────────────────── 辅助函数 ───────────────────────────

export function getSectionFromPath(pathname: string): AppSection {
  if (pathname.startsWith("/settings")) {
    return "settings";
  }
  if (pathname.startsWith("/processing")) {
    return "processing";
  }
  if (pathname.startsWith("/publishing")) {
    return "publishing";
  }
  if (pathname.startsWith("/workflows")) {
    return "workflows";
  }
  return "ingestion";
}

export function getSectionNavItems(section: AppSection): SectionNavItem[] {
  switch (section) {
    case "ingestion":
      return ingestionNavItems;
    case "processing":
      return processingNavItems;
    case "publishing":
      return publishingNavItems;
    case "workflows":
      return workflowsNavItems;
    case "settings":
      return settingsNavItems;
    default:
      return [];
  }
}

export function isSectionNavActive(pathname: string, item: SectionNavItem): boolean {
  if (item.hash) {
    return pathname.startsWith(item.href);
  }
  if (item.href === "/download") {
    return pathname === "/download" || pathname === "/";
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isModuleActive(pathname: string, module: PrimaryModule): boolean {
  return getSectionFromPath(pathname) === module.id;
}
