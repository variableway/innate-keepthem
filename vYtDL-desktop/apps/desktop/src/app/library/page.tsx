"use client";

import { useEffect, useState } from "react";
import { Play, FolderOpen, FileText, Search } from "lucide-react";
import { Card, CardContent } from "@vytdl/ui";
import { Input } from "@vytdl/ui";
import { Button } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { useDownloadStore } from "@/store/downloadStore";
import { apiInvoke } from "@/lib/api-client";
import { formatDate } from "@vytdl/utils";
import { useTranslation } from "@/i18n";
import type { Download } from "@/types";

function VideoCard({ download }: { download: Download }) {
  const { t } = useTranslation();

  const handleOpenFolder = async () => {
    if (!download.output_dir) return;
    try {
      await apiInvoke("open_download_folder", { path: download.output_dir });
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  return (
    <Card className="overflow-hidden group cursor-pointer hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
      <div className="aspect-video bg-muted relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted via-muted/80 to-muted/40">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300 shadow-sm">
            <Play className="h-6 w-6 text-primary" strokeWidth={1.5} />
          </div>
        </div>

        {download.subtitles.length > 0 && (
          <Badge className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/70 backdrop-blur-sm">
            <FileText className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
            {download.subtitles.length}
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="font-medium line-clamp-2 mb-1 text-sm" title={download.title || undefined}>
          {download.title || t("common.untitled")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {formatDate(download.created_at)}
        </p>

        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="secondary" className="flex-1 text-xs">
            <Play className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
            {t("common.play")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="px-2.5"
            onClick={handleOpenFolder}
            title={t("downloadList.openFolder")}
          >
            <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
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
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center shadow-sm">
            <Play className="h-9 w-9 text-muted-foreground/40" strokeWidth={1.5} />
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
