import { Bot } from "lucide-react";
import type { VytdlPlugin } from "@vytdl/plugin-runtime";
import WorkspacePage from "./pages/WorkspacePage";
import TerminalPage from "./pages/TerminalPage";

export const plugin: VytdlPlugin = {
  manifest: {
    id: "vytdl.plugin.workspace",
    name: "AI Workspace",
    version: "1.0.0",
    engine: "^1",
    builtin: true,
    slots: [
      { slot: "nav", order: 10 },
      { slot: "page", route: "/workspace" },
      { slot: "page", route: "/workspace/terminal" },
    ],
    permissions: ["api:settings", "api:analyze", "shell:*"],
  },
  activate(ctx) {
    ctx.register({
      nav: [
        {
          id: "workspace",
          href: "/workspace",
          icon: Bot,
          titleKey: "nav.modules.workspace",
          enabled: true,
          order: 10,
        },
      ],
      pages: [
        { route: "/workspace", component: WorkspacePage },
        { route: "/workspace/terminal", component: TerminalPage },
      ],
    });
  },
};
