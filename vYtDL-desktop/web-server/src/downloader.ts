import { spawn } from "child_process";
import { EventEmitter } from "events";

export interface DownloadOptions {
  url: string;
  is_playlist: boolean;
  quality?: string;
  format?: string;
  output_dir?: string;
  sub_langs?: string[];
  write_subs?: boolean;
  write_auto_subs?: boolean;
  start_time?: string;
  end_time?: string;
}

export interface DownloadProgress {
  video_id: string | null;
  title: string | null;
  percent: number;
  speed: string | null;
  eta: string | null;
  status: string;
  error: string | null;
}

export interface DownloadLog {
  level: string;
  message: string;
}

export interface DownloadOutput {
  title: string;
  filename: string;
  subtitles: string[];
}

export interface VideoInfo {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  uploader: string | null;
  formats: Array<{
    format_id: string;
    quality: string;
    resolution: string | null;
    filesize: number | null;
  }>;
}

export interface PlaylistInfo {
  title: string;
  uploader: string | null;
  entries: Array<{
    id: string;
    title: string;
    duration: number | null;
  }>;
}

export function findYtDlp(): string {
  const envPath = process.env.YT_DLP_BIN;
  if (envPath) return envPath;

  const bundled = process.env.VYTLD_BUNDLED_YT_DLP;
  if (bundled) return bundled;

  return "yt-dlp";
}

function runYtDlp(args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const ytDlpPath = findYtDlp();
    const env = { ...process.env };

    // Strip non-standard proxy vars (same fix as Rust backend)
    const allowed = new Set([
      "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
      "http_proxy", "https_proxy", "all_proxy", "no_proxy",
    ]);
    for (const key of Object.keys(env)) {
      if (key.toLowerCase().endsWith("_proxy") && !allowed.has(key)) {
        delete env[key];
      }
    }

    const child = spawn(ytDlpPath, args, { env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeoutMs);

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("yt-dlp command timed out"));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || stdout || `yt-dlp exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await runYtDlp([
    "--dump-json",
    "--no-playlist",
    "--skip-download",
    url,
  ]);
  const data = JSON.parse(stdout.trim().split("\n").pop() || stdout);
  return {
    id: data.id,
    title: data.title || "Unknown",
    duration: data.duration || null,
    thumbnail: data.thumbnail || null,
    uploader: data.uploader || null,
    formats:
      data.formats?.map((f: any) => ({
        format_id: f.format_id,
        quality: f.quality_label || f.quality || f.format_id,
        resolution: f.resolution || null,
        filesize: f.filesize || null,
      })) || [],
  };
}

export async function getVideoFormats(url: string): Promise<VideoInfo["formats"]> {
  const info = await getVideoInfo(url);
  return info.formats;
}

export async function getPlaylistInfo(url: string): Promise<PlaylistInfo> {
  const { stdout } = await runYtDlp(
    ["--dump-json", "--flat-playlist", "--skip-download", url],
    60000
  );
  const lines = stdout.trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => {
    const data = JSON.parse(line);
    return {
      id: data.id,
      title: data.title || "Unknown",
      duration: data.duration || null,
    };
  });

  // Get playlist metadata from first entry's playlist info or do a separate call
  const { stdout: metaStdout } = await runYtDlp(
    ["--dump-single-json", "--flat-playlist", "--skip-download", url],
    60000
  );
  const meta = JSON.parse(metaStdout.trim().split("\n").pop() || metaStdout);

  return {
    title: meta.title || "Playlist",
    uploader: meta.uploader || null,
    entries,
  };
}

const PROGRESS_REGEX =
  /^\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+).*$/;

export function spawnDownload(
  options: DownloadOptions,
  onProgress: (p: DownloadProgress) => void,
  onLog: (log: DownloadLog) => void,
  onCancel: () => boolean
): Promise<DownloadOutput> {
  return new Promise((resolve, reject) => {
    const ytDlpPath = findYtDlp();
    const env = { ...process.env };

    const allowed = new Set([
      "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
      "http_proxy", "https_proxy", "all_proxy", "no_proxy",
    ]);
    for (const key of Object.keys(env)) {
      if (key.toLowerCase().endsWith("_proxy") && !allowed.has(key)) {
        delete env[key];
      }
    }

    const outputDir = options.output_dir || "./downloads";
    const args: string[] = [
      "--newline",
      "--progress",
      "-o",
      `${outputDir}/%(title)s.%(ext)s`,
    ];

    if (options.quality) {
      args.push("-f", options.quality);
    }
    if (options.format) {
      args.push("--merge-output-format", options.format);
    }
    if (options.write_subs && options.sub_langs && options.sub_langs.length > 0) {
      args.push("--write-subs", "--sub-langs", options.sub_langs.join(","));
    }
    if (options.write_auto_subs) {
      args.push("--write-auto-subs");
    }
    if (options.start_time || options.end_time) {
      const sections: string[] = [];
      if (options.start_time) sections.push(options.start_time);
      if (options.end_time) sections.push(options.end_time);
      args.push("--download-sections", `*${sections.join("-")}`);
    }

    args.push(options.url);

    onLog({ level: "info", message: `Starting download: ${options.url}` });
    onLog({ level: "info", message: `Command: ${ytDlpPath} ${args.join(" ")}` });

    const child = spawn(ytDlpPath, args, { env });
    let stdout = "";
    let stderr = "";
    let cancelled = false;

    const checkCancel = setInterval(() => {
      if (onCancel()) {
        cancelled = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5000);
        clearInterval(checkCancel);
      }
    }, 500);

    child.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(PROGRESS_REGEX);
        if (match) {
          const percent = parseFloat(match[1]);
          const speed = match[3];
          const eta = match[4];
          onProgress({
            video_id: null,
            title: null,
            percent,
            speed,
            eta,
            status: "downloading",
            error: null,
          });
        } else if (trimmed.startsWith("[download]")) {
          onLog({ level: "info", message: trimmed });
        }
      }
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        if (line.trim()) {
          onLog({ level: "warn", message: line.trim() });
        }
      }
    });

    child.on("close", (code) => {
      clearInterval(checkCancel);
      if (cancelled) {
        reject(new Error("Download cancelled"));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        return;
      }

      // Parse output for title/filename
      // Try to extract from stdout
      const titleMatch = stdout.match(/\[download\] Destination: (.+)/);
      const title = titleMatch ? titleMatch[1].replace(/\.[^.]+$/, "") : "Downloaded";
      const filename = titleMatch ? titleMatch[1] : `${title}.mp4`;

      // Find subtitle files
      const subFiles: string[] = [];
      const subMatches = stdout.matchAll(/\[info\] Writing video subtitles to: (.+)/g);
      for (const m of subMatches) {
        subFiles.push(m[1]);
      }

      resolve({ title, filename, subtitles: subFiles });
    });

    child.on("error", (err) => {
      clearInterval(checkCancel);
      reject(err);
    });
  });
}
