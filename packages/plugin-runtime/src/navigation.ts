import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Download,
  FileText,
  Library,
  MessageSquare,
  Settings,
  SquareTerminal,
  Video,
} from "lucide-react";

export type AppSection = "video" | "settings";

export type PrimaryModule = {
  id: AppSection;
  href: string;
  icon: LucideIcon;
  titleKey: string;
  /** Reserved for future modules (e.g. contentforge) */
  enabled?: boolean;
};

export type SectionNavItem = {
  id: string;
  href: string;
  icon?: LucideIcon;
  titleKey: string;
  /** Optional hash for in-page section navigation */
  hash?: string;
};

export const primaryModules: PrimaryModule[] = [
  {
    id: "video",
    href: "/",
    icon: Video,
    titleKey: "nav.modules.video",
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

export const videoNavItems: SectionNavItem[] = [
  {
    id: "download",
    href: "/",
    icon: Download,
    titleKey: "nav.video.download",
  },
  {
    id: "library",
    href: "/library",
    icon: Library,
    titleKey: "nav.video.library",
  },
  {
    id: "analyze",
    href: "/analyze",
    icon: FileText,
    titleKey: "nav.video.analyze",
  },
];

export const settingsNavItems: SectionNavItem[] = [
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

export function getSectionFromPath(pathname: string): AppSection {
  if (pathname.startsWith("/settings")) {
    return "settings";
  }

  return "video";
}

export function getSectionNavItems(section: AppSection): SectionNavItem[] {
  if (section === "settings") return settingsNavItems;
  return videoNavItems;
}

export function isSectionNavActive(pathname: string, item: SectionNavItem): boolean {
  if (item.hash) {
    return pathname.startsWith(item.href);
  }
  if (item.href === "/") {
    return pathname === "/";
  }
  if (item.href === "/analyze") {
    return pathname === "/analyze" || pathname.startsWith("/analyze/");
  }
  if (item.href === "/library") {
    return pathname === "/library" || pathname.startsWith("/player/");
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isModuleActive(pathname: string, module: PrimaryModule): boolean {
  return getSectionFromPath(pathname) === module.id;
}
