use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;


#[derive(Debug, Clone, Serialize)]
pub struct DownloadOptions {
    pub url: String,
    pub is_playlist: bool,
    pub quality: Option<String>,
    pub format: Option<String>,
    pub output_dir: Option<String>,
    pub sub_langs: Option<Vec<String>>,
    pub write_subs: bool,
    pub write_auto_subs: bool,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub video_id: Option<String>,
    pub title: Option<String>,
    pub percent: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadLog {
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadOutput {
    pub title: String,
    pub filename: String,
    pub subtitles: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct VideoInfoJson {
    id: String,
    title: String,
    #[serde(default)]
    webpage_url: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
}

pub struct Downloader {
    options: DownloadOptions,
    download_id: String,
    yt_dlp_path: Option<String>,
}

impl Downloader {
    pub fn new(options: DownloadOptions, download_id: String) -> Self {
        Self {
            options,
            download_id,
            yt_dlp_path: None,
        }
    }

    pub fn new_default() -> Self {
        Self {
            options: DownloadOptions {
                url: String::new(),
                is_playlist: false,
                quality: None,
                format: None,
                output_dir: None,
                sub_langs: None,
                write_subs: true,
                write_auto_subs: true,
                start_time: None,
                end_time: None,
            },
            download_id: String::new(),
            yt_dlp_path: None,
        }
    }

    pub fn with_yt_dlp_path(mut self, path: Option<String>) -> Self {
        self.yt_dlp_path = path;
        self
    }

    pub async fn download<F, G>(&self, mut on_progress: F, mut on_log: G) -> Result<DownloadOutput, String>
    where
        F: FnMut(DownloadProgress),
        G: FnMut(DownloadLog),
    {
        let yt_dlp_path = self.find_yt_dlp().await?;
        let output_dir = self
            .options
            .output_dir
            .clone()
            .unwrap_or_else(|| self.default_download_dir());

        // Ensure output directory exists
        tokio::fs::create_dir_all(&output_dir)
            .await
            .map_err(|e| format!("Failed to create output directory: {}", e))?;

        let mut args = vec![];

        // Format selection
        if let Some(quality) = &self.options.quality {
            if quality != "best" {
                args.push("-f".to_string());
                args.push(format!("bestvideo[height<={}]+bestaudio/best[height<={}]", quality, quality));
            } else {
                args.push("-f".to_string());
                args.push("bestvideo+bestaudio/best".to_string());
            }
        } else {
            args.push("-f".to_string());
            args.push("bestvideo+bestaudio/best".to_string());
        }

        // Output format
        if let Some(format) = &self.options.format {
            args.push("--merge-output-format".to_string());
            args.push(format.clone());
        }

        // Output template
        args.push("-o".to_string());
        args.push(format!("{}/%(title)s.%(ext)s", output_dir));

        // Subtitles
        if self.options.write_subs {
            args.push("--write-subs".to_string());
            if self.options.write_auto_subs {
                args.push("--write-auto-subs".to_string());
            }
            if let Some(langs) = &self.options.sub_langs {
                args.push("--sub-langs".to_string());
                args.push(langs.join(","));
            }
        }

        // Time range
        if self.options.start_time.is_some() || self.options.end_time.is_some() {
            let mut section = String::new();
            section.push('*');
            section.push_str(&self.options.start_time.clone().unwrap_or_else(|| "0".to_string()));
            section.push('-');
            section.push_str(&self.options.end_time.clone().unwrap_or_else(|| "inf".to_string()));
            args.push("--download-sections".to_string());
            args.push(section);
            args.push("--force-keyframes-at-cuts".to_string());
        }

        // Playlist handling
        if !self.options.is_playlist {
            args.push("--no-playlist".to_string());
        }

        // Progress output
        args.push("--newline".to_string());
        args.push("--progress".to_string());
        args.push("--print-json".to_string());

        // URL
        args.push(self.options.url.clone());

        // Log the command being executed
        let cmd_str = format!("{} {}", yt_dlp_path, args.join(" "));
        on_log(DownloadLog {
            level: "info".to_string(),
            message: format!("Starting download: {}", cmd_str),
        });

        // Spawn yt-dlp process
        let mut child = Command::new(&yt_dlp_path)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        let mut last_info: Option<VideoInfoJson> = None;
        let progress_re = regex::Regex::new(r"\[download\]\s+([\d.]+)%.*?at\s+(\S+)\s+ETA\s+(\S+)")
            .map_err(|e| format!("Failed to compile regex: {}", e))?;

        // Read stdout
        loop {
            tokio::select! {
                line = stdout_reader.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            // Emit every stdout line as a log
                            on_log(DownloadLog {
                                level: "info".to_string(),
                                message: line.clone(),
                            });

                            // Try to parse as JSON (video metadata)
                            if line.starts_with('{') {
                                if let Ok(info) = serde_json::from_str::<VideoInfoJson>(&line) {
                                    last_info = Some(info.clone());
                                    on_progress(DownloadProgress {
                                        video_id: Some(info.id.clone()),
                                        title: Some(info.title.clone()),
                                        percent: 0.0,
                                        speed: None,
                                        eta: None,
                                        status: "downloading".to_string(),
                                        error: None,
                                    });
                                }
                            } else if let Some(caps) = progress_re.captures(&line) {
                                // Parse progress line
                                let percent: f64 = caps[1].parse().unwrap_or(0.0);
                                let speed = caps[2].to_string();
                                let eta = caps[3].to_string();

                                on_progress(DownloadProgress {
                                    video_id: last_info.as_ref().map(|i| i.id.clone()),
                                    title: last_info.as_ref().map(|i| i.title.clone()),
                                    percent,
                                    speed: Some(speed),
                                    eta: Some(eta),
                                    status: "downloading".to_string(),
                                    error: None,
                                });
                            }
                        }
                        Ok(None) => break,
                        Err(e) => return Err(format!("Error reading stdout: {}", e)),
                    }
                }
                line = stderr_reader.next_line() => {
                    if let Ok(Some(line)) = line {
                        on_log(DownloadLog {
                            level: "error".to_string(),
                            message: line,
                        });
                    }
                }
            }
        }

        // Wait for process to complete
        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;

        if !status.success() {
            on_log(DownloadLog {
                level: "error".to_string(),
                message: format!("yt-dlp exited with status: {:?}", status.code()),
            });
            return Err("yt-dlp process failed".to_string());
        }

        on_log(DownloadLog {
            level: "info".to_string(),
            message: "Download completed successfully".to_string(),
        });

        // Construct output
        if let Some(info) = last_info {
            let ext = self.options.format.clone().unwrap_or_else(|| "mp4".to_string());
            let filename = format!("{}/{}.{}", output_dir, sanitize_filename(&info.title), ext);
            
            // Collect subtitle files
            let subtitles = self.find_subtitle_files(&output_dir, &info.title).await;

            Ok(DownloadOutput {
                title: info.title,
                filename,
                subtitles,
            })
        } else {
            Err("No video information received".to_string())
        }
    }

