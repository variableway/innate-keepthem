use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ─────────────────────────── Enums ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Active,
    Archived,
    Pinned,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Sending,
    Streaming,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AssetStatus {
    Ingested,
    Processing,
    Processed,
    Ready,
    Published,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

// ─────────────────────────── Structs ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub agent_id: String,
    pub status: SessionStatus,
    pub linked_task_id: Option<String>,
    pub linked_asset_ids: String, // JSON array
    pub metadata: Option<String>, // JSON object
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub status: MessageStatus,
    pub model: Option<String>,
    pub tokens_used: Option<String>, // JSON {prompt, completion, total}
    pub tool_calls: Option<String>,  // JSON array
    pub tool_results: Option<String>, // JSON array
    pub selected_asset_ids: Option<String>, // JSON array
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Asset {
    pub id: String,
    pub title: String,
    pub asset_type: String,
    pub status: AssetStatus,
    pub platform: Option<String>,
    pub url: Option<String>,
    pub file_path: Option<String>,
    pub thumbnail_url: Option<String>,
    pub description: Option<String>,
    pub extracted_text: Option<String>,
    pub summary: Option<String>,
    pub transcript: Option<String>,
    pub translated_text: Option<String>,
    pub rewritten_text: Option<String>,
    pub duration_sec: Option<f64>,
    pub analysis: Option<String>, // JSON
    pub tags: String,            // JSON array
    pub pipeline_id: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub engagement: Option<String>, // JSON
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentSwitchRecord {
    pub id: String,
    pub session_id: String,
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub reason: Option<String>,
    pub triggered_by: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PipelineRun {
    pub id: String,
    pub pipeline_id: String,
    pub asset_id: Option<String>,
    pub status: String,
    pub progress: f64,
    pub current_step: Option<String>,
    pub step_results: Option<String>, // JSON
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct VttReport {
    pub id: String,
    pub youtube_url: String,
    pub video_id: Option<String>,
    pub title: Option<String>,
    pub language: Option<String>,
    pub content: String,
    pub cue_count: i64,
    pub duration_sec: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub status: DownloadStatus,
    pub progress: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub output_dir: Option<String>,
    pub filename: Option<String>,
    pub subtitles: Vec<String>,
    pub error: Option<String>,
    pub queue_position: i64,
    pub options: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
