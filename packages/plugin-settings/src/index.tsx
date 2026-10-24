import { Settings } from "lucide-react";
import type { VytdlPlugin } from "@vytdl/plugin-runtime";
import SettingsPage from "./pages/SettingsPage";

export const plugin: VytdlPlugin = {
  manifest: {
    id: "vytdl.plugin.settings",
    name: "Settings",
    version: "1.0.0",
    engine: "^1",
    builtin: true,
    slots: [
      { slot: "nav", order: 30 },
      { slot: "page", route: "/settings" },
      { slot: "settings.section", order: 10 },
    ],
    permissions: ["api:settings", "api:metadata"],
  },
  activate(ctx) {
    ctx.register({
      nav: [
        {
          id: "settings",
          href: "/settings",
          icon: Settings,
          titleKey: "nav.modules.settings",
          enabled: true,
          order: 30,
        },
      ],
      pages: [{ route: "/settings", component: SettingsPage }],
    });
  },
};
