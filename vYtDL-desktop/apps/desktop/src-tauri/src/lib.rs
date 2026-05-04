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
                let db = database::Database::new_in_memory().await
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
