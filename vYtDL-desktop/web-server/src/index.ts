import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import { Database } from "./database";
import { QueueManager } from "./queue";
import { getVideoInfo, getVideoFormats, getPlaylistInfo, findYtDlp, extractAudio } from "./downloader";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/api/ws" });

app.use(cors());
app.use(express.json());

// Serve static Next.js build
const staticDir = process.env.VYTDL_STATIC_DIR || path.join(__dirname, "../../out");
app.use(express.static(staticDir));

// Ensure data directory exists
const dbPath = process.env.VYTDL_DB_PATH || "./data/vytdl.db";
const outputDir = process.env.VYTDL_OUTPUT_DIR || "./downloads";

import { mkdirSync } from "fs";
mkdirSync(path.dirname(dbPath), { recursive: true });
mkdirSync(outputDir, { recursive: true });

const db = new Database(dbPath);
const queue = new QueueManager(db, wss);

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

app.post("/api/start-download", (req, res) => {
  try {
    const id = uuidv4();
    const request = req.body;
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

    res.json({ success: true, data: id });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/cancel-download", (req, res) => {
  try {
    const { downloadId } = req.body;
    queue.cancel(downloadId);
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/retry-download", (req, res) => {
  try {
    const { id } = req.body;
    const original = db.getDownloadById(id);
    if (!original) {
      res.status(404).json({ success: false, error: "Download not found" });
      return;
    }

    const newId = uuidv4();
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

    res.json({ success: true, data: newId });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/downloads", (_req, res) => {
  try {
    const downloads = db.getAllDownloads();
    res.json({ success: true, data: downloads });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/delete-download", (req, res) => {
  try {
    const { id } = req.body;
    db.deleteDownload(id);
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/video-info", async (req, res) => {
  try {
    const { url } = req.body;
    const info = await getVideoInfo(url);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/video-formats", async (req, res) => {
  try {
    const { url } = req.body;
    const formats = await getVideoFormats(url);
    res.json({ success: true, data: formats });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/playlist-info", async (req, res) => {
  try {
    const { url } = req.body;
    const info = await getPlaylistInfo(url);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/settings", (_req, res) => {
  try {
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
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/settings", (req, res) => {
  try {
    const settings = req.body;
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
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/extract-audio", async (req, res) => {
  try {
    const { video_path, output_dir, audio_format } = req.body;
    const audioPath = await extractAudio(video_path, output_dir, audio_format || "mp3");
    res.json({ success: true, data: { audio_path: audioPath } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/open-download-folder", (_req, res) => {
  // No-op in Docker/web mode
  res.json({ success: true, data: null });
});

// Fallback to index.html for SPA routing
app.get("*", (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
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
