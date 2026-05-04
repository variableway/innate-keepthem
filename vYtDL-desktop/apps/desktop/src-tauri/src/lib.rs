mod commands;
mod database;
mod downloader;

use tauri::Manager;

#[tauri::command]
fn get_platform() -> String {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    format!("{}-{}", os, arch)
}

/// Determine the platform-specific yt-dlp resource directory and executable names
fn bundled_yt_dlp_info() -> (&'static str, &'static str, &'static str) {
    let is_windows = std::env::consts::OS == "windows";
    if is_windows {
        let arch = std::env::consts::ARCH;
        if arch == "aarch64" {
            ("windows-arm64", "yt-dlp_arm64.exe", "yt-dlp.exe")
        } else {
            ("windows-x86", "yt-dlp_x86.exe", "yt-dlp.exe")
        }
    } else if std::env::consts::OS == "macos" {
        ("macos", "yt-dlp_macos", "yt-dlp")
    } else {
        ("linux", "yt-dlp_linux", "yt-dlp")
    }
}

/// Recursively copy a directory (async)
async fn copy_dir_all(
    src: impl AsRef<std::path::Path>,
    dst: impl AsRef<std::path::Path>,
) -> std::io::Result<()> {
    tokio::fs::create_dir_all(&dst).await?;
    let mut entries = tokio::fs::read_dir(src).await?;
    while let Some(entry) = entries.next_entry().await? {
        let ty = entry.file_type().await?;
        if ty.is_dir() {
            Box::pin(copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))).await?;
        } else {
            tokio::fs::copy(entry.path(), dst.as_ref().join(entry.file_name())).await?;
        }
    }
    Ok(())
}

/// Extract bundled yt-dlp from app resources to app_data_dir on first run.
/// Sets VYTLD_BUNDLED_YT_DLP env var so downloader can find it.
async fn extract_bundled_yt_dlp(app: &tauri::App) -> Option<std::path::PathBuf> {
    let (resource_subdir, _source_exe, target_exe_name) = bundled_yt_dlp_info();

    let app_data_dir = app.path().app_data_dir().ok()?;
    let target_dir = app_data_dir.join("yt-dlp");
    let target_exe = target_dir.join(target_exe_name);
    let marker = target_dir.join(".extracted");

    // Already extracted?
    if tokio::fs::metadata(&marker).await.is_ok() {
        return Some(target_exe);
    }

    // Resolve resource path using Tauri's resource directory
    let resource_path = match app
        .path()
        .resolve(format!("yt-dlp/{}", resource_subdir), tauri::path::BaseDirectory::Resource)
    {
        Ok(p) => p,
        Err(e) => {
            log::warn!("Cannot resolve yt-dlp resource path: {}", e);
            return None;
        }
    };

    // Check if bundled resources exist (may not exist in dev mode before build)
    if tokio::fs::metadata(&resource_path).await.is_err() {
        log::info!(
            "Bundled yt-dlp not found in resources at {:?}, skipping extraction",
            resource_path
        );
        return None;
    }

    log::info!(
        "Extracting bundled yt-dlp from {:?} to {:?}",
        resource_path,
        target_dir
    );

    // Remove old extraction if exists (handles partial/corrupted extractions)
    let _ = tokio::fs::remove_dir_all(&target_dir).await;

    if let Err(e) = copy_dir_all(&resource_path, &target_dir).await {
        log::error!("Failed to extract bundled yt-dlp: {}", e);
        return None;
    }

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = tokio::fs::set_permissions(
            &target_exe,
            std::fs::Permissions::from_mode(0o755),
        )
        .await;
    }

    // Write marker file to indicate successful extraction
    if let Err(e) = tokio::fs::write(&marker, "").await {
        log::warn!("Failed to write extraction marker: {}", e);
    }

    log::info!("Bundled yt-dlp extracted successfully to {:?}", target_exe);
    Some(target_exe)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Extract bundled yt-dlp from resources on startup
            tauri::async_runtime::block_on(async {
                if let Some(path) = extract_bundled_yt_dlp(app).await {
                    std::env::set_var("VYTLD_BUNDLED_YT_DLP", path.to_string_lossy().to_string());
                }
            });

            // Initialize database — always call manage() so commands never fail with "state not managed"
            let db: Result<database::Database, ()> = tauri::async_runtime::block_on(async {
                // Try app data directory first
                match database::Database::new(&app.handle()).await {
                    Ok(db) => {
                        if let Err(e) = db.init().await {
                            log::error!("DB init failed (app dir): {}", e);
                        } else {
                            log::info!("Database initialized (app dir)");
                            return Ok(db);
                        }
                    }
                    Err(e) => log::error!("DB create failed (app dir): {}", e),
                }

                // Fallback: current working directory
                let cwd = std::env::current_dir().unwrap_or_default();
                let fallback_path = cwd.join("vytdl-dev.db");
                log::info!("Trying fallback database at: {:?}", fallback_path);
                match database::Database::new_with_path(&fallback_path).await {
                    Ok(db) => {
                        if let Err(e) = db.init().await {
                            log::error!("DB init failed (fallback): {}", e);
                        } else {
                            log::info!("Database initialized (fallback)");
                            return Ok(db);
                        }
                    }
                    Err(e) => log::error!("DB create failed (fallback): {}", e),
                }

                // Last resort: in-memory database
                log::warn!("Using in-memory database — data will not persist");
                let db = database::Database::new_in_memory()
                    .await
                    .expect("In-memory SQLite should always succeed");
                db.init().await.expect("In-memory DB init should succeed");
                Ok(db)
            });
            let db = db.expect("Database initialization must not fail — all fallbacks exhausted");

            app.manage(db);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_download,
            commands::cancel_download,
            commands::get_downloads,
            commands::get_download_by_id,
            commands::delete_download,
            commands::open_download_folder,
            commands::get_settings,
            commands::update_settings,
            commands::get_video_info,
            commands::get_video_formats,
            commands::get_playlist_info,
            commands::summarize_video,
            get_platform,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
