use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Standard proxy env vars that Python's urllib (and yt-dlp) recognizes.
const ALLOWED_PROXY_VARS: &[&str] = &[
    "HTTP_PROXY", "http_proxy",
    "HTTPS_PROXY", "https_proxy",
    "ALL_PROXY", "all_proxy",
    "NO_PROXY", "no_proxy",
    "FTP_PROXY", "ftp_proxy",
];

/// Collect non-standard `*_proxy` env var keys that should be removed before
/// spawning yt-dlp. Python's urllib treats ANY env var ending in `_proxy` as a
/// proxy setting. npm/pnpm set `npm_config_proxy` / `npm_config_https_proxy`,
/// which causes Python to skip macOS system proxy detection and return only
/// the npm_config proxies. Since `npm_config` is not a valid protocol, HTTP/HTTPS
/// requests end up with NO proxy at all, causing yt-dlp to hang on direct
/// connections blocked by the firewall.
fn proxy_vars_to_remove() -> Vec<String> {
    std::env::vars()
        .filter(|(key, _)| {
            let lower = key.to_lowercase();
            lower.ends_with("_proxy") && !ALLOWED_PROXY_VARS.contains(&key.as_str())
        })
        .map(|(key, _)| key)
        .collect()
}

/// Run a yt-dlp command in a blocking thread to avoid potential async runtime deadlocks.
/// Tauri v2's Tokio runtime can deadlock when using `tokio::process::Command::output()`
/// because the child process may block on pipe I/O while the runtime worker threads are busy.
async fn run_yt_dlp_blocking(
    yt_dlp_path: String,
    args: Vec<String>,
    timeout_secs: u64,
) -> Result<std::process::Output, String> {
    let result = tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        tokio::task::spawn_blocking(move || {
            let mut cmd = std::process::Command::new(&yt_dlp_path);
            cmd.args(&args);
            for key in proxy_vars_to_remove() {
                cmd.env_remove(&key);
            }
            cmd.output()
        }),
    )
    .await
    .map_err(|_| "Request timed out while executing yt-dlp. YouTube may require cookies or the video may be blocked.".to_string())?
    .map_err(|e| format!("Blocking task panicked: {}", e))?
    .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;
    
    Ok(result)
}


#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadOptions {
    pub url: String,
    pub is_playlist: bool,
    pub quality: Option<String>,
    /// 精确 format_id（v1/v2 的 Format Picker 路线）；优先于 quality
    pub format_id: Option<String>,
    pub format: Option<String>,
    pub output_dir: Option<String>,
    pub sub_langs: Option<Vec<String>>,
    pub write_subs: bool,
    pub write_auto_subs: bool,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    // ── 参数包（借鉴 yt-dlp-gui / v2，见 docs/suggestions/borrow-from-yt-dlp-guis.md）──
    pub cookie: Option<crate::cookie::CookieConfig>,
    pub proxy: Option<String>,
    pub rate_limit: Option<String>,
    pub concurrent_fragments: Option<u32>,
    /// 嵌入类后处理：缩略图/元数据/章节
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,
    pub embed_chapters: bool,
    pub sponsorblock_remove: bool,
    /// 输出文件名模板（如 "%(title).200s [%(id)s].%(ext)s"）
    pub filename_template: Option<String>,
    /// PO Token / 自由 extractor-args（YouTube 403/429 场景）
    pub po_token: Option<String>,
    pub extractor_args: Option<String>,
    /// 用户自带 yt-dlp 配置文件；None 时强制 --ignore-config（v2 坑知识 #6）
    pub config_location: Option<String>,
    /// 韧性引擎降级重试时由调用方置位（关闭缩略图嵌入）
    pub disable_thumbnail_embed: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DownloadProgress {
    pub video_id: Option<String>,
    pub title: Option<String>,
    pub percent: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub status: String,
    pub error: Option<String>,
    /// 视频/音频双进度槽（CSV format_id 路由；None 表示单流）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_percent: Option<f64>,
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
    _webpage_url: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
}

