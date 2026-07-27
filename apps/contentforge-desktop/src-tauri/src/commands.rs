use serde::{Deserialize, Serialize};
use tauri::State;

use crate::database::Database;

// ─────────────────────────── Chat Commands ───────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub agent_id: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub async fn get_chat_sessions(db: State<'_, Database>) -> Result<Vec<ChatSession>, String> {
    // Placeholder implementation
    Ok(vec![])
}

#[tauri::command]
pub async fn create_chat_session(
    db: State<'_, Database>,
    session_id: String,
    agent_id: String,
    title: String,
) -> Result<(), String> {
    // Placeholder implementation
    Ok(())
}

#[tauri::command]
pub async fn get_chat_history(
    db: State<'_, Database>,
    session_id: String,
    cursor: Option<String>,
) -> Result<Vec<ChatMessage>, String> {
    // Placeholder implementation
    Ok(vec![])
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSendRequest {
    pub session_id: String,
    pub message: String,
    pub agent_id: Option<String>,
    pub selected_asset_ids: Option<Vec<String>>,
    pub streaming: Option<bool>,
}

#[tauri::command]
pub async fn chat_send(
    db: State<'_, Database>,
    request: ChatSendRequest,
) -> Result<serde_json::Value, String> {
    // Placeholder implementation
    Ok(serde_json::json!({
        "messageId": uuid::Uuid::new_v4().to_string(),
        "status": "accepted"
    }))
}

#[tauri::command]
pub async fn cancel_chat_stream(db: State<'_, Database>, message_id: String) -> Result<(), String> {
    // Placeholder implementation
    Ok(())
}

// ─────────────────────────── Agent Commands ───────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentRole {
    pub id: String,
    pub name: String,
    pub description: String,
    pub capabilities: Vec<String>,
    pub model: String,
    pub color: String,
    pub icon: String,
    pub order: i32,
}

#[tauri::command]
pub async fn get_agents(db: State<'_, Database>) -> Result<Vec<AgentRole>, String> {
    // Placeholder implementation - return default agents
    Ok(vec![
        AgentRole {
            id: "general".to_string(),
            name: "通用助手".to_string(),
            description: "ContentForge 通用助手".to_string(),
            capabilities: vec!["general".to_string(), "search".to_string()],
            model: "gpt-4o-mini".to_string(),
            color: "#6366f1".to_string(),
            icon: "bot".to_string(),
            order: 0,
        },
        AgentRole {
            id: "content_analyst".to_string(),
            name: "内容分析师".to_string(),
            description: "分析内容结构、提取要点".to_string(),
            capabilities: vec!["analyze".to_string(), "search".to_string()],
            model: "gpt-4o".to_string(),
            color: "#0ea5e9".to_string(),
            icon: "microscope".to_string(),
            order: 1,
        },
    ])
}

#[tauri::command]
pub async fn switch_agent(
    db: State<'_, Database>,
    from_agent_id: String,
    to_agent_id: String,
    triggered_by: String,
    reason: Option<String>,
) -> Result<(), String> {
    // Placeholder implementation
    Ok(())
}

// ─────────────────────────── Asset Commands ───────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ContentAsset {
    pub id: String,
    pub title: String,
    pub asset_type: String,
    pub status: String,
    pub platform: String,
    pub url: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub async fn search_assets(
    db: State<'_, Database>,
    filter: Option<serde_json::Value>,
    sort: Option<serde_json::Value>,
    pagination: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    // Placeholder implementation
    Ok(serde_json::json!({
        "assets": [],
        "total": 0,
        "page": 1,
        "pageSize": 20,
        "hasMore": false
    }))
}

#[tauri::command]
pub async fn get_asset_detail(
    db: State<'_, Database>,
    asset_id: String,
) -> Result<ContentAsset, String> {
    // Placeholder implementation
    Err("Asset not found".to_string())
}

// ─────────────────────────── Settings Commands ───────────────────────────

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<serde_json::Value, String> {
    // Placeholder implementation
    Ok(serde_json::json!({
        "language": "zh",
        "theme": "dark",
        "maxConcurrent": 3
    }))
}

#[tauri::command]
pub async fn update_settings(
    db: State<'_, Database>,
    settings: serde_json::Value,
) -> Result<(), String> {
    // Placeholder implementation
    Ok(())
}
