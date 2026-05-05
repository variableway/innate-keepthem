"use client";

import { useState, useEffect } from "react";
import { Download, List, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { DownloadForm } from "@/components/download-form";
import { DownloadList } from "@/components/download-list";
import { useDownloadStore } from "@/store/downloadStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTranslation } from "@/i18n";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("single");
  const { fetchDownloads } = useDownloadStore();
  const { fetchSettings } = useSettingsStore();
  const { t } = useTranslation();

  useEffect(() => {
    fetchDownloads();
    fetchSettings();
  }, [fetchDownloads, fetchSettings]);

  return (
    <div className="p-6 w-full min-w-[640px] max-w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("home.title")}</h1>
        <p className="text-muted-foreground">
          {t("home.subtitle")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="single" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            {t("home.single")}
          </TabsTrigger>
          <TabsTrigger value="batch" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            {t("home.batch")}
          </TabsTrigger>
          <TabsTrigger value="smart" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {t("home.smart")}
            <Badge variant="secondary" className="ml-1 text-xs">{t("home.newBadge")}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-4">
          <DownloadForm mode="single" />
        </TabsContent>

        <TabsContent value="batch" className="mt-4">
          <DownloadForm mode="batch" />
        </TabsContent>

        <TabsContent value="smart" className="mt-4">
          <DownloadForm mode="smart" />
        </TabsContent>
      </Tabs>

      <DownloadList />
    </div>
  );
}