pub struct Downloader {
    options: DownloadOptions,
    _download_id: String,
    yt_dlp_path: Option<String>,
    app_data_dir: Option<std::path::PathBuf>,
}

impl Downloader {
    pub fn new(options: DownloadOptions, download_id: String) -> Self {
        Self {
            options,
            _download_id: download_id,
            yt_dlp_path: None,
            app_data_dir: None,
        }
    }

    pub fn with_app_data_dir(mut self, dir: Option<std::path::PathBuf>) -> Self {
        self.app_data_dir = dir;
        self
    }

    pub fn new_default() -> Self {
        Self {
            options: DownloadOptions {
                url: String::new(),
                write_subs: true,
                write_auto_subs: true,
                ..Default::default()
            },
            _download_id: String::new(),
            yt_dlp_path: None,
            app_data_dir: None,
        }
    }

    pub fn with_yt_dlp_path(mut self, path: Option<String>) -> Self {
        self.yt_dlp_path = path;
        self
    }

    pub async fn run_yt_dlp(&self, args: Vec<String>, timeout_secs: u64) -> Result<std::process::Output, String> {
        let yt_dlp_path = self.find_yt_dlp().await?;
        run_yt_dlp_blocking(yt_dlp_path, args, timeout_secs).await
    }

    pub async fn download<F, G>(&self, mut on_progress: F, mut on_log: G, cancel_rx: &mut tokio::sync::mpsc::Receiver<()>) -> Result<DownloadOutput, String>
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

        // ── 公共参数（v2 apply_common_yt_dlp_args 思路）──
        // 坑知识 #6：未显式选 config 时强制 --ignore-config，防用户家目录配置干扰
        if let Some(loc) = &self.options.config_location {
            args.push("--config-locations".to_string());
            args.push(loc.clone());
        } else {
            args.push("--ignore-config".to_string());
        }
        args.push("--windows-filenames".to_string()); // 跨平台安全文件名
        if let Some(proxy) = &self.options.proxy {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
            args.push("--no-check-certificates".to_string()); // 自架代理常见自签证书
        }
        if let Some(cookie_cfg) = &self.options.cookie {
            let cookie_args = cookie_cfg.to_args(self.app_data_dir.as_deref())?;
            args.extend(cookie_args);
        }
        if let Some(rate) = &self.options.rate_limit {
            args.push("-r".to_string());
            args.push(rate.clone());
        }
        if let Some(frag) = self.options.concurrent_fragments {
            args.push("--concurrent-fragments".to_string());
            args.push(frag.to_string());
        }
        if let Some(po) = &self.options.po_token {
            let mut ea = format!("youtube:po_token={po}");
            if let Some(extra) = &self.options.extractor_args {
                ea.push_str(&format!(";{extra}"));
            }
            args.push("--extractor-args".to_string());
            args.push(ea);
        } else if let Some(extra) = &self.options.extractor_args {
            args.push("--extractor-args".to_string());
            args.push(format!("youtube:{extra}"));
        }

        // ── 格式选择：format_id（Format Picker）优先，其次 quality 预设 ──
        let has_sections = self.options.start_time.is_some() || self.options.end_time.is_some();
        if let Some(fid) = &self.options.format_id {
            args.push("-f".to_string());
            args.push(fid.clone());
        } else if let Some(quality) = &self.options.quality {
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
            // 坑知识 #2：webm 容器不支持封面内嵌
            if format == "webm" && self.options.embed_thumbnail {
                args.push("--no-embed-thumbnail".to_string());
            }
        }

        // Output template（支持自定义模板，默认防超长截断，v1 经验）
        args.push("-o".to_string());
        let tmpl = self
            .options
            .filename_template
            .clone()
            .unwrap_or_else(|| "%(title).200s [%(id)s].%(ext)s".to_string());
        args.push(format!("{}/{}", output_dir, tmpl));

