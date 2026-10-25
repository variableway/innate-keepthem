use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::commands::ApiResponse;
use crate::db::{Database, DownloadRecord, DownloadStatus};
use crate::downloader::DownloadOptions;
use crate::queue::QueueManager;

// ─────────────────────────── Download Commands ───────────────────────────

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
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    db: State<'_, Database>,
    queue: State<'_, QueueManager>,
    request: StartDownloadRequest,
) -> Result<ApiResponse<String>, String> {
    let download_id = uuid::Uuid::new_v4().to_string();

    let options_json = serde_json::to_string(&request).unwrap_or_default();

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

    let mut yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    if yt_dlp_path.is_none() {
        // Try loading from vYtDL config
        if let Ok(mut cwd) = std::env::current_dir() {
            for _ in 0..6 {
                let candidate = cwd.join("vYtDL").join("config.json");
                if candidate.exists() {
                    if let Some(bin) = std::fs::read_to_string(&candidate)
                        .ok()
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        .and_then(|v| v.get("yt_dlp_bin").and_then(|v| v.as_str()).map(|s| s.to_string()))
                    {
                        yt_dlp_path = Some(bin);
                    }
                    break;
                }
                if !cwd.pop() {
                    break;
                }
            }
        }
    }

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
    let original = match db.get_download_by_id(&id).await {
        Ok(Some(record)) => record,
        Ok(None) => return Ok(ApiResponse::err("Download not found".to_string())),
        Err(e) => return Ok(ApiResponse::err(format!("Failed to get download: {}", e))),
    };

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

    let mut yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    if yt_dlp_path.is_none() {
        if let Ok(mut cwd) = std::env::current_dir() {
            for _ in 0..6 {
                let candidate = cwd.join("vYtDL").join("config.json");
                if candidate.exists() {
                    if let Some(bin) = std::fs::read_to_string(&candidate)
                        .ok()
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        .and_then(|v| v.get("yt_dlp_bin").and_then(|v| v.as_str()).map(|s| s.to_string()))
                    {
                        yt_dlp_path = Some(bin);
                    }
                    break;
                }
                if !cwd.pop() {
                    break;
                }
            }
        }
    }

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
    };

    queue.enqueue(download_id.clone(), options, yt_dlp_path, app).await;

    Ok(ApiResponse::ok(download_id))
}
