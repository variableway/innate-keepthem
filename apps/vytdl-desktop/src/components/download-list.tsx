"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Trash2,
  FolderOpen,
  FolderSearch,
  ExternalLink,
  MapPin,
  Square,
  AlertCircle,
  CheckCircle,
  Download as DownloadIcon,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Music,
  Pause,
} from "lucide-react";
import { apiInvoke, apiConfirm } from "@/lib/api-client";
import { folderOfDownload } from "@/lib/download-paths";
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
  const [isExtracting, setIsExtracting] = useState(false);
  const { t } = useTranslation();
  const folderPath = folderOfDownload(download);

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

  const handleExtractAudio = async () => {
    if (!download.filename) {
      alert(t("downloadList.noVideoFile"));
      return;
    }
    setIsExtracting(true);
    try {
      const result = await apiInvoke<{ success: boolean; data: { audio_path: string } | null; error: string | null }>("extract_audio", {
        request: {
          video_path: download.filename,
        },
      });
      if (result.success && result.data) {
        alert(t("downloadList.extractAudioSuccess", { path: result.data.audio_path }));
      } else {
        alert(t("downloadList.extractAudioFailed") + (result.error ? `: ${result.error}` : ""));
      }
    } catch (e) {
      alert(t("downloadList.extractAudioFailed") + `: ${e}`);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="p-4 border-b last:border-b-0 hover:bg-muted/50 transition-colors w-full min-w-0">
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
            <div className="mt-2 space-y-1">
              <div className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {download.error}
              </div>
              {/* 韧性引擎错误分类徽章（错误消息格式 [kind] label | hint） */}
              {(() => {
                const m = download.error.match(/^\["([a-z_]+)"\]\s*(.+?)\s*\|\s*(.+)$/);
                if (!m) return null;
                const [, kind, label, hint] = m;
                return (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 font-medium">
                      {label}
                    </span>
                    {hint && <span className="text-muted-foreground">{hint}</span>}
                    <span className="text-muted-foreground/50">({kind})</span>
                  </div>
                );
              })()}
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

          {(folderPath || download.filename) && (
            <div className="mt-1 text-xs text-muted-foreground flex items-start gap-1" title={download.filename || folderPath || ""}>
              <MapPin className="inline h-3 w-3 mt-0.5 shrink-0" />
              <span className="truncate">{download.filename || folderPath}</span>
            </div>
          )}

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

          {download.status === "completed" && download.filename && (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                try {
                  await apiInvoke("open_download_folder", { path: download.filename });
                } catch (e) {
                  console.error("Failed to open file:", e);
                }
              }}
              title={t("downloadList.openFile")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}

          {folderPath && (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                try {
                  await apiInvoke("reveal_in_folder", { path: download.filename || folderPath });
                } catch (e) {
                  console.error("Failed to reveal in folder:", e);
                }
              }}
              title={t("downloadList.revealInFolder")}
            >
              <FolderSearch className="h-4 w-4" />
            </Button>
          )}

          {download.status === "completed" && download.filename && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExtractAudio}
              disabled={isExtracting}
              title={isExtracting ? t("downloadList.extractingAudio") : t("downloadList.extractAudio")}
            >
              {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
            </Button>
          )}

          {download.status === "downloading" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await apiInvoke("pause_download", { downloadId: download.id });
                  } catch (e) {
                    console.error("pause failed:", e);
                  }
                }}
                title="暂停（挂起进程，不丢数据；Windows 暂不支持）"
              >
                <Pause className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await apiInvoke("resume_download", { downloadId: download.id });
                  } catch (e) {
                    console.error("resume failed:", e);
                  }
                }}
                title="恢复"
              >
                <Play className="h-4 w-4" />
              </Button>
            </>
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