        // Subtitles
        if self.options.write_subs {
            args.push("--write-subs".to_string());
            if self.options.write_auto_subs {
                args.push("--write-auto-subs".to_string());
                // 坑知识 #3：自动/翻译字幕加间隔防限流
                args.push("--sleep-subtitles".to_string());
                args.push("1".to_string());
            }
            if let Some(langs) = &self.options.sub_langs {
                args.push("--sub-langs".to_string());
                args.push(langs.join(","));
            }
        }

        // 嵌入类后处理（v2 三态简化为开关）
        if self.options.embed_metadata {
            args.push("--embed-metadata".to_string());
        }
        if self.options.embed_chapters {
            args.push("--embed-chapters".to_string());
        }
        if self.options.embed_thumbnail && !self.options.disable_thumbnail_embed {
            let webm_block = self.options.format.as_deref() == Some("webm");
            if !webm_block {
                args.push("--embed-thumbnail".to_string());
            }
        }
        if self.options.sponsorblock_remove {
            args.push("--sponsorblock-remove".to_string());
            args.push("all".to_string());
        }

        // Time range
        if has_sections {
            let mut section = String::new();
            section.push('*');
            section.push_str(&self.options.start_time.clone().unwrap_or_else(|| "0".to_string()));
            section.push('-');
            section.push_str(&self.options.end_time.clone().unwrap_or_else(|| "inf".to_string()));
            args.push("--download-sections".to_string());
            args.push(section);
            args.push("--force-keyframes-at-cuts".to_string());
            // 坑知识 #1：章节裁剪需禁用直下合并 + muxed 安全选择器，否则进度卡死
            args.push("--compat-options".to_string());
            args.push("no-direct-merge".to_string());
            if self.options.format_id.is_none() {
                // 只有非精确格式选择时才覆盖选择器
                if let Some(pos) = args.iter().position(|a| a == "-f") {
                    args[pos + 1] = crate::resilience::SECTION_SAFE_SELECTOR.to_string();
                }
            }
        }

        // Playlist handling
        if !self.options.is_playlist {
            args.push("--no-playlist".to_string());
        }

        // ── 进度与输出捕获（v2 CSV 模板 + format_id 槽路由）──
        args.push("--newline".to_string());
        args.push("--progress".to_string());
        args.push("--progress-template".to_string());
        args.push("download:VYTDL_PROG,%(info.format_id)s,%(progress._percent_str)s,%(progress.downloaded_bytes)s,%(progress.total_bytes_estimate)s,%(progress.speed)s,%(progress.eta)s".to_string());
        args.push("--print-json".to_string());
        // 精确输出路径捕获（v1/v2）：后处理改名后仍准确；Windows GBK 免疫
        let path_tmp = self
            .app_data_dir
            .clone()
            .unwrap_or_else(|| std::env::temp_dir())
            .join(format!("vytdl-path-{}.txt", self._download_id));
        args.push("--print-to-file".to_string());
        args.push("after_move:filepath".to_string());
        args.push(path_tmp.to_string_lossy().to_string());

        // URL
        args.push(self.options.url.clone());

        // Log the command being executed
        let cmd_str = format!("{} {}", yt_dlp_path, args.join(" "));
        on_log(DownloadLog {
            level: "info".to_string(),
            message: format!("Starting download: {}", cmd_str),
        });

        // Spawn yt-dlp process
        let mut child = {
            let mut cmd = Command::new(&yt_dlp_path);
            cmd.args(&args);
            for key in proxy_vars_to_remove() {
                cmd.env_remove(&key);
            }
            // v1/v2 同款：强制 UTF-8 输出；Windows 不弹控制台窗
            cmd.env("PYTHONUTF8", "1");
            cmd.env("PYTHONIOENCODING", "utf-8");
            #[cfg(windows)]
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            cmd.stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?
        };
        // 注册 pid（暂停/恢复/进程树取消用）
        if let Some(pid) = child.id() {
            crate::process_control::register_child(&self._download_id, pid);
        }

        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        let mut last_info: Option<VideoInfoJson> = None;
        // CSV 槽路由状态：format_id -> 是否视频轨（视频/音频双进度）
        // 坑知识 #4：数字 format_id 不能当百分比，必须按列解析
        let mut video_percent: f64 = 0.0;
        let mut audio_percent: f64 = 0.0;
        let mut last_speed: Option<String> = None;
        let mut last_eta: Option<String> = None;
        let fallback_progress_re = regex::Regex::new(r"\[download\]\s+([\d.]+)%").ok();
        let mut stderr_all: String = String::new();
        let mut stdout_all: String = String::new();

