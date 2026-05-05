import { Database, DownloadRecord, DownloadStatus } from "./database";
import { spawnDownload, DownloadOptions, DownloadProgress, DownloadLog } from "./downloader";
import WebSocket from "ws";

interface PendingDownload {
  id: string;
  options: DownloadOptions;
}

interface ActiveDownload {
  id: string;
  cancel: () => void;
}

export class QueueManager {
  private db: Database;
  private wss: WebSocket.Server;
  private maxConcurrent: number = 3;
  private active: Map<string, ActiveDownload> = new Map();
  private pending: PendingDownload[] = [];
  private cancelled: Set<string> = new Set();

  constructor(db: Database, wss: WebSocket.Server) {
    this.db = db;
    this.wss = wss;
    this.loadSettings();
  }

  private loadSettings() {
    const maxConcurrent = this.db.getSetting("max_concurrent_downloads");
    if (maxConcurrent) {
      this.maxConcurrent = parseInt(maxConcurrent, 10) || 3;
    }
  }

  setMaxConcurrent(n: number) {
    this.maxConcurrent = Math.max(1, Math.min(10, n));
    this.db.setSetting("max_concurrent_downloads", String(this.maxConcurrent));
    this.processQueue();
  }

  enqueue(id: string, options: DownloadOptions) {
    this.pending.push({ id, options });
    this.db.updateDownloadStatus(id, "pending");
    this.updatePendingPositions();
    this.broadcast("queue:update", { id, status: "pending" });
    this.processQueue();
  }

  cancel(id: string) {
    this.cancelled.add(id);

    // Remove from pending
    const pendingIdx = this.pending.findIndex((p) => p.id === id);
    if (pendingIdx >= 0) {
      this.pending.splice(pendingIdx, 1);
      this.db.updateDownloadStatus(id, "cancelled");
      this.updatePendingPositions();
      this.broadcast("download:status:" + id, "cancelled");
      this.broadcast("queue:update", { id, status: "cancelled" });
      return;
    }

    // Cancel active
    const active = this.active.get(id);
    if (active) {
      active.cancel();
      // Status will be updated when the download task finishes
    } else {
      this.db.updateDownloadStatus(id, "cancelled");
      this.broadcast("download:status:" + id, "cancelled");
    }

    this.cancelled.delete(id);
  }

  private updatePendingPositions() {
    for (let i = 0; i < this.pending.length; i++) {
      this.db.updateQueuePosition(this.pending[i].id, i + 1);
    }
  }

  private processQueue() {
    while (this.active.size < this.maxConcurrent && this.pending.length > 0) {
      const next = this.pending.shift()!;
      this.startDownload(next.id, next.options);
    }
  }

  private startDownload(id: string, options: DownloadOptions) {
    this.db.updateDownloadStatus(id, "downloading");
    this.db.updateQueuePosition(id, 0);
    this.broadcast("download:status:" + id, "downloading");
    this.broadcast("queue:update", { id, status: "downloading" });

    let isCancelled = false;
    const cancel = () => {
      isCancelled = true;
    };

    this.active.set(id, { id, cancel });

    spawnDownload(
      options,
      (progress: DownloadProgress) => {
        this.db.updateDownloadProgress(id, progress.percent, progress.speed, progress.eta);
        this.broadcast("download:progress:" + id, progress);
      },
      (log: DownloadLog) => {
        this.broadcast("download:log:" + id, log);
      },
      () => isCancelled
    )
      .then((output) => {
        this.db.updateDownloadComplete(
          id,
          output.title,
          output.filename,
          JSON.stringify(output.subtitles)
        );
        this.broadcast("download:complete:" + id, {
          success: true,
          data: output,
        });
        this.broadcast("download:status:" + id, "completed");
      })
      .catch((err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg === "Download cancelled") {
          this.db.updateDownloadStatus(id, "cancelled");
          this.broadcast("download:status:" + id, "cancelled");
        } else {
          this.db.updateDownloadError(id, errorMsg);
          this.broadcast("download:error:" + id, {
            success: false,
            error: errorMsg,
          });
          this.broadcast("download:status:" + id, "failed");
        }
      })
      .finally(() => {
        this.active.delete(id);
        this.updatePendingPositions();
        this.processQueue();
      });
  }

  private broadcast(event: string, data: unknown) {
    const message = JSON.stringify({ event, data });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}
