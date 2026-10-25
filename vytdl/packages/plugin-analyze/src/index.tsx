import { FileText } from "lucide-react";
import type { VytdlPlugin } from "@vytdl/plugin-runtime";
import AnalyzePage from "./pages/AnalyzePage";
import AnalyzeReportPage from "./pages/AnalyzeReportPage";

export const plugin: VytdlPlugin = {
  manifest: {
    id: "vytdl.plugin.analyze",
    name: "VTT Analysis",
    version: "1.0.0",
    engine: "^1",
    builtin: true,
    slots: [
      { slot: "page", route: "/analyze" },
      { slot: "page", route: "/analyze/[id]" },
    ],
    permissions: ["api:analyze", "api:metadata", "api:downloads"],
  },
  activate(ctx) {
    ctx.register({
      pages: [
        { route: "/analyze", component: AnalyzePage },
        { route: "/analyze/[id]", component: AnalyzeReportPage },
      ],
    });
  },
};
