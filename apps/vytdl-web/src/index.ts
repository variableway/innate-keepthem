import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAdaptorServer } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { readFile } from "fs/promises";
import type { Server as HttpServer } from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { Database } from "./database";
import { QueueManager } from "./queue";
import { getVideoInfo, getVideoFormats, getPlaylistInfo, findYtDlp, extractAudio } from "./downloader";
import { VttAnalyzer } from "./vtt-analysis";

const app = new Hono();
const server = createAdaptorServer({ fetch: app.fetch }) as HttpServer;
const wss = new WebSocketServer({ server, path: "/api/ws" });

app.use("/*", cors());

// Serve static Next.js build (falls through to the API routes when no file matches)
const staticDir = process.env.VYTDL_STATIC_DIR || path.join(__dirname, "../../out");
app.use("/*", serveStatic({ root: path.relative(process.cwd(), staticDir) }));

// Unified error response for thrown errors (invalid JSON bodies map to 400)
app.onError((err, c) => {
  const status = err instanceof SyntaxError ? 400 : 500;
  return c.json(
    { success: false, error: err instanceof Error ? err.message : String(err) },
    status
  );
});

// Ensure data directory exists
const dbPath = process.env.VYTDL_DB_PATH || "./data/vytdl.db";
const outputDir = process.env.VYTDL_OUTPUT_DIR || "./downloads";

mkdirSync(path.dirname(dbPath), { recursive: true });
mkdirSync(outputDir, { recursive: true });

const db = new Database(dbPath);
const queue = new QueueManager(db, wss);
const vttAnalyzer = new VttAnalyzer(db, wss);

// Default settings
const defaults: Record<string, string> = {
  yt_dlp_path: findYtDlp(),
  default_output_dir: outputDir,
  default_quality: "best",
  default_format: "mp4",
  default_sub_langs: JSON.stringify(["en", "zh"]),
  language: "zh",
  max_concurrent_downloads: "3",
};
for (const [key, value] of Object.entries(defaults)) {
  const existing = db.getSetting(key);
  if (existing === undefined) {
    db.setSetting(key, value);
  }
}

// ── API Routes ──

app.post("/api/start-download", async (c) => {
  const id = randomUUID();
  // Frontend apiInvoke wraps args as { request: {...} } to mirror the Tauri command
  const body = await c.req.json();
  const request = body?.request ?? body ?? {};
  const outputDirSetting = db.getSetting("default_output_dir") || outputDir;

  const record = {
    id,
    url: request.url,
    title: null,
    status: "pending" as const,
    progress: 0.0,
    speed: null,
    eta: null,
    output_dir: request.output_dir || outputDirSetting,
    filename: null,
    subtitles: "[]",
    error: null,
    queue_position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.createDownload(record);
  queue.enqueue(id, {
    url: request.url,
    is_playlist: request.is_playlist || false,
    quality: request.quality,
    format: request.format,
    output_dir: request.output_dir || outputDirSetting,
    sub_langs: request.sub_langs,
    write_subs: request.write_subs,
    write_auto_subs: request.write_auto_subs,
    start_time: request.start_time,
    end_time: request.end_time,
  });

  return c.json({ success: true, data: id });
});

app.post("/api/cancel-download", async (c) => {
  const { downloadId } = await c.req.json();
  queue.cancel(downloadId);
  return c.json({ success: true, data: null });
});

app.post("/api/retry-download", async (c) => {
  const { id } = await c.req.json();
  const original = db.getDownloadById(id);
  if (!original) {
    return c.json({ success: false, error: "Download not found" }, 404);
  }

  const newId = randomUUID();
  const outputDirSetting = db.getSetting("default_output_dir") || outputDir;

  const record = {
    id: newId,
    url: original.url,
    title: null,
    status: "pending" as const,
    progress: 0.0,
    speed: null,
    eta: null,
    output_dir: original.output_dir || outputDirSetting,
    filename: null,
    subtitles: "[]",
    error: null,
    queue_position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.createDownload(record);
  queue.enqueue(newId, {
    url: original.url,
    is_playlist: false,
    output_dir: original.output_dir || outputDirSetting,
  });

  return c.json({ success: true, data: newId });
});

// The frontend derives web-mode endpoints from Tauri command names
// (apiInvoke("get_downloads") → POST /api/get-downloads), so route names
// must match that contract. Legacy aliases are kept for external callers.
app.post("/api/get-downloads", (c) => {
  const downloads = db.getAllDownloads();
  return c.json({ success: true, data: downloads });
});

app.get("/api/downloads", (c) => {
  const downloads = db.getAllDownloads();
  return c.json({ success: true, data: downloads });
});

app.post("/api/delete-download", async (c) => {
  const { id } = await c.req.json();
  db.deleteDownload(id);
  return c.json({ success: true, data: null });
});

app.post("/api/get-video-info", async (c) => {
  const { url } = await c.req.json();
  const info = await getVideoInfo(url);
  return c.json({ success: true, data: info });
});

app.post("/api/get-video-formats", async (c) => {
  const { url } = await c.req.json();
  const formats = await getVideoFormats(url);
  return c.json({ success: true, data: formats });
});

app.post("/api/get-playlist-info", async (c) => {
  const { url } = await c.req.json();
  const info = await getPlaylistInfo(url);
  return c.json({ success: true, data: info });
});

app.post("/api/get-settings", (c) => {
  const keys = [
    "yt_dlp_path",
    "default_output_dir",
    "default_quality",
    "default_format",
    "default_sub_langs",
    "language",
    "max_concurrent_downloads",
    "ai_provider",
    "ai_api_key",
    "ai_model",
    "agent_cli_kimi_bin",
    "agent_cli_other_bin",
  ];
  const settings: Record<string, unknown> = {};
  for (const key of keys) {
    const value = db.getSetting(key);
    if (key === "default_sub_langs" && value) {
      settings[key] = JSON.parse(value);
    } else if (key === "max_concurrent_downloads" && value) {
      settings[key] = parseInt(value, 10);
    } else {
      settings[key] = value ?? null;
    }
  }
  return c.json({ success: true, data: settings });
});

app.post("/api/update-settings", async (c) => {
  // Frontend apiInvoke wraps args as { settings: {...} } to mirror the Tauri command
  const body = await c.req.json();
  const settings = body?.settings ?? body ?? {};
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === null) continue;
    let stored = String(value);
    if (Array.isArray(value)) {
      stored = JSON.stringify(value);
    }
    db.setSetting(key, stored);
  }
  // Update queue concurrency if changed
  if (settings.max_concurrent_downloads !== undefined) {
    queue.setMaxConcurrent(parseInt(String(settings.max_concurrent_downloads), 10));
  }
  return c.json({ success: true, data: null });
});

