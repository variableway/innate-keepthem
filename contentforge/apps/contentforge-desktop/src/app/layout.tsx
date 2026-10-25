import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { I18nProvider } from "@/i18n";

export const metadata: Metadata = {
  title: "ContentForge Desktop",
  description: "从社交媒体采集、处理、发布内容的一站式工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased dark" suppressHydrationWarning>
      <body className="h-full">
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