function CollectionGroup({
  title,
  items,
  pendingQueuePositions,
}: {
  title: string;
  items: Download[];
  pendingQueuePositions: Map<string, number | undefined>;
}) {
  const { t } = useTranslation();
  const { fetchDownloads, retryDownload } = useDownloadStore();
  // Batches with in-flight work start expanded so the active item and its
  // progress are visible without clicking
  const [expanded, setExpanded] = useState(() =>
    items.some((d) => d.status === "downloading" || d.status === "pending")
  );
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const completed = items.filter((d) => d.status === "completed").length;
  const hasActive = items.some(
    (d) => d.status === "downloading" || d.status === "pending"
  );
  const current = items.find((d) => d.status === "downloading");
  const failedItems = items.filter(
    (d) => d.status === "failed" || d.status === "cancelled"
  );

  const retryGroupFailed = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      for (const d of failedItems) {
        try {
          await retryDownload(d.id);
        } catch (e) {
          console.error("retry failed:", e);
        }
      }
      await fetchDownloads();
    } finally {
      setRetrying(false);
    }
  };
  const avgProgress =
    items.reduce((s, d) => s + (d.progress ?? 0), 0) / (items.length || 1);
  const groupFolder = items.find((d) => folderOfDownload(d))?.output_dir ?? null;

  const cancelAll = async () => {
    setCancelling(true);
    try {
      for (const d of items) {
        if (d.status === "downloading" || d.status === "pending") {
          try {
            await apiInvoke("cancel_download", { downloadId: d.id });
          } catch (e) {
            console.error("cancel failed:", e);
          }
        }
      }
      await fetchDownloads();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/40">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title={expanded ? t("downloadList.collapse") : t("downloadList.expand")}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={title}>
            {title}
          </p>
          {current ? (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {t("downloadList.nowDownloading")}: {current.title || current.url} ·{" "}
              {Math.round(current.progress)}%
              {current.speed ? ` · ${current.speed}` : ""}
              {current.eta ? ` · ETA ${current.eta}` : ""}
            </p>
          ) : null}
          <div className="flex items-center gap-2 mt-1.5">
            <Progress value={avgProgress} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {completed}/{items.length} · {Math.round(avgProgress)}%
            </span>
          </div>
        </div>
        {hasActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelAll}
            disabled={cancelling}
            className="h-7 text-xs shrink-0 text-destructive hover:text-destructive"
            title={t("downloadList.cancelAll")}
          >
            {cancelling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            {t("downloadList.cancelAll")}
          </Button>
        )}
        {failedItems.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={retryGroupFailed}
            disabled={retrying}
            className="h-7 text-xs shrink-0"
            title={t("downloadList.groupRetryFailed")}
          >
            {retrying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {t("downloadList.groupRetryFailed")} ({failedItems.length})
          </Button>
        )}
        {groupFolder && (
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              try {
                await apiInvoke("reveal_in_folder", { path: groupFolder });
              } catch (e) {
                console.error("Failed to reveal folder:", e);
              }
            }}
            title={t("downloadList.revealInFolder")}
            className="shrink-0"
          >
            <FolderSearch className="h-4 w-4" />
          </Button>
        )}
      </div>
      {expanded && (
        <div className="divide-y border-t">
          {items.map((d) => (
            <DownloadItem
              key={d.id}
              download={d}
              queuePosition={pendingQueuePositions.get(d.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

export function DownloadList() {
  const { downloads, isLoading, fetchDownloads, retryDownload } = useDownloadStore();
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [page, setPage] = useState(1);
  const [retryingAll, setRetryingAll] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    fetchDownloads();
  }, [fetchDownloads]);

  // Refresh only while work is in flight — no idle background polling that
  // would re-render the whole list when nothing is happening.
  const hasActive = downloads.some(
    (d) => d.status === "downloading" || d.status === "pending"
  );
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(fetchDownloads, 4000);
    return () => clearInterval(interval);
  }, [hasActive, fetchDownloads]);

  // Two big tabs: active work (downloading first, then queue order, then
  // failed/cancelled newest-first) and completed (completion time desc).
  const statusRank: Record<string, number> = {
    downloading: 0,
    pending: 1,
    failed: 2,
    cancelled: 3,
  };
  const activeDownloads = useMemo(
    () =>
      downloads
        .filter((d) => d.status !== "completed")
        .sort((a, b) => {
          const ra = statusRank[a.status] ?? 9;
          const rb = statusRank[b.status] ?? 9;
          if (ra !== rb) return ra - rb;
          if (a.status === "pending" && b.status === "pending")
            return (a.queue_position ?? 0) - (b.queue_position ?? 0);
          return b.updated_at.localeCompare(a.updated_at);
        }),
    [downloads]
  );
  const completedDownloads = useMemo(
    () =>
      downloads
        .filter((d) => d.status === "completed")
        // updated_at is the completion time for finished downloads
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [downloads]
  );

  const listForTab = tab === "active" ? activeDownloads : completedDownloads;

  // Collection batches collapse into one row; standalone downloads stay as-is
  const { groups, standalone } = useMemo(() => {
    const standalone: Download[] = [];
    const groupMap = new Map<string, { title: string; items: Download[] }>();
    for (const d of listForTab) {
      const cid = d.collection_id?.trim();
      if (!cid) {
        standalone.push(d);
        continue;
      }
      let g = groupMap.get(cid);
      if (!g) {
        g = { title: d.collection_title?.trim() || cid, items: [] };
        groupMap.set(cid, g);
      }
      g.items.push(d);
    }
    return { groups: [...groupMap.entries()], standalone };
  }, [listForTab]);

  const failedCount = activeDownloads.filter(
    (d) => d.status === "failed" || d.status === "cancelled"
  ).length;

  // One click re-enqueues every failed/cancelled download
  const retryAllFailed = async () => {
    if (retryingAll) return;
    setRetryingAll(true);
    try {
      const targets = downloads.filter(
        (d) => d.status === "failed" || d.status === "cancelled"
      );
      for (const d of targets) {
        try {
          await retryDownload(d.id);
        } catch (e) {
          console.error("retry failed:", e);
        }
      }
      await fetchDownloads();
    } finally {
      setRetryingAll(false);
    }
  };

  const pendingQueuePositions = useMemo(() => {
    const positions = new Map<string, number>();
    const sortedPending = [...downloads]
      .filter((d) => d.status === "pending")
      .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
    sortedPending.forEach((d, i) => positions.set(d.id, i + 1));
    return positions;
  }, [downloads]);

  // Paginate over rendered rows (a collapsed group counts as one row)
  const rows = useMemo(
    () => [
      ...groups.map(([cid, g]) => ({ kind: "group" as const, cid, g })),
      ...standalone.map((d) => ({ kind: "item" as const, d })),
    ],
    [groups, standalone]
  );
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DownloadIcon className="h-5 w-5" />
            {t("common.downloads")}
          </CardTitle>
          <div className="flex items-center gap-1">
            {failedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={retryAllFailed}
                disabled={retryingAll}
                className="h-7 text-xs shrink-0"
                title={t("downloadList.retryAll")}
              >
                {retryingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                {t("downloadList.retryAll")} ({failedCount})
              </Button>
            )}
            <Badge
              variant={tab === "active" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                setTab("active");
                setPage(1);
              }}
            >
              {t("downloadList.tabActive")} ({activeDownloads.length})
            </Badge>
            <Badge
              variant={tab === "completed" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                setTab("completed");
                setPage(1);
              }}
            >
              {t("downloadList.tabCompleted")} ({completedDownloads.length})
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : totalRows === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            <DownloadIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>
              {tab === "active"
                ? t("downloadList.emptyActiveTitle")
                : t("downloadList.emptyCompletedTitle")}
            </p>
            <p className="text-sm">{t("downloadList.emptyDescription")}</p>
          </div>
        ) : (
          <>
            <div className="divide-y">
              {pageRows.map((row) =>
                row.kind === "group" ? (
                  <CollectionGroup
                    key={row.cid}
                    title={row.g.title}
                    items={row.g.items}
                    pendingQueuePositions={pendingQueuePositions}
                  />
                ) : (
                  <DownloadItem
                    key={row.d.id}
                    download={row.d}
                    queuePosition={pendingQueuePositions.get(row.d.id)}
                  />
                )
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  {t("downloadList.prevPage")}
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("downloadList.pageOf", {
                    page: String(currentPage),
                    total: String(totalPages),
                    count: String(totalRows),
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {t("downloadList.nextPage")}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
