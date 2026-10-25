use tauri::State;

use crate::commands::ApiResponse;
use crate::db::Database;
use crate::downloader::{Downloader, FormatInfo, PlaylistInfo, VideoInfo};

// ─────────────────────────── Video Commands ───────────────────────────

#[tauri::command]
pub async fn get_video_info(
    db: State<'_, Database>,
    url: String,
) -> Result<ApiResponse<VideoInfo>, String> {
    log::info!("get_video_info called for URL: {}", url);
    let yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
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
