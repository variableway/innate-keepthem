"use client";

import { ReactNode } from "react";
import { SectionSubNav } from "@/components/layout/section-subnav";

export function SectionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <SectionSubNav />
      <div className="min-w-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
