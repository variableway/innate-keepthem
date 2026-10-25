use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, Manager};

use crate::commands::ApiResponse;
use crate::db::Database;
use crate::queue::QueueManager;

// ─────────────────────────── Settings Types ───────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    // ContentForge original fields
    pub language: String,
    pub theme: String,
    pub max_concurrent: i64,
    pub default_output_dir: Option<String>,
    pub ai_provider: Option<String>,
    pub ai_api_key: Option<String>,
    pub ai_model: Option<String>,
    // vYtDL additional fields
    pub yt_dlp_path: Option<String>,
    pub default_quality: String,
    pub default_format: String,
    pub default_sub_langs: Vec<String>,
    pub agent_cli_kimi_bin: Option<String>,
    pub agent_cli_other_bin: Option<String>,
}

// ─────────────────────────── Settings Commands ───────────────────────────

/// Load yt-dlp binary path from the shared vYtDL config file.
fn load_vytdl_config_yt_dlp_path() -> Option<String> {
    if let Ok(path) = std::env::var("VYTDL_CONFIG") {
        if let Some(bin) = parse_yt_dlp_bin_from_file(&path) {
            return Some(bin);
        }
    }

    if let Ok(mut cwd) = std::env::current_dir() {
        for _ in 0..6 {
            let candidate = cwd.join("vYtDL").join("config.json");
            if candidate.exists() {
                if let Some(bin) = parse_yt_dlp_bin_from_file(candidate.to_str().unwrap_or("")) {
                    return Some(bin);
                }
                break;
            }
            if !cwd.pop() {
                break;
            }
        }
    }

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

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<ApiResponse<Settings>, String> {
    let language = db.get_setting("language").await.unwrap_or(None).unwrap_or_else(|| "zh".to_string());
    let theme = db.get_setting("theme").await.unwrap_or(None).unwrap_or_else(|| "dark".to_string());
    let max_concurrent = db
        .get_setting("max_concurrent")
        .await
        .unwrap_or(None)
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(3);
    let default_output_dir = db.get_setting("default_output_dir").await.unwrap_or(None);
    let ai_provider = db.get_setting("ai_provider").await.unwrap_or(None);
    let ai_api_key = db.get_setting("ai_api_key").await.unwrap_or(None);
    let ai_model = db.get_setting("ai_model").await.unwrap_or(None);

    let mut yt_dlp_path = db.get_setting("yt_dlp_path").await.unwrap_or(None);
    if yt_dlp_path.is_none() {
        yt_dlp_path = load_vytdl_config_yt_dlp_path();
    }
    let default_quality = db.get_setting("default_quality").await.unwrap_or(None).unwrap_or_else(|| "best".to_string());
    let default_format = db.get_setting("default_format").await.unwrap_or(None).unwrap_or_else(|| "mp4".to_string());
    let default_sub_langs_str = db.get_setting("default_sub_langs").await.unwrap_or(None).unwrap_or_else(|| "[\"en\",\"zh\"]".to_string());
    let default_sub_langs: Vec<String> = serde_json::from_str(&default_sub_langs_str).unwrap_or_else(|_| vec!["en".to_string(), "zh".to_string()]);
    let agent_cli_kimi_bin = db.get_setting("agent_cli_kimi_bin").await.unwrap_or(None);
    let agent_cli_other_bin = db.get_setting("agent_cli_other_bin").await.unwrap_or(None);

    Ok(ApiResponse::ok(Settings {
        language,
        theme,
        max_concurrent,
        default_output_dir,
        ai_provider,
        ai_api_key,
        ai_model,
        yt_dlp_path,
        default_quality,
        default_format,
        default_sub_langs,
        agent_cli_kimi_bin,
        agent_cli_other_bin,
    }))
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
    if let Err(e) = db.set_setting("theme", &settings.theme).await {
        return Ok(ApiResponse::err(format!("Failed to save theme: {}", e)));
    }
    if let Err(e) = db.set_setting("max_concurrent", &settings.max_concurrent.to_string()).await {
        return Ok(ApiResponse::err(format!("Failed to save max_concurrent: {}", e)));
    }
    if let Some(ref dir) = settings.default_output_dir {
        if let Err(e) = db.set_setting("default_output_dir", dir).await {
            return Ok(ApiResponse::err(format!("Failed to save output dir: {}", e)));
        }
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
    if let Some(ref path) = settings.yt_dlp_path {
        if let Err(e) = db.set_setting("yt_dlp_path", path).await {
            return Ok(ApiResponse::err(format!("Failed to save yt-dlp path: {}", e)));
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

    // Notify queue manager to update concurrency
    let queue = app.state::<QueueManager>();
    queue.set_max_concurrent(settings.max_concurrent as usize).await;

    Ok(ApiResponse::ok(()))
}
