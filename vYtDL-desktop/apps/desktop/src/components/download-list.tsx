"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Trash2,
  FolderOpen,
  AlertCircle,
  CheckCircle,
  Download as DownloadIcon,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { apiInvoke, apiConfirm } from "@/lib/api-client";
import { Button } from "@vytdl/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { Progress } from "@vytdl/ui";
import { useDownloadStore } from "@/store/downloadStore";
import { formatDate } from "@vytdl/utils";
import { useTranslation } from "@/i18n";
import type { Download, DownloadLog, DownloadProgress } from "@/types";

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

  const statusKey = STATUS_KEYS[status] || "downloadList.statusPending";

  return (
    <Badge variant={variants[status] || "secondary"}>
      {t(statusKey)}
    </Badge>
  );
}

type DownloadItemType = Download;

function LogViewer({ logs }: { logs: DownloadLog[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={scrollRef}
      className="mt-2 max-h-48 overflow-y-auto rounded-md bg-muted p-2 font-mono text-xs"
    >
      {logs.length === 0 ? (
        <span className="text-muted-foreground">No logs yet...</span>
      ) : (
        logs.map((log, i) => (
          <div
            key={i}
            className={`break-all ${
              log.level === "error" ? "text-destructive" : "text-foreground"
            }`}
          >
            <span className="opacity-50 mr-1">[{log.level.toUpperCase()}]</span>
            {log.message}
          </div>
        ))
      )}
    </div>
  );
}

function DownloadItem({ download, queuePosition }: { download: DownloadItemType; queuePosition?: number }) {
  const { deleteDownload, retryDownload, activeDownloads, downloadLogs, subscribeToProgress, subscribeToLogs } = useDownloadStore();
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (download.status === "downloading") {
      let cleanupProgress: (() => void) | undefined;
      let cleanupLogs: (() => void) | undefined;
      subscribeToProgress(download.id).then((unlisten) => {
        cleanupProgress = unlisten;
      });
      subscribeToLogs(download.id).then((unlisten) => {
        cleanupLogs = unlisten;
      });
      return () => {
        cleanupProgress?.();
        cleanupLogs?.();
      };
    }
  }, [download.id, download.status, subscribeToProgress, subscribeToLogs]);

  useEffect(() => {
    const activeProgress = activeDownloads.get(download.id);
    if (activeProgress) {
      setProgress(activeProgress);
    }
  }, [activeDownloads, download.id]);

  const handleDelete = async () => {
    const confirmed = await apiConfirm(t("downloadList.deleteConfirm"), {
      title: t("common.confirm"),
      kind: "warning",
    });
    if (confirmed) {
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

          {download.status === "pending" && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {queuePosition !== undefined && queuePosition > 0
                ? t("downloadList.queuePosition", { position: String(queuePosition) })
                : t("downloadList.waitingInQueue")}
            </div>
          )}

          <div className="mt-2 text-xs text-muted-foreground">
            <Clock className="inline h-3 w-3 mr-1" />
            {formatDate(download.created_at)}
          </div>

          {showLogs && (
            <LogViewer logs={downloadLogs.get(download.id) || []} />
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowLogs((s) => !s)}
            title={showLogs ? t("downloadList.hideLogs") : t("downloadList.viewLogs")}
          >
            {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {download.output_dir && (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                try {
                  await apiInvoke("open_download_folder", { path: download.output_dir });
                } catch (e) {
                  console.error("Failed to open folder:", e);
                }
              }}
              title={t("downloadList.openFolder")}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          )}

          {(download.status === "failed" || download.status === "cancelled") && (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await retryDownload(download.id);
              }}
              title={t("downloadList.retry")}
            >
              <RotateCcw className="h-4 w-4" />
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

  const pendingQueuePositions = useMemo(() => {
    const positions = new Map<string, number>();
    const sortedPending = [...downloads]
      .filter((d) => d.status === "pending")
      .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
    sortedPending.forEach((d, i) => positions.set(d.id, i + 1));
    return positions;
  }, [downloads]);

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
              <DownloadItem
                key={download.id}
                download={download}
                queuePosition={pendingQueuePositions.get(download.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
