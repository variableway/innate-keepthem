use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::database::{Database, DownloadRecord, DownloadStatus};
use crate::downloader::{DownloadOptions, DownloadProgress, Downloader};

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
#[derive(Debug, Deserialize)]
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
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    db: State<'_, Database>,
    request: StartDownloadRequest,
) -> Result<ApiResponse<String>, String> {
    let download_id = uuid::Uuid::new_v4().to_string();
    
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
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    if let Err(e) = db.create_download(record).await {
        return Ok(ApiResponse::err(format!("Failed to create download: {}", e)));
    }

    // Start download in background
    let app_clone = app.clone();
    let download_id_clone = download_id.clone();
    let db_clone = db.inner().clone();

    tauri::async_runtime::spawn(async move {
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
        };

        let downloader = Downloader::new(options, download_id_clone.clone());
        
        // Update status to downloading
        let _ = db_clone.update_download_status(&download_id_clone, DownloadStatus::Downloading).await;

        // Start download with progress callback
        let app_for_progress = app_clone.clone();
        let id_for_progress = download_id_clone.clone();
        let result = downloader
            .download(move |progress: DownloadProgress| {
                // Emit progress event to frontend
                let _ = app_for_progress.emit(
                    &format!("download:progress:{}", id_for_progress),
                    progress,
                );
            })
            .await;

        // Update final status
        match result {
            Ok(output) => {
                let title = output.title.clone();
                let filename = output.filename.clone();
                let subtitles = output.subtitles.clone();
                
                let _ = db_clone.update_download_complete(
                    &download_id_clone,
                    title,
                    filename,
                    subtitles,
                ).await;
                
                // Emit completion event
                let _ = app_clone.emit(
                    &format!("download:complete:{}", download_id_clone),
                    output,
                );
            }
            Err(e) => {
                let _ = db_clone.update_download_error(&download_id_clone, &e).await;
                
                let _ = app_clone.emit(
                    &format!("download:error:{}", download_id_clone),
                    e,
                );
            }
        }
    });

    Ok(ApiResponse::ok(download_id))
}

#[tauri::command]
pub async fn cancel_download(
    db: State<'_, Database>,
    download_id: String,
) -> Result<ApiResponse<()>, String> {
    // TODO: Implement actual cancellation
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

// Settings commands
#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub yt_dlp_path: Option<String>,
    pub default_output_dir: Option<String>,
    pub default_quality: String,
    pub default_format: String,
    pub default_sub_langs: Vec<String>,
    pub ai_provider: Option<String>,
    pub ai_api_key: Option<String>,
    pub ai_model: Option<String>,
}

#[tauri::command]
pub async fn get_settings() -> Result<ApiResponse<Settings>, String> {
    // TODO: Load from persistent storage
    let settings = Settings {
        yt_dlp_path: None,
        default_output_dir: None,
        default_quality: "best".to_string(),
        default_format: "mp4".to_string(),
        default_sub_langs: vec!["en".to_string(), "zh".to_string()],
        ai_provider: None,
        ai_api_key: None,
        ai_model: None,
    };
    Ok(ApiResponse::ok(settings))
}

#[tauri::command]
pub async fn update_settings(
    settings: Settings,
) -> Result<ApiResponse<()>, String> {
    // TODO: Save to persistent storage
    Ok(ApiResponse::ok(()))
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
pub async fn get_video_info(url: String) -> Result<ApiResponse<VideoInfo>, String> {
    let downloader = Downloader::new_default();
    match downloader.get_info(&url).await {
        Ok(info) => Ok(ApiResponse::ok(info)),
        Err(e) => Ok(ApiResponse::err(format!("Failed to get video info: {}", e))),
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
pub async fn get_video_formats(url: String) -> Result<ApiResponse<Vec<FormatInfo>>, String> {
    let downloader = Downloader::new_default();
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
pub async fn get_playlist_info(url: String) -> Result<ApiResponse<PlaylistInfo>, String> {
    let downloader = Downloader::new_default();
    match downloader.get_playlist_info(&url).await {
        Ok(info) => Ok(ApiResponse::ok(info)),
        Err(e) => Ok(ApiResponse::err(format!("Failed to get playlist info: {}", e))),
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
