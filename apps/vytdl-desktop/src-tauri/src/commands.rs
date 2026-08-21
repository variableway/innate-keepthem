use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::audio_extractor;
use crate::database::{Database, DownloadRecord, DownloadStatus, VttReport};
use crate::downloader::{DownloadOptions, Downloader};
use crate::queue::QueueManager;

/// Load yt-dlp binary path from the shared vYtDL config file.
/// Searches in order:
/// 1. VYTDL_CONFIG env var pointing to a custom config file
/// 2. vYtDL-standalone/config.json (canonical CLI checkout) walking up from cwd
/// 3. config.json next to the executable
fn load_vytdl_config_yt_dlp_path() -> Option<String> {
    // 1. Env var override
    if let Ok(path) = std::env::var("VYTDL_CONFIG") {
        if let Some(bin) = parse_yt_dlp_bin_from_file(&path) {
            return Some(bin);
        }
    }

    // 2. Walk up from current dir looking for the CLI config
    if let Ok(mut cwd) = std::env::current_dir() {
        for _ in 0..6 {
            for rel in [
                "vYtDL-standalone/config.json",
                "vYtDL/config.json", // legacy path
            ] {
                let candidate = cwd.join(rel);
                if candidate.exists() {
                    if let Some(bin) = parse_yt_dlp_bin_from_file(candidate.to_str().unwrap_or("")) {
                        return Some(bin);
                    }
                }
            }
            if !cwd.pop() {
                break;
            }
        }
    }

    // 3. Config next to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("config.json");
            if candidate.exists() {
                if let Some(bin) = parse_yt_dlp_bin_from_file(candidate.to_str().unwrap_or("")) {
                    return Some(bin);
                }
            }
        }
    }

    None
}

fn parse_yt_dlp_bin_from_file(path: &str) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let config: serde_json::Value = serde_json::from_str(&content).ok()?;
    config
        .get("yt_dlp_bin")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

// Response types
#[derive(Serialize, Clone)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