    pub async fn get_info(&self, url: &str) -> Result<super::commands::VideoInfo, String> {
        use crate::commands::VideoInfo;
        
        let yt_dlp_path = self.find_yt_dlp().await?;
        
        let cmd_future = Command::new(&yt_dlp_path)
            .args(&["--dump-json", "--no-download", url])
            .output();
        
        let output = match timeout(Duration::from_secs(60), cmd_future).await {
            Ok(result) => result.map_err(|e| format!("Failed to execute yt-dlp: {}", e))?,
            Err(_) => return Err("Request timed out while fetching video info. YouTube may require cookies or the video may be blocked. Try using --cookies-from-browser or a different URL.".to_string()),
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "yt-dlp failed: {}",
                if stderr.is_empty() { "Unknown error".to_string() } else { stderr.to_string() }
            ));
        }

        let info: VideoInfoJson = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse video info: {}", e))?;

        Ok(VideoInfo {
            id: info.id,
            title: info.title,
            duration: info.duration.map(|d| d as i64),
            thumbnail: info.thumbnail,
            uploader: info.uploader,
            formats: vec![], // TODO: Parse formats from yt-dlp output
        })
    }

    pub async fn get_formats(&self, url: &str) -> Result<Vec<super::commands::FormatInfo>, String> {
        use crate::commands::FormatInfo;
        
        let yt_dlp_path = self.find_yt_dlp().await?;
        
        // Use --dump-json to get all format information
        let cmd_future = Command::new(&yt_dlp_path)
            .args(&["--dump-json", "--no-download", url])
            .output();
        
        let output = match timeout(Duration::from_secs(60), cmd_future).await {
            Ok(result) => result.map_err(|e| format!("Failed to execute yt-dlp: {}", e))?,
            Err(_) => return Err("Request timed out while fetching video formats.".to_string()),
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "yt-dlp failed: {}",
                if stderr.is_empty() { "Unknown error".to_string() } else { stderr.to_string() }
            ));
        }

        #[derive(Debug, Deserialize)]
        struct YtdlpFormat {
            format_id: String,
            ext: String,
            resolution: Option<String>,
            fps: Option<f64>,
            filesize: Option<i64>,
            filesize_approx: Option<i64>,
            vcodec: Option<String>,
            acodec: Option<String>,
            vbr: Option<f64>,
            abr: Option<f64>,
            asr: Option<i64>,
            quality: Option<i64>,
            format_note: Option<String>,
        }

        #[derive(Debug, Deserialize)]
        struct YtdlpInfo {
            formats: Vec<YtdlpFormat>,
        }

        let info: YtdlpInfo = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse formats: {}", e))?;

        let formats: Vec<FormatInfo> = info.formats.into_iter()
            .map(|f| FormatInfo {
                format_id: f.format_id,
                ext: f.ext,
                resolution: f.resolution,
                fps: f.fps.map(|v| v as i32),
                filesize: f.filesize,
                filesize_approx: f.filesize_approx,
                video_codec: f.vcodec,
                audio_codec: f.acodec,
                vbr: f.vbr,
                abr: f.abr,
                asr: f.asr,
                quality: f.format_note.unwrap_or_else(|| {
                    f.quality.map(|q| format!("{}", q)).unwrap_or_default()
                }),
            })
            .collect();

        Ok(formats)
    }

    pub async fn get_playlist_info(&self, url: &str) -> Result<super::commands::PlaylistInfo, String> {
        use crate::commands::{PlaylistInfo, PlaylistVideo};
        
        let yt_dlp_path = self.find_yt_dlp().await?;
        
        // Use --dump-single-json to get playlist info with entries
        let cmd_future = Command::new(&yt_dlp_path)
            .args(&["--dump-single-json", "--flat-playlist", url])
            .output();
        
        let output = match timeout(Duration::from_secs(90), cmd_future).await {
            Ok(result) => result.map_err(|e| format!("Failed to execute yt-dlp: {}", e))?,
            Err(_) => return Err("Request timed out while fetching playlist info.".to_string()),
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "yt-dlp failed: {}",
                if stderr.is_empty() { "Unknown error".to_string() } else { stderr.to_string() }
            ));
        }

        #[derive(Debug, Deserialize)]
        struct YtdlpPlaylist {
            id: String,
            title: String,
            uploader: Option<String>,
            description: Option<String>,
            thumbnail: Option<String>,
            webpage_url: String,
            entries: Vec<YtdlpEntry>,
        }

        #[derive(Debug, Deserialize)]
        struct YtdlpEntry {
            id: String,
            title: String,
            duration: Option<f64>,
            thumbnail: Option<String>,
            uploader: Option<String>,
            webpage_url: Option<String>,
            url: Option<String>,
        }

        let info: YtdlpPlaylist = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse playlist info: {}", e))?;

        let entries: Vec<PlaylistVideo> = info.entries.into_iter()
            .map(|e| PlaylistVideo {
                id: e.id.clone(),
                title: e.title,
                duration: e.duration.map(|d| d as i64),
                thumbnail: e.thumbnail,
                uploader: e.uploader,
                webpage_url: e.webpage_url.unwrap_or_else(|| 
                    format!("https://www.youtube.com/watch?v={}", e.id)
                ),
            })
            .collect();

        Ok(PlaylistInfo {
            id: info.id,
            title: info.title,
            uploader: info.uploader,
            description: info.description,
            thumbnail: info.thumbnail,
            entries,
            webpage_url: info.webpage_url,
        })
    }

    async fn find_yt_dlp(&self) -> Result<String, String> {
        // 1. Try configured path from settings first
        if let Some(ref path) = self.yt_dlp_path {
            if tokio::fs::metadata(path).await.is_ok() {
                return Ok(path.clone());
            }
        }

        // 2. Try environment variable
        if let Ok(path) = std::env::var("YT_DLP_BIN") {
            if tokio::fs::metadata(&path).await.is_ok() {
                return Ok(path);
            }
        }

        // 3. Check bundled yt-dlp extracted from app resources on startup
        if let Ok(path) = std::env::var("VYTLD_BUNDLED_YT_DLP") {
            if tokio::fs::metadata(&path).await.is_ok() {
                return Ok(path);
            }
        }

        // 4. Cross-platform PATH lookup
        let is_windows = std::env::consts::OS == "windows";
        let lookup_cmd = if is_windows { "where" } else { "which" };
        let binaries = if is_windows {
            vec!["yt-dlp.exe", "yt-dlp", "youtube-dl.exe", "youtube-dl"]
        } else {
            vec!["yt-dlp", "youtube-dl"]
        };

        for bin in &binaries {
            if let Ok(output) = Command::new(lookup_cmd).arg(bin).output().await {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !path.is_empty() && tokio::fs::metadata(&path).await.is_ok() {
                        return Ok(path);
                    }
                }
            }
        }

        // 5. Common installation paths
        let common_paths = if is_windows {
            vec![
                r"C:\Users\%USERNAME%\AppData\Local\Microsoft\WinGet\Links\yt-dlp.exe",
                r"C:\ProgramData\chocolatey\bin\yt-dlp.exe",
                r"C:\Users\%USERNAME%\.local\bin\yt-dlp.exe",
            ]
        } else if std::env::consts::OS == "macos" {
            vec![
                "/opt/homebrew/bin/yt-dlp",
                "/usr/local/bin/yt-dlp",
                "/usr/bin/yt-dlp",
                "~/.local/bin/yt-dlp",
            ]
        } else {
            vec![
                "/usr/bin/yt-dlp",
                "/usr/local/bin/yt-dlp",
                "/bin/yt-dlp",
                "~/.local/bin/yt-dlp",
            ]
        };

        for path in &common_paths {
            let expanded = shellexpand::tilde(path).to_string();
            if tokio::fs::metadata(&expanded).await.is_ok() {
                return Ok(expanded);
            }
        }

        Err(self.yt_dlp_install_hint())
    }

    fn yt_dlp_install_hint(&self) -> String {
        let os = std::env::consts::OS;
        let hint = match os {
            "macos" => {
                "yt-dlp not found.\n\n\
                Install hints for macOS:\n\
                • Homebrew: brew install yt-dlp\n\
                • pip: pip3 install yt-dlp\n\
                • Manual: download from https://github.com/yt-dlp/yt-dlp/releases\n\n\
                After installing, ensure yt-dlp is in your PATH, or set the path in Settings."
            }
            "windows" => {
                "yt-dlp not found.\n\n\
                Install hints for Windows:\n\
                • WinGet: winget install yt-dlp\n\
                • Chocolatey: choco install yt-dlp\n\
                • pip: pip install yt-dlp\n\
                • Manual: download from https://github.com/yt-dlp/yt-dlp/releases\n\n\
                After installing, ensure yt-dlp is in your PATH, or set the path in Settings."
            }
            _ => {
                "yt-dlp not found.\n\n\
                Install hints for Linux:\n\
                • pip: pip3 install yt-dlp\n\
                • apt: sudo apt install yt-dlp\n\
                • Manual: download from https://github.com/yt-dlp/yt-dlp/releases\n\n\
                After installing, ensure yt-dlp is in your PATH, or set the path in Settings."
            }
        };
        hint.to_string()
    }

    fn default_download_dir(&self) -> String {
        let home = dirs::download_dir()
            .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
        
        home.join("vYtDL").to_string_lossy().to_string()
    }

    async fn find_subtitle_files(&self, dir: &str, title: &str) -> Vec<String> {
        let mut subtitles = vec![];
        let sanitized = sanitize_filename(title);
        
        let patterns = [
            format!("{}/{}*.vtt", dir, sanitized),
            format!("{}/{}*.srt", dir, sanitized),
        ];

        for pattern in &patterns {
            if let Ok(paths) = glob::glob(pattern) {
                for path in paths.flatten() {
                    subtitles.push(path.to_string_lossy().to_string());
                }
            }
        }

        subtitles
    }
}

fn sanitize_filename(s: &str) -> String {
    let re = regex::Regex::new(r#"[<>:"/\\|?*\x00-\x1f]"#).unwrap();
    let s = re.replace_all(s, "_");
    let s = s.trim();
    if s.len() > 120 {
        s[..120].to_string()
    } else {
        s.to_string()
    }
}
