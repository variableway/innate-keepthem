import { Video } from "lucide-react";
import type { VytdlPlugin } from "@vytdl/plugin-runtime";
import DownloadsPage from "./pages/DownloadsPage";

export const plugin: VytdlPlugin = {
  manifest: {
    id: "vytdl.plugin.downloads",
    name: "Downloads Workbench",
    version: "1.0.0",
    engine: "^1",
    builtin: true,
    slots: [
      { slot: "nav", order: 20 },
      { slot: "page", route: "/" },
      { slot: "downloads.form-tab", order: 10 },
    ],
    permissions: [
      "api:downloads",
      "api:settings",
      "api:metadata",
      "api:media",
      "shell:reveal-folder",
    ],
  },
  activate(ctx) {
    ctx.register({
      nav: [
        {
          id: "video",
          href: "/",
          icon: Video,
          titleKey: "nav.modules.video",
          enabled: true,
          order: 20,
        },
      ],
      pages: [{ route: "/", component: DownloadsPage }],
    });
  },
};
