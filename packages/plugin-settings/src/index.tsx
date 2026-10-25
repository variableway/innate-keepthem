import type { VytdlPlugin } from "@vytdl/plugin-runtime";
import SettingsPage from "./pages/SettingsPage";

// Settings is intentionally NOT registered as a sidebar module: the entry
// lives in the sidebar footer platform menu (app-sidebar.tsx). The page and
// its section anchor stay mounted as a normal plugin page.
export const plugin: VytdlPlugin = {
  manifest: {
    id: "vytdl.plugin.settings",
    name: "Settings",
    version: "1.0.0",
    engine: "^1",
    builtin: true,
    slots: [
      { slot: "page", route: "/settings" },
      { slot: "settings.section", order: 10 },
    ],
    permissions: ["api:settings", "api:metadata"],
  },
  activate(ctx) {
    ctx.register({
      pages: [{ route: "/settings", component: SettingsPage }],
    });
  },
};
