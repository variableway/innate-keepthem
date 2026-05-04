use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;


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
}

impl Downloader {
    pub fn new(options: DownloadOptions, download_id: String) -> Self {
        Self {
            options,
            download_id,
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
        }
    }

    pub async fn download<F>(&self, mut on_progress: F) -> Result<DownloadOutput, String>
    where
        F: FnMut(DownloadProgress),
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
                    if let Ok(Some(_line)) = line {
                        // Log stderr if needed
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
            return Err("yt-dlp process failed".to_string());
        }

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
        
        let output = Command::new(&yt_dlp_path)
            .args(&["--dump-json", "--no-download", url])
            .output()
            .await
            .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "yt-dlp failed: {}",
                String::from_utf8_lossy(&output.stderr)
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
        let output = Command::new(&yt_dlp_path)
            .args(&["--dump-json", "--no-download", url])
            .output()
            .await
            .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "yt-dlp failed: {}",
                String::from_utf8_lossy(&output.stderr)
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
        let output = Command::new(&yt_dlp_path)
            .args(&["--dump-single-json", "--flat-playlist", url])
            .output()
            .await
            .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "yt-dlp failed: {}",
                String::from_utf8_lossy(&output.stderr)
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
        // Try environment variable first
        if let Ok(path) = std::env::var("YT_DLP_BIN") {
            if tokio::fs::metadata(&path).await.is_ok() {
                return Ok(path);
            }
        }

        // Try common binary names
        for bin in &["yt-dlp", "youtube-dl"] {
            if let Ok(output) = Command::new("which").arg(bin).output().await {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Ok(path);
                    }
                }
            }
        }

        Err("yt-dlp not found. Please install yt-dlp and ensure it's in PATH".to_string())
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
