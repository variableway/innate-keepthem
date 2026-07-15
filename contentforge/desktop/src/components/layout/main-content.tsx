import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MainContentWidth = "default" | "wide" | "full";

const widthClass: Record<MainContentWidth, string> = {
  default: "max-w-5xl",
  wide: "max-w-6xl",
  full: "max-w-none",
};

export function MainContent({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: MainContentWidth;
}) {
  return (
    <div
      className={cn(
        "w-full mx-auto px-6 py-6 sm:px-8",
        widthClass[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
