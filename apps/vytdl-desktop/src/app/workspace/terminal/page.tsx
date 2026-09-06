"use client";

import { TerminalLauncher } from "@/components/workspace/terminal-launcher";

export default function AgentTerminalPage() {
  return (
    <div className="min-h-[calc(100vh-3rem)] w-full px-6 py-6 sm:px-8">
      <TerminalLauncher />
    </div>
  );
}
