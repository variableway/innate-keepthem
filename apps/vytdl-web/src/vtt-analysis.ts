import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Database, VttReport } from "./database";
import { runYtDlp } from "./downloader";
import WebSocket from "ws";

export interface AnalyzeResult {
  report: VttReport;
}

function findVytdlCli(): string {
  const envPath = process.env.VYTDL_CLI_PATH;
  if (envPath) return envPath;
  return "vYtDL";
}

function extractVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export class VttAnalyzer {
  private db: Database;
  private wss: WebSocket.Server;
  private outputDir: string;

  constructor(db: Database, wss: WebSocket.Server) {
    this.db = db;
    this.wss = wss;
    this.outputDir = process.env.VYTDL_OUTPUT_DIR || "./downloads";
  }

  async startAnalysis(youtubeUrl: string): Promise<string> {
    const id = uuidv4();
    const videoId = extractVideoId(youtubeUrl);

    this.db.createVttReport({
      id,
      youtube_url: youtubeUrl,
      video_id: videoId,
      title: null,
      language: null,
      content: "",
      cue_count: 0,
      duration_sec: null,
      created_at: new Date().toISOString(),
      status: "pending",
      error: null,
    });

    this.broadcast("vtt-report:status", { reportId: id, status: "pending" });

    setImmediate(() => this.runAnalysis(id, youtubeUrl));

    return id;
  }

  private async runAnalysis(id: string, youtubeUrl: string) {
    const vttDir = path.join(this.outputDir, "vtt-temp", id);
    let report: VttReport | undefined;

    try {
      await fs.mkdir(vttDir, { recursive: true });

      this.db.updateVttReport(id, { status: "processing" });
      this.broadcast("vtt-report:status", { reportId: id, status: "processing" });

      const videoInfo = await this.fetchVideoInfo(youtubeUrl);
      const { language, vttPath } = await this.downloadVtt(youtubeUrl, vttDir);

      if (!vttPath) {
        throw new Error("No subtitles available for this video");
      }

      const markdown = await this.convertVttToMarkdown(vttPath);
      const cueCount = this.countCues(markdown);
      const durationSec = videoInfo?.duration ?? null;

      this.db.updateVttReport(id, {
        title: videoInfo?.title ?? null,
        language,
        content: markdown,
        cue_count: cueCount,
        duration_sec: durationSec,
        video_id: extractVideoId(youtubeUrl),
        status: "done",
      });

      this.broadcast("vtt-report:complete", { reportId: id });

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.db.updateVttReport(id, { status: "failed", error });
      this.broadcast("vtt-report:status", { reportId: id, status: "failed", error });
    } finally {
      report = this.db.getVttReport(id);
      if (report?.status === "done" || report?.status === "failed") {
        try {
          await fs.rm(vttDir, { recursive: true, force: true });
        } catch { /* ignore cleanup errors */ }
      }
    }
  }

  private async fetchVideoInfo(url: string): Promise<{ title: string; duration: number } | null> {
    try {
      const { stdout } = await runYtDlp(
        ["--dump-json", "--no-playlist", "--skip-download", url],
        30000
      );
      const data = JSON.parse(stdout.trim());
      return {
        title: data.title || "Unknown",
        duration: data.duration || 0,
      };
    } catch {
      return null;
    }
  }

  private async downloadVtt(
    url: string,
    outputDir: string
  ): Promise<{ language: string; vttPath: string }> {
    const langs = ["zh", "en", "ja", "ko", "zh-Hans", "zh-Hant"];

    for (const lang of langs) {
      try {
        const outTemplate = path.join(outputDir, "%(id)s.%(lang)s.vtt");
        await runYtDlp(
          [
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", lang,
            "--skip-download",
            "-o", outTemplate,
            url,
          ],
          60000
        );

        const files = await fs.readdir(outputDir);
        const vttFile = files.find(
          (f) => f.endsWith(".vtt") && (f.includes(`.${lang}.`) || f.includes(`.${lang}-`))
        );

        if (vttFile) {
          return { language: lang, vttPath: path.join(outputDir, vttFile) };
        }
      } catch { /* try next lang */ }
    }

    throw new Error("No subtitles found");
  }

  private async convertVttToMarkdown(vttPath: string): Promise<string> {
    const cliPath = findVytdlCli();

    return new Promise((resolve, reject) => {
      const child = spawn(cliPath, ["analyze", "--mode", "markdown", vttPath]);
      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `vYtDL analyze failed with code ${code}`));
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to run vYtDL CLI: ${err.message}`));
      });
    });
  }

  private countCues(markdown: string): number {
    const matches = markdown.match(/\d{2}:\d{2}:\d{2}\s+\S/g);
    return matches ? matches.length : 0;
  }

  private broadcast(type: string, data: Record<string, unknown>) {
    const message = JSON.stringify({ type, ...data });
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }
}
