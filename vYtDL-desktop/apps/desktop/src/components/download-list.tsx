"use client";

import { useEffect, useState } from "react";
import {
  Play,
  Trash2,
  FolderOpen,
  AlertCircle,
  CheckCircle,
  Download as DownloadIcon,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@vytdl/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { Progress } from "@vytdl/ui";
import { useDownloadStore } from "@/store/downloadStore";
import { formatDate } from "@vytdl/utils";
import { useTranslation } from "@/i18n";
import type { Download, DownloadProgress } from "@/types";

const STATUS_KEYS: Record<Download["status"], string> = {
  pending: "downloadList.statusPending",
  downloading: "downloadList.statusDownloading",
  paused: "downloadList.statusPaused",
  completed: "downloadList.statusCompleted",
  failed: "downloadList.statusFailed",
  cancelled: "downloadList.statusCancelled",
};

function StatusBadge({ status }: { status: Download["status"] }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    downloading: "default",
    paused: "secondary",
    completed: "secondary",
    failed: "destructive",
    cancelled: "outline",
  };
  const { t } = useTranslation();

  return (
    <Badge variant={variants[status] || "secondary"}>
      {t(STATUS_KEYS[status])}
    </Badge>
  );
}

type DownloadItemType = Download;

function DownloadItem({ download }: { download: DownloadItemType }) {
  const { deleteDownload, activeDownloads, subscribeToProgress } = useDownloadStore();
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (download.status === "downloading") {
      let cleanup: (() => void) | undefined;
      subscribeToProgress(download.id).then((unlisten) => {
        cleanup = unlisten;
      });
      return () => {
        cleanup?.();
      };
    }
  }, [download.id, download.status, subscribeToProgress]);

  useEffect(() => {
    const activeProgress = activeDownloads.get(download.id);
    if (activeProgress) {
      setProgress(activeProgress);
    }
  }, [activeDownloads, download.id]);

  const handleDelete = () => {
    if (confirm(t("downloadList.deleteConfirm"))) {
      deleteDownload(download.id);
    }
  };

  return (
    <div className="p-4 border-b last:border-b-0 hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium truncate">
              {download.title || t("downloadList.unknownTitle")}
            </h4>
            <StatusBadge status={(download as DownloadItemType).status} />
          </div>

          <p className="text-sm text-muted-foreground truncate mt-1">
            {download.url}
          </p>

          {download.status === "downloading" && progress && (
            <div className="mt-3 space-y-2">
              <Progress value={progress.percent} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress.percent.toFixed(1)}%</span>
                {progress.speed && <span>{progress.speed}</span>}
                {progress.eta && <span>{t("downloadForm.eta")}: {progress.eta}</span>}
              </div>
            </div>
          )}

          {download.status === "completed" && (
            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                {t("downloadList.completed")}
              </span>
              {download.subtitles.length > 0 && (
                <span>{download.subtitles.length} {t("downloadList.subtitles")}</span>
              )}
            </div>
          )}

          {download.status === "failed" && download.error && (
            <div className="mt-2 text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {download.error}
            </div>
          )}

          <div className="mt-2 text-xs text-muted-foreground">
            <Clock className="inline h-3 w-3 mr-1" />
            {formatDate(download.created_at)}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {download.output_dir && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => console.log("Open folder:", download.output_dir)}
              title={t("downloadList.openFolder")}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            title={t("downloadList.deleteRecord")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DownloadList() {
  const { downloads, isLoading, fetchDownloads } = useDownloadStore();
  const [filter, setFilter] = useState<Download["status"] | "all">("all");
  const { t } = useTranslation();

  useEffect(() => {
    fetchDownloads();
    const interval = setInterval(fetchDownloads, 5000);
    return () => clearInterval(interval);
  }, [fetchDownloads]);

  const filteredDownloads = downloads.filter(
    (d) => filter === "all" || d.status === filter
  );

  const filters: { value: Download["status"] | "all"; labelKey: string }[] = [
    { value: "all", labelKey: "downloadList.filterAll" },
    { value: "downloading", labelKey: "downloadList.filterDownloading" },
    { value: "completed", labelKey: "downloadList.filterCompleted" },
    { value: "failed", labelKey: "downloadList.filterFailed" },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DownloadIcon className="h-5 w-5" />
            {t("common.downloads")}
          </CardTitle>
          <div className="flex gap-1">
            {filters.map((f) => (
              <Badge
                key={f.value}
                variant={filter === f.value ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilter(f.value)}
              >
                {t(f.labelKey)}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDownloads.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            <DownloadIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t("downloadList.emptyTitle")}</p>
            <p className="text-sm">{t("downloadList.emptyDescription")}</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredDownloads.map((download) => (
              <DownloadItem key={download.id} download={download} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