        // Read stdout
        loop {
            tokio::select! {
                biased;
                _ = cancel_rx.recv() => {
                    // 进程树取消（防孤儿 ffmpeg/aria2）+ .part 清理（v1 经验）
                    let _ = child.kill().await;
                    crate::process_control::kill_tree(self._download_id.clone()).await;
                    on_log(DownloadLog {
                        level: "info".to_string(),
                        message: "Download cancelled, cleaning partial files".to_string(),
                    });
                    let _ = tokio::fs::remove_file(&path_tmp).await;
                    if let Ok(mut entries) = tokio::fs::read_dir(&output_dir).await {
                        while let Ok(Some(e)) = entries.next_entry().await {
                            let name = e.file_name().to_string_lossy().to_string();
                            if name.ends_with(".part") || name.ends_with(".ytdl") || name.ends_with(".part-Frag") {
                                let _ = tokio::fs::remove_file(e.path()).await;
                            }
                        }
                    }
                    return Err("Download cancelled".to_string());
                }
                line = stdout_reader.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            // Emit every stdout line as a log
                            on_log(DownloadLog {
                                level: "info".to_string(),
                                message: line.clone(),
                            });

                            stdout_all.push_str(&line);
                            stdout_all.push('\n');
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
                                        ..Default::default()
                                    });
                                }
                            } else if let Some(rest) = line.strip_prefix("VYTDL_PROG,") {
                                // CSV: format_id, percent, downloaded, total_estimate, speed, eta
                                let cols: Vec<&str> = rest.split(',').collect();
                                if cols.len() >= 6 {
                                    let fid = cols[0].trim();
                                    let percent: f64 = cols[1]
                                        .trim()
                                        .trim_end_matches('%')
                                        .parse()
                                        .unwrap_or(0.0);
                                    // 槽路由：以 v 开头的 format_id（如 v137）视为视频轨，
                                    // 纯数字/a 开头视为音频轨；未知时按已见视频轨退化处理
                                    let is_video = fid.starts_with('v');
                                    if is_video {
                                        video_percent = percent;
                                    } else {
                                        audio_percent = percent;
                                    }
                                    last_speed = crate::resilience::human_bytes_speed(cols[4]);
                                    last_eta = Some(cols[5].trim().to_string()).filter(|s| !s.is_empty() && s != "NA");
                                    // 综合进度：两条流都活跃时取平均，否则取活跃那条
                                    let combined = if video_percent > 0.0 && audio_percent > 0.0 {
                                        (video_percent + audio_percent) / 2.0
                                    } else {
                                        percent
                                    };
                                    on_progress(DownloadProgress {
                                        video_id: last_info.as_ref().map(|i| i.id.clone()),
                                        title: last_info.as_ref().map(|i| i.title.clone()),
                                        percent: combined,
                                        speed: last_speed.clone(),
                                        eta: last_eta.clone(),
                                        status: "downloading".to_string(),
                                        error: None,
                                        audio_percent: if audio_percent > 0.0 { Some(audio_percent) } else { None },
                                        video_percent: if video_percent > 0.0 { Some(video_percent) } else { None },
                                    });
                                }
                            } else if let Some(re) = &fallback_progress_re {
                                // 兜底：默认 [download] x% 行
                                if let Some(caps) = re.captures(&line) {
                                    let percent: f64 = caps[1].parse().unwrap_or(0.0);
                                    on_progress(DownloadProgress {
                                        video_id: last_info.as_ref().map(|i| i.id.clone()),
                                        title: last_info.as_ref().map(|i| i.title.clone()),
                                        percent,
                                        speed: None,
                                        eta: None,
                                        status: "downloading".to_string(),
                                        error: None,
                                        ..Default::default()
                                    });
                                }
                            }
                        }
                        Ok(None) => break,
                        Err(e) => return Err(format!("Error reading stdout: {}", e)),
                    }
                }
                line = stderr_reader.next_line() => {
                    if let Ok(Some(line)) = line {
                        stderr_all.push_str(&line);
                        stderr_all.push('\n');
                        on_log(DownloadLog {
                            level: "error".to_string(),
                            message: line,
                        });
                    } else {
                        // stderr closed
                    }
                }
            }
        }

        // Wait for process to complete
        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;
        crate::process_control::unregister_child(&self._download_id);

        if !status.success() {
            on_log(DownloadLog {
                level: "error".to_string(),
                message: format!("yt-dlp exited with status: {:?}", status.code()),
            });
            // 韧性引擎：分类失败原因，错误消息带类别与提示（前端徽章/按钮用）
            let kind = crate::resilience::classify_download_error(&stdout_all, &stderr_all, false);
            let _ = tokio::fs::remove_file(&path_tmp).await;
            return Err(format!(
                "[{}] {} | {}",
                serde_json::to_string(&kind).unwrap_or_default(),
                kind.label(),
                kind.hint()
            ));
        }

        on_log(DownloadLog {
            level: "info".to_string(),
            message: "Download completed successfully".to_string(),
        });

        // 精确输出路径：--print-to-file 结果优先，回退 title 拼接（坑知识 #5 补充）
        let exact_path: Option<String> = tokio::fs::read_to_string(&path_tmp)
            .await
            .ok()
            .and_then(|s| s.lines().map(str::trim).filter(|l| !l.is_empty()).last().map(String::from));
        let _ = tokio::fs::remove_file(&path_tmp).await;

        // Construct output
        if let Some(info) = last_info {
            let ext = self.options.format.clone().unwrap_or_else(|| "mp4".to_string());
            // 精确路径优先（含后处理改名/容器转换后的真实文件名）
            let filename = exact_path.unwrap_or_else(|| {
                format!("{}/{}.{}", output_dir, sanitize_filename(&info.title), ext)
            });

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
        
        let args = vec![
            "--dump-json".to_string(),
            "--no-download".to_string(),
            "--socket-timeout".to_string(),
            "10".to_string(),
            "--no-warnings".to_string(),
            url.to_string(),
        ];
        
        let output = run_yt_dlp_blocking(yt_dlp_path, args, 30).await?;

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
        
        let args = vec![
            "--dump-json".to_string(),
            "--no-download".to_string(),
            "--socket-timeout".to_string(),
            "10".to_string(),
            "--no-warnings".to_string(),
            url.to_string(),
        ];
        
        let output = run_yt_dlp_blocking(yt_dlp_path, args, 60).await?;

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
        
        let args = vec![
            "--dump-single-json".to_string(),
            "--flat-playlist".to_string(),
            "--socket-timeout".to_string(),
            "10".to_string(),
            "--no-warnings".to_string(),
            url.to_string(),
        ];
        
        let output = run_yt_dlp_blocking(yt_dlp_path, args, 90).await?;

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
            _webpage_url: Option<String>,
            _url: Option<String>,
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
                webpage_url: e._webpage_url.unwrap_or_else(|| 
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_info_blocking() {
        // Verify Downloader::get_info() works with the spawn_blocking approach.
        let url = "https://www.youtube.com/watch?v=oOCN30ulVyo";
        let downloader = Downloader::new_default();
        
        let result = tokio::time::timeout(
            Duration::from_secs(30),
            downloader.get_info(url)
        ).await;
        
        match result {
            Ok(Ok(info)) => {
                println!("✅ get_info() success: {} (id={})", info.title, info.id);
                assert!(!info.title.is_empty(), "Title should not be empty");
                assert!(!info.id.is_empty(), "ID should not be empty");
            }
            Ok(Err(e)) => {
                panic!("❌ get_info() returned error: {}", e);
            }
            Err(_) => {
                panic!("❌ get_info() timed out after 30s — blocking fix did not work");
            }
        }
    }
}
