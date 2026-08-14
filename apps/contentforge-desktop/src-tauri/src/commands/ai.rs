use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::commands::ApiResponse;
use crate::db::{Database, VttReport};

// ─────────────────────────── AI Types ───────────────────────────

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

// ─────────────────────────── AI Commands ───────────────────────────

#[tauri::command]
pub async fn summarize_video(
    _db: State<'_, Database>,
    _request: SummarizeRequest,
) -> Result<ApiResponse<SummaryResult>, String> {
    let summary = SummaryResult {
        markdown: "# Summary\n\nComing soon...".to_string(),
        key_points: vec![],
    };
    Ok(ApiResponse::ok(summary))
}

#[tauri::command]
pub async fn extract_audio(
    request: crate::audio_extractor::ExtractAudioOptions,
) -> Result<ApiResponse<crate::audio_extractor::ExtractAudioResult>, String> {
    match crate::audio_extractor::extract_audio(request).await {
        Ok(result) => Ok(ApiResponse::ok(result)),
        Err(e) => Ok(ApiResponse::err(e)),
    }
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

#[tauri::command]
pub async fn detect_agent_cli(
    kimi_bin: Option<String>,
    other_bin: Option<String>,
) -> Result<ApiResponse<crate::agent_cli::DetectAgentCliResult>, String> {
    let result = crate::agent_cli::detect_agent_cli_tools(kimi_bin, other_bin);
    Ok(ApiResponse::ok(result))
}
