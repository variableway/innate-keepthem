mod commands;
mod database;
mod downloader;


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

            // Initialize database synchronously so it's available before commands run
            let app_handle = app.handle().clone();
            if let Err(e) = tauri::async_runtime::block_on(async move {
                database::init_db(&app_handle).await
            }) {
                eprintln!("Failed to initialize database: {}", e);
            }

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
