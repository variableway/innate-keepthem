"use client";

import { useEffect, useState } from "react";
import { Play, FolderOpen, FileText, Search } from "lucide-react";
import { Card, CardContent } from "@vytdl/ui";
import { Input } from "@vytdl/ui";
import { Button } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { useDownloadStore } from "@/store/downloadStore";
import { formatDate } from "@vytdl/utils";
import { useTranslation } from "@/i18n";
import type { Download } from "@/types";

function VideoCard({ download }: { download: Download }) {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden group cursor-pointer hover:shadow-lg transition-shadow">
      <div className="aspect-video bg-muted relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Play className="h-8 w-8 text-primary" />
          </div>
        </div>

        {download.subtitles.length > 0 && (
          <Badge className="absolute bottom-2 right-2 bg-black/70">
            <FileText className="h-3 w-3 mr-1" />
            {download.subtitles.length}
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="font-medium line-clamp-2 mb-1" title={download.title || undefined}>
          {download.title || t("common.untitled")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {formatDate(download.created_at)}
        </p>

        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="secondary" className="flex-1">
            <Play className="h-3 w-3 mr-1" />
            {t("common.play")}
          </Button>
          <Button size="sm" variant="ghost">
            <FolderOpen className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LibraryPage() {
  const { downloads, fetchDownloads } = useDownloadStore();
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    fetchDownloads();
  }, [fetchDownloads]);

  const completedDownloads = downloads.filter(
    (d) =>
      d.status === "completed" &&
      (searchQuery === "" ||
        d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.url.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t("common.library")}</h1>
          <p className="text-muted-foreground">
            {completedDownloads.length} {completedDownloads.length === 1 ? t("library.videoCount_one") : t("library.videoCount_other")}
          </p>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("library.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {completedDownloads.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
            <Play className="h-12 w-12 text-muted-foreground opacity-50" />
          </div>
          <h3 className="text-lg font-medium mb-2">{t("library.noVideos")}</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t("library.noVideosDesc")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {completedDownloads.map((download) => (
            <VideoCard key={download.id} download={download} />
          ))}
        </div>
      )}
    </div>
  );
}