// Download commands
#[derive(Debug, Serialize, Deserialize)]
pub struct StartDownloadRequest {
    pub url: String,
    pub is_playlist: bool,
    pub quality: Option<String>,
    pub format: Option<String>,
    pub output_dir: Option<String>,
    pub sub_langs: Option<Vec<String>>,
    pub write_subs: Option<bool>,
    pub write_auto_subs: Option<bool>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    // ── 参数包扩展（借鉴清单 #3/#5/#6/#9）──
    pub format_id: Option<String>,
    pub cookie: Option<crate::cookie::CookieConfig>,
    pub proxy: Option<String>,
    pub rate_limit: Option<String>,
    pub concurrent_fragments: Option<u32>,
    pub embed_thumbnail: Option<bool>,
    pub embed_metadata: Option<bool>,
    pub embed_chapters: Option<bool>,
    pub sponsorblock_remove: Option<bool>,
    pub filename_template: Option<String>,
    pub po_token: Option<String>,
    pub extractor_args: Option<String>,
    pub config_location: Option<String>,
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    db: State<'_, Database>,
    queue: State<'_, QueueManager>,
    request: StartDownloadRequest,
) -> Result<ApiResponse<String>, String> {
    let download_id = uuid::Uuid::new_v4().to_string();
    
    // Serialize download options for resume support
    let options_json = serde_json::to_string(&request).unwrap_or_default();

    // Create download record
    let record = DownloadRecord {
        id: download_id.clone(),
        url: request.url.clone(),
        title: None,
        status: DownloadStatus::Pending,
        progress: 0.0,
        speed: None,
        eta: None,
        output_dir: request.output_dir.clone(),
        filename: None,
        subtitles: vec![],
        error: None,
        queue_position: 0,
        options: Some(options_json),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    if let Err(e) = db.create_download(record).await {
        return Ok(ApiResponse::err(format!("Failed to create download: {}", e)));
    }

    // Get yt-dlp path from settings (with config file fallback)
    let mut yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    if yt_dlp_path.is_none() {
        yt_dlp_path = load_vytdl_config_yt_dlp_path();
    }

    // Enqueue download via queue manager
    let options = DownloadOptions {
        url: request.url,
        is_playlist: request.is_playlist,
        quality: request.quality,
        format: request.format,
        output_dir: request.output_dir,
        sub_langs: request.sub_langs,
        write_subs: request.write_subs.unwrap_or(true),
        write_auto_subs: request.write_auto_subs.unwrap_or(true),
        start_time: request.start_time,
        end_time: request.end_time,
        format_id: request.format_id,
        cookie: request.cookie,
        proxy: request.proxy,
        rate_limit: request.rate_limit,
        concurrent_fragments: request.concurrent_fragments,
        embed_thumbnail: request.embed_thumbnail.unwrap_or(false),
        embed_metadata: request.embed_metadata.unwrap_or(false),
        embed_chapters: request.embed_chapters.unwrap_or(false),
        sponsorblock_remove: request.sponsorblock_remove.unwrap_or(false),
        filename_template: request.filename_template,
        po_token: request.po_token,
        extractor_args: request.extractor_args,
        config_location: request.config_location,
        ..Default::default()
    };

    queue.enqueue(download_id.clone(), options, yt_dlp_path, app).await;

    Ok(ApiResponse::ok(download_id))
}

#[tauri::command]
pub async fn cancel_download(
    db: State<'_, Database>,
    queue: State<'_, QueueManager>,
    download_id: String,
) -> Result<ApiResponse<()>, String> {
    queue.cancel(download_id.clone()).await;
    if let Err(e) = db.update_download_status(&download_id, DownloadStatus::Cancelled).await {
        return Ok(ApiResponse::err(format!("Failed to cancel download: {}", e)));
    }
    Ok(ApiResponse::ok(()))
}

#[tauri::command]
pub async fn get_downloads(
    db: State<'_, Database>,
) -> Result<ApiResponse<Vec<DownloadRecord>>, String> {
    match db.get_all_downloads().await {
        Ok(downloads) => Ok(ApiResponse::ok(downloads)),
        Err(e) => Ok(ApiResponse::err(format!("Failed to get downloads: {}", e))),
    }
}

#[tauri::command]
pub async fn get_download_by_id(
    db: State<'_, Database>,
    id: String,
) -> Result<ApiResponse<Option<DownloadRecord>>, String> {
    match db.get_download_by_id(&id).await {
        Ok(download) => Ok(ApiResponse::ok(download)),
        Err(e) => Ok(ApiResponse::err(format!("Failed to get download: {}", e))),
    }
}

#[tauri::command]
pub async fn delete_download(
    db: State<'_, Database>,
    id: String,
) -> Result<ApiResponse<()>, String> {
    if let Err(e) = db.delete_download(&id).await {
        return Ok(ApiResponse::err(format!("Failed to delete download: {}", e)));
    }
    Ok(ApiResponse::ok(()))
}

#[tauri::command]
pub async fn open_download_folder(path: String) -> Result<ApiResponse<()>, String> {
    match opener::open(path) {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to open folder: {}", e))),
    }
}

#[tauri::command]
pub async fn retry_download(
    app: AppHandle,
    db: State<'_, Database>,
    queue: State<'_, QueueManager>,
    id: String,
) -> Result<ApiResponse<String>, String> {
    // Fetch the original download
    let original = match db.get_download_by_id(&id).await {
        Ok(Some(record)) => record,
        Ok(None) => return Ok(ApiResponse::err("Download not found".to_string())),
        Err(e) => return Ok(ApiResponse::err(format!("Failed to get download: {}", e))),
    };

    // Create a new download record with the same URL
    let download_id = uuid::Uuid::new_v4().to_string();
    let record = DownloadRecord {
        id: download_id.clone(),
        url: original.url.clone(),
        title: None,
        status: DownloadStatus::Pending,
        progress: 0.0,
        speed: None,
        eta: None,
        output_dir: original.output_dir.clone(),
        filename: None,
        subtitles: vec![],
        error: None,
        queue_position: 0,
        options: original.options.clone(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    if let Err(e) = db.create_download(record).await {
        return Ok(ApiResponse::err(format!("Failed to create download: {}", e)));
    }

    // Get yt-dlp path
    let mut yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    if yt_dlp_path.is_none() {
        yt_dlp_path = load_vytdl_config_yt_dlp_path();
    }

    // Enqueue with default options (same output_dir if available)
    let options = DownloadOptions {
        url: original.url,
        is_playlist: false,
        quality: None,
        format: None,
        output_dir: original.output_dir,
        sub_langs: Some(vec!["en".to_string(), "zh".to_string()]),
        write_subs: true,
        write_auto_subs: true,
        start_time: None,
        end_time: None,
                ..Default::default()

    };

    queue.enqueue(download_id.clone(), options, yt_dlp_path, app).await;

    Ok(ApiResponse::ok(download_id))
}

// Settings commands
#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub yt_dlp_path: Option<String>,
    pub default_output_dir: Option<String>,
    pub default_quality: String,
    pub default_format: String,
    pub default_sub_langs: Vec<String>,
    pub language: String,
    pub max_concurrent_downloads: Option<i64>,
    pub ai_provider: Option<String>,
    pub ai_api_key: Option<String>,
    pub ai_model: Option<String>,
    pub agent_cli_kimi_bin: Option<String>,
    pub agent_cli_other_bin: Option<String>,
    // ── 网络与高级（借鉴清单 #3/#6/#9）──
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub cookie: Option<crate::cookie::CookieConfig>,
    #[serde(default)]
    pub rate_limit: Option<String>,
    #[serde(default)]
    pub concurrent_fragments: Option<u32>,
    #[serde(default)]
    pub embed_thumbnail: bool,
    #[serde(default)]
    pub embed_metadata: bool,
    #[serde(default)]
    pub embed_chapters: bool,
    #[serde(default)]
    pub sponsorblock_remove: bool,
    #[serde(default)]
    pub filename_template: Option<String>,
    #[serde(default)]
    pub po_token: Option<String>,
    #[serde(default)]
    pub extractor_args: Option<String>,
    #[serde(default)]
    pub config_location: Option<String>,
}

#[tauri::command]
pub async fn get_settings(
    db: State<'_, Database>,
) -> Result<ApiResponse<Settings>, String> {
    // Load from database if available, otherwise use defaults
    let language = db.get_setting("language").await.unwrap_or(None).unwrap_or_else(|| "zh".to_string());
    let mut yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    // Fallback to vYtDL-standalone/config.json (or legacy paths)
    if yt_dlp_path.is_none() {
        yt_dlp_path = load_vytdl_config_yt_dlp_path();
    }
    let default_output_dir = db.get_setting("default_output_dir").await.unwrap_or(None);
    let default_quality = db.get_setting("default_quality").await.unwrap_or(None).unwrap_or_else(|| "best".to_string());
    let default_format = db.get_setting("default_format").await.unwrap_or(None).unwrap_or_else(|| "mp4".to_string());
    let default_sub_langs_str = db.get_setting("default_sub_langs").await.unwrap_or(None).unwrap_or_else(|| "[\"en\",\"zh\"]".to_string());
    let default_sub_langs: Vec<String> = serde_json::from_str(&default_sub_langs_str).unwrap_or_else(|_| vec!["en".to_string(), "zh".to_string()]);
    let max_concurrent_downloads = db.get_setting("max_concurrent_downloads")
        .await
        .unwrap_or(None)
        .and_then(|s| s.parse::<i64>().ok())
        .or(Some(3));
    let ai_provider = db.get_setting("ai_provider").await.unwrap_or(None);
    let ai_api_key = db.get_setting("ai_api_key").await.unwrap_or(None);
    let ai_model = db.get_setting("ai_model").await.unwrap_or(None);
    let agent_cli_kimi_bin = db.get_setting("agent_cli_kimi_bin").await.unwrap_or(None);
    let agent_cli_other_bin = db.get_setting("agent_cli_other_bin").await.unwrap_or(None);
    let proxy = db.get_setting("proxy").await.unwrap_or(None);
    let cookie = db
        .get_setting("cookie")
        .await
        .unwrap_or(None)
        .and_then(|s| serde_json::from_str(&s).ok());
    let rate_limit = db.get_setting("rate_limit").await.unwrap_or(None);
    let concurrent_fragments = db
        .get_setting("concurrent_fragments")
        .await
        .unwrap_or(None)
        .and_then(|s| s.parse::<u32>().ok());
    let get_bool = |k: &str| -> Option<bool> { None }; // 占位，下方统一
    let embed_thumbnail = db.get_setting("embed_thumbnail").await.unwrap_or(None).map(|s| s == "1").unwrap_or(false);
    let embed_metadata = db.get_setting("embed_metadata").await.unwrap_or(None).map(|s| s == "1").unwrap_or(false);
    let embed_chapters = db.get_setting("embed_chapters").await.unwrap_or(None).map(|s| s == "1").unwrap_or(false);
    let sponsorblock_remove = db.get_setting("sponsorblock_remove").await.unwrap_or(None).map(|s| s == "1").unwrap_or(false);
    let filename_template = db.get_setting("filename_template").await.unwrap_or(None);
    let po_token = db.get_setting("po_token").await.unwrap_or(None);
    let extractor_args = db.get_setting("extractor_args").await.unwrap_or(None);
    let config_location = db.get_setting("config_location").await.unwrap_or(None);
    let _ = get_bool;

    let settings = Settings {
        yt_dlp_path,
        default_output_dir,
        default_quality,
        default_format,
        default_sub_langs,
        language,
        max_concurrent_downloads,
        ai_provider,
        ai_api_key,
        ai_model,
        agent_cli_kimi_bin,
        agent_cli_other_bin,
        proxy,
        cookie,
        rate_limit,
        concurrent_fragments,
        embed_thumbnail,
        embed_metadata,
        embed_chapters,
        sponsorblock_remove,
        filename_template,
        po_token,
        extractor_args,
        config_location,
    };
    Ok(ApiResponse::ok(settings))
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    db: State<'_, Database>,
    settings: Settings,
) -> Result<ApiResponse<()>, String> {
    if let Err(e) = db.set_setting("language", &settings.language).await {
        return Ok(ApiResponse::err(format!("Failed to save language: {}", e)));
    }
    if let Some(ref path) = settings.yt_dlp_path {
        if let Err(e) = db.set_setting("yt_dlp_path", path).await {
            return Ok(ApiResponse::err(format!("Failed to save yt-dlp path: {}", e)));
        }
    }
    if let Some(ref dir) = settings.default_output_dir {
        if let Err(e) = db.set_setting("default_output_dir", dir).await {
            return Ok(ApiResponse::err(format!("Failed to save output dir: {}", e)));
        }
    }
    if let Err(e) = db.set_setting("default_quality", &settings.default_quality).await {
        return Ok(ApiResponse::err(format!("Failed to save quality: {}", e)));
    }
    if let Err(e) = db.set_setting("default_format", &settings.default_format).await {
        return Ok(ApiResponse::err(format!("Failed to save format: {}", e)));
    }
    let sub_langs_json = serde_json::to_string(&settings.default_sub_langs).unwrap_or_else(|_| "[\"en\",\"zh\"]".to_string());
    if let Err(e) = db.set_setting("default_sub_langs", &sub_langs_json).await {
        return Ok(ApiResponse::err(format!("Failed to save sub langs: {}", e)));
    }
    if let Some(ref provider) = settings.ai_provider {
        if let Err(e) = db.set_setting("ai_provider", provider).await {
            return Ok(ApiResponse::err(format!("Failed to save AI provider: {}", e)));
        }
    }
    if let Some(ref key) = settings.ai_api_key {
        if let Err(e) = db.set_setting("ai_api_key", key).await {
            return Ok(ApiResponse::err(format!("Failed to save API key: {}", e)));
        }
    }
    if let Some(ref model) = settings.ai_model {
        if let Err(e) = db.set_setting("ai_model", model).await {
            return Ok(ApiResponse::err(format!("Failed to save model: {}", e)));
        }
    }
    if let Some(ref path) = settings.agent_cli_kimi_bin {
        if let Err(e) = db.set_setting("agent_cli_kimi_bin", path).await {
            return Ok(ApiResponse::err(format!("Failed to save Kimi CLI path: {}", e)));
        }
    }
    if let Some(ref path) = settings.agent_cli_other_bin {
        if let Err(e) = db.set_setting("agent_cli_other_bin", path).await {
            return Ok(ApiResponse::err(format!("Failed to save other agent CLI path: {}", e)));
        }
    }
    if let Some(n) = settings.max_concurrent_downloads {
        if let Err(e) = db.set_setting("max_concurrent_downloads", &n.to_string()).await {
            return Ok(ApiResponse::err(format!("Failed to save max concurrent: {}", e)));
        }
        // Notify queue manager to update concurrency
        let queue = app.state::<crate::queue::QueueManager>();
        queue.set_max_concurrent(n as usize).await;
    }
    // ── 网络与高级设置 ──
    let _ = db.set_setting("proxy", settings.proxy.as_deref().unwrap_or("")).await;
    let cookie_json = settings.cookie.as_ref().map(|c| serde_json::to_string(c).unwrap_or_default());
    let _ = db.set_setting("cookie", cookie_json.as_deref().unwrap_or("")).await;
    let _ = db.set_setting("rate_limit", settings.rate_limit.as_deref().unwrap_or("")).await;
    let _ = db.set_setting(
        "concurrent_fragments",
        &settings.concurrent_fragments.map(|v| v.to_string()).unwrap_or_default(),
    ).await;
    let _ = db.set_setting("embed_thumbnail", if settings.embed_thumbnail { "1" } else { "0" }).await;
    let _ = db.set_setting("embed_metadata", if settings.embed_metadata { "1" } else { "0" }).await;
    let _ = db.set_setting("embed_chapters", if settings.embed_chapters { "1" } else { "0" }).await;
    let _ = db.set_setting("sponsorblock_remove", if settings.sponsorblock_remove { "1" } else { "0" }).await;
    let _ = db.set_setting("filename_template", settings.filename_template.as_deref().unwrap_or("")).await;
    let _ = db.set_setting("po_token", settings.po_token.as_deref().unwrap_or("")).await;
    let _ = db.set_setting("extractor_args", settings.extractor_args.as_deref().unwrap_or("")).await;
    let _ = db.set_setting("config_location", settings.config_location.as_deref().unwrap_or("")).await;

    Ok(ApiResponse::ok(()))
}

#[tauri::command]
pub async fn detect_agent_cli(
    kimi_bin: Option<String>,
    other_bin: Option<String>,
) -> Result<ApiResponse<crate::agent_cli::DetectAgentCliResult>, String> {
    let result = crate::agent_cli::detect_agent_cli_tools(kimi_bin, other_bin);
    Ok(ApiResponse::ok(result))
}

// Video info command
#[derive(Debug, Serialize)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub duration: Option<i64>,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
    pub formats: Vec<VideoFormat>,
}

#[derive(Debug, Serialize)]
pub struct VideoFormat {
    pub format_id: String,
    pub quality: String,
    pub resolution: Option<String>,
    pub filesize: Option<i64>,
}

#[tauri::command]
pub async fn get_video_info(
    db: State<'_, Database>,
    url: String,
) -> Result<ApiResponse<VideoInfo>, String> {
    log::info!("get_video_info called for URL: {}", url);
    let yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    if let Some(ref path) = yt_dlp_path {
        log::info!("Using yt-dlp path from settings: {}", path);
    } else {
        log::info!("No yt-dlp path in settings, will auto-detect");
    }
    let downloader = Downloader::new_default().with_yt_dlp_path(yt_dlp_path);
    match downloader.get_info(&url).await {
        Ok(info) => {
            log::info!("get_video_info success: {} ({})", info.title, info.id);
            Ok(ApiResponse::ok(info))
        }
        Err(e) => {
            log::error!("get_video_info failed: {}", e);
            Ok(ApiResponse::err(format!("Failed to get video info: {}", e)))
        }
    }
}

// Video Format Info
#[derive(Debug, Serialize)]
pub struct FormatInfo {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub fps: Option<i32>,
    pub filesize: Option<i64>,
    pub filesize_approx: Option<i64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub vbr: Option<f64>,
    pub abr: Option<f64>,
    pub asr: Option<i64>,
    pub quality: String,
}

#[tauri::command]
pub async fn get_video_formats(
    db: State<'_, Database>,
    url: String,
) -> Result<ApiResponse<Vec<FormatInfo>>, String> {
    let yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    let downloader = Downloader::new_default().with_yt_dlp_path(yt_dlp_path);
    match downloader.get_formats(&url).await {
        Ok(formats) => Ok(ApiResponse::ok(formats)),
        Err(e) => Ok(ApiResponse::err(format!("Failed to get video formats: {}", e))),
    }
}

// Playlist/Channel Info
#[derive(Debug, Serialize)]
pub struct PlaylistVideo {
    pub id: String,
    pub title: String,
    pub duration: Option<i64>,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
    pub webpage_url: String,
}

#[derive(Debug, Serialize)]
pub struct PlaylistInfo {
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    pub description: Option<String>,
    pub thumbnail: Option<String>,
    pub entries: Vec<PlaylistVideo>,
    pub webpage_url: String,
}

#[tauri::command]
pub async fn get_playlist_info(
    db: State<'_, Database>,
    url: String,
) -> Result<ApiResponse<PlaylistInfo>, String> {
    let yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    let downloader = Downloader::new_default().with_yt_dlp_path(yt_dlp_path);
    match downloader.get_playlist_info(&url).await {
        Ok(info) => Ok(ApiResponse::ok(info)),
        Err(e) => Ok(ApiResponse::err(format!("Failed to get playlist info: {}", e))),
    }
}

// Audio extraction command
#[derive(Debug, Serialize)]
pub struct ExtractAudioResult {
    pub audio_path: String,
}

#[tauri::command]
pub async fn extract_audio(
    request: audio_extractor::ExtractAudioOptions,
) -> Result<ApiResponse<ExtractAudioResult>, String> {
    match audio_extractor::extract_audio(request).await {
        Ok(result) => Ok(ApiResponse::ok(ExtractAudioResult {
            audio_path: result.audio_path,
        })),
        Err(e) => Ok(ApiResponse::err(e)),
    }
}

// AI Summary command
#[derive(Debug, Deserialize)]
pub struct SummarizeRequest {
    pub video_id: String,
    pub prompt: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SummaryResult {
    pub markdown: String,
    pub key_points: Vec<String>,
}

#[tauri::command]
pub async fn summarize_video(
    db: State<'_, Database>,
    request: SummarizeRequest,
) -> Result<ApiResponse<SummaryResult>, String> {
    // TODO: Implement AI summarization
    let summary = SummaryResult {
        markdown: "# Summary\n\nComing soon...".to_string(),
        key_points: vec![],
    };
    Ok(ApiResponse::ok(summary))
}

// VTT Analysis commands

#[derive(Debug, Serialize)]
pub struct AnalyzeVttResult {
    #[serde(rename = "reportId")]
    pub report_id: String,
}

#[derive(Debug, Serialize)]
pub struct ListVttReportsResult {
    pub reports: Vec<VttReport>,
    pub total: i64,
}

#[tauri::command]
pub async fn analyze_vtt(
    app: AppHandle,
    db: State<'_, Database>,
    url: String,
) -> Result<ApiResponse<AnalyzeVttResult>, String> {
    if url.trim().is_empty() {
        return Ok(ApiResponse::err("url is required".to_string()));
    }

    let report_id = crate::vtt_analysis::start_analysis(app, db.inner().clone(), url)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ApiResponse::ok(AnalyzeVttResult { report_id }))
}

#[tauri::command]
pub async fn get_vtt_report(
    db: State<'_, Database>,
    id: String,
) -> Result<ApiResponse<VttReport>, String> {
    match db.get_vtt_report(&id).await {
        Ok(Some(report)) => Ok(ApiResponse::ok(report)),
        Ok(None) => Ok(ApiResponse::err("Report not found".to_string())),
        Err(e) => Ok(ApiResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn list_vtt_reports(
    db: State<'_, Database>,
    page: Option<u32>,
    limit: Option<u32>,
    lang: Option<String>,
) -> Result<ApiResponse<ListVttReportsResult>, String> {
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(20).clamp(1, 100);

    match db.list_vtt_reports(page, limit, lang.as_deref()).await {
        Ok((reports, total)) => Ok(ApiResponse::ok(ListVttReportsResult { reports, total })),
        Err(e) => Ok(ApiResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn delete_vtt_report(
    db: State<'_, Database>,
    id: String,
) -> Result<ApiResponse<()>, String> {
    match db.delete_vtt_report(&id).await {
        Ok(()) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(e.to_string())),
    }
}

// Agent chat commands

#[tauri::command]
pub async fn agent_chat_send(
    app: AppHandle,
    db: State<'_, Database>,
    session_id: String,
    message: String,
    agent_id: String,
    context: Vec<crate::agent_runner::AssetContext>,
) -> Result<ApiResponse<()>, String> {
    if message.trim().is_empty() {
        return Ok(ApiResponse::err("message is required".to_string()));
    }

    if agent_id != "kimi" {
        return Ok(ApiResponse::err(format!("Unsupported agent: {agent_id}")));
    }

    let kimi_bin = db
        .get_setting("agent_cli_kimi_bin")
        .await
        .ok()
        .flatten()
        .filter(|p| !p.trim().is_empty());

    let kimi_bin = if let Some(path) = kimi_bin {
        path
    } else {
        let detection = crate::agent_cli::detect_agent_cli_tools(None, None);
        detection
            .kimi
            .path
            .ok_or_else(|| "Kimi CLI not found. Configure it in Settings → Agent CLI.".to_string())?
    };

    let prompt = crate::agent_runner::build_prompt(&message, &context);
    let project_root = crate::agent_runner::find_project_root();

    crate::agent_runner::spawn_kimi_chat(
        app,
        session_id,
        kimi_bin,
        prompt,
        project_root,
    );

    Ok(ApiResponse::ok(()))
}
