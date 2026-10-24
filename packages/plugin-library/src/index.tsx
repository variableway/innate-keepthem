import { Library } from "lucide-react";
import type { VytdlPlugin } from "@vytdl/plugin-runtime";
import LibraryPage from "./pages/LibraryPage";
import PlayerPage from "./pages/PlayerPage";

export const plugin: VytdlPlugin = {
  manifest: {
    id: "vytdl.plugin.library",
    name: "Library & Player",
    version: "1.0.0",
    engine: "^1",
    builtin: true,
    slots: [
      { slot: "page", route: "/library" },
      { slot: "page", route: "/player/[id]" },
    ],
    permissions: ["api:downloads", "api:media"],
  },
  activate(ctx) {
    ctx.register({
      pages: [
        { route: "/library", component: LibraryPage },
        { route: "/player/[id]", component: PlayerPage },
      ],
    });
  },
};
