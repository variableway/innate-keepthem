"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@vytdl/ui";
import { useTranslation } from "@/i18n";
import {
  getSectionFromPath,
  getSectionNavItems,
  isSectionNavActive,
  type SectionNavItem,
} from "@/lib/navigation";

function navigateToItem(router: ReturnType<typeof useRouter>, item: SectionNavItem) {
  const url = item.hash ? `${item.href}#${item.hash}` : item.href;
  router.push(url);
  if (item.hash && typeof document !== "undefined") {
    requestAnimationFrame(() => {
      document.getElementById(`section-${item.hash}`)?.scrollIntoView({ behavior: "smooth" });
    });
  }
}

export function SectionSubNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const section = getSectionFromPath(pathname);
  const items = getSectionNavItems(section);

  const sectionTitleKey =
    section === "settings"
      ? "nav.modules.settings"
      : section === "workspace"
        ? "nav.modules.workspace"
        : "nav.modules.video";

  const sectionSubtitleKey =
    section === "settings"
      ? "nav.settings.subtitle"
      : section === "workspace"
        ? "nav.workspace.subtitle"
        : "nav.video.subtitle";

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-muted/20">
      <div className="px-4 py-4 border-b">
        <h2 className="text-sm font-semibold tracking-tight">{t(sectionTitleKey)}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(sectionSubtitleKey)}
        </p>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {items.map((item) => {
          const active = isSectionNavActive(pathname, item);
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateToItem(router, item)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {Icon ? <Icon className="size-4 shrink-0" /> : null}
              <span>{t(item.titleKey)}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