// Pause/resume are desktop-only queue operations; respond with a clean JSON
// error instead of a 404 page so the web UI can display a friendly message.
for (const route of ["/api/pause-download", "/api/resume-download"]) {
  app.post(route, (c) =>
    c.json({ success: false, error: "Pause/resume is not supported in web mode" })
  );
}

app.post("/api/extract-audio", async (c) => {
  const { video_path, output_dir, audio_format } = await c.req.json();
  const audioPath = await extractAudio(video_path, output_dir, audio_format || "mp3");
  return c.json({ success: true, data: { audio_path: audioPath } });
});

app.post("/api/analyze-vtt", async (c) => {
  const { url } = await c.req.json();
  if (!url || typeof url !== "string") {
    return c.json({ success: false, error: "url is required" }, 400);
  }
  const reportId = await vttAnalyzer.startAnalysis(url);
  return c.json({ success: true, data: { reportId } });
});

app.get("/api/vtt-report/:id", (c) => {
  const report = db.getVttReport(c.req.param("id"));
  if (!report) {
    return c.json({ success: false, error: "Report not found" }, 404);
  }
  return c.json({ success: true, data: report });
});

app.get("/api/vtt-reports", (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
  const lang = c.req.query("lang");
  const result = db.listVttReports(page, limit, lang);
  return c.json({ success: true, data: result });
});

app.post("/api/delete-vtt-report", async (c) => {
  const { id } = await c.req.json();
  db.deleteVttReport(id);
  return c.json({ success: true, data: null });
});

app.post("/api/open-download-folder", (c) => {
  // No-op in Docker/web mode
  return c.json({ success: true, data: null });
});

// Fallback to index.html for SPA routing
app.get("*", async (c) => {
  const html = await readFile(path.join(staticDir, "index.html"), "utf-8");
  return c.html(html);
});

// ── WebSocket ──
wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.action === "subscribe" && data.downloadId) {
        // Client subscribes to a download's events
        // Events are already broadcast globally, so no extra work needed
      }
    } catch {
      // ignore invalid messages
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`vYtDL Web Server running on port ${PORT}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Static dir: ${staticDir}`);
});
