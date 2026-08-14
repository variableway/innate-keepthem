use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Pipeline execution status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PipelineRunStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Pipeline run record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineRun {
    pub id: String,
    pub pipeline_id: String,
    pub asset_id: String,
    pub status: PipelineRunStatus,
    pub progress: f64,
    pub current_step: Option<String>,
    pub step_results: HashMap<String, StepResult>,
    pub error: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

/// Individual step result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step_id: String,
    pub status: String,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

/// Built-in pipeline definitions
pub fn get_builtin_pipelines() -> Vec<crate::asset_processor::Pipeline> {
    vec![
        crate::asset_processor::Pipeline {
            id: "video-to-article".to_string(),
            name: "视频转文章".to_string(),
            description: Some("将视频下载、转录、总结并改写成文章".to_string()),
            steps: vec![
                crate::asset_processor::PipelineStep {
                    id: "download".to_string(),
                    name: "下载视频".to_string(),
                    step_type: "download".to_string(),
                    config: serde_json::json!({"quality": "best", "format": "mp4"}),
                    depends_on: vec![],
                },
                crate::asset_processor::PipelineStep {
                    id: "extract_audio".to_string(),
                    name: "提取音频".to_string(),
                    step_type: "extract_audio".to_string(),
                    config: serde_json::json!({"format": "mp3"}),
                    depends_on: vec!["download".to_string()],
                },
                crate::asset_processor::PipelineStep {
                    id: "transcribe".to_string(),
                    name: "语音转文字".to_string(),
                    step_type: "transcribe".to_string(),
                    config: serde_json::json!({"language": "auto"}),
                    depends_on: vec!["extract_audio".to_string()],
                },
                crate::asset_processor::PipelineStep {
                    id: "summarize".to_string(),
                    name: "生成摘要".to_string(),
                    step_type: "summarize".to_string(),
                    config: serde_json::json!({"max_length": 500}),
                    depends_on: vec!["transcribe".to_string()],
                },
                crate::asset_processor::PipelineStep {
                    id: "rewrite".to_string(),
                    name: "改写文章".to_string(),
                    step_type: "rewrite".to_string(),
                    config: serde_json::json!({"style": "article", "tone": "professional"}),
                    depends_on: vec!["summarize".to_string()],
                },
            ],
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
        crate::asset_processor::Pipeline {
            id: "tweet-analysis".to_string(),
            name: "推文分析".to_string(),
            description: Some("分析推文内容，提取关键信息和情感".to_string()),
            steps: vec![
                crate::asset_processor::PipelineStep {
                    id: "fetch".to_string(),
                    name: "获取推文".to_string(),
                    step_type: "fetch".to_string(),
                    config: serde_json::json!({}),
                    depends_on: vec![],
                },
                crate::asset_processor::PipelineStep {
                    id: "analyze".to_string(),
                    name: "内容分析".to_string(),
                    step_type: "analyze".to_string(),
                    config: serde_json::json!({"extract_entities": true, "sentiment": true}),
                    depends_on: vec!["fetch".to_string()],
                },
                crate::asset_processor::PipelineStep {
                    id: "summarize".to_string(),
                    name: "生成摘要".to_string(),
                    step_type: "summarize".to_string(),
                    config: serde_json::json!({"max_length": 200}),
                    depends_on: vec!["analyze".to_string()],
                },
            ],
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
        crate::asset_processor::Pipeline {
            id: "rss-to-assets".to_string(),
            name: "RSS 订阅采集".to_string(),
            description: Some("从 RSS 源采集文章并分析".to_string()),
            steps: vec![
                crate::asset_processor::PipelineStep {
                    id: "fetch_feed".to_string(),
                    name: "获取 RSS 源".to_string(),
                    step_type: "fetch_feed".to_string(),
                    config: serde_json::json!({"max_items": 50}),
                    depends_on: vec![],
                },
                crate::asset_processor::PipelineStep {
                    id: "extract_content".to_string(),
                    name: "提取正文".to_string(),
                    step_type: "extract_content".to_string(),
                    config: serde_json::json!({"remove_ads": true}),
                    depends_on: vec!["fetch_feed".to_string()],
                },
                crate::asset_processor::PipelineStep {
                    id: "analyze".to_string(),
                    name: "内容分析".to_string(),
                    step_type: "analyze".to_string(),
                    config: serde_json::json!({"topics": true, "keywords": true}),
                    depends_on: vec!["extract_content".to_string()],
                },
            ],
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
    ]
}

/// Execute a pipeline step
pub async fn execute_step(
    step: &crate::asset_processor::PipelineStep,
    asset_id: &str,
    db: &crate::database::Database,
) -> Result<StepResult, String> {
    let started_at = chrono::Utc::now().to_rfc3339();

    let result = match step.step_type.as_str() {
        "download" => execute_download_step(step, asset_id, db).await,
        "extract_audio" => execute_extract_audio_step(step, asset_id, db).await,
        "transcribe" => execute_transcribe_step(step, asset_id, db).await,
        "summarize" => execute_summarize_step(step, asset_id, db).await,
        "rewrite" => execute_rewrite_step(step, asset_id, db).await,
        "analyze" => execute_analyze_step(step, asset_id, db).await,
        "fetch" => execute_fetch_step(step, asset_id, db).await,
        "fetch_feed" => execute_fetch_feed_step(step, asset_id, db).await,
        "extract_content" => execute_extract_content_step(step, asset_id, db).await,
        _ => Err(format!("Unknown step type: {}", step.step_type)),
    };

    let completed_at = chrono::Utc::now().to_rfc3339();

    match result {
        Ok(output) => Ok(StepResult {
            step_id: step.id.clone(),
            status: "completed".to_string(),
            output: Some(output),
            error: None,
            started_at,
            completed_at: Some(completed_at),
        }),
        Err(error) => Ok(StepResult {
            step_id: step.id.clone(),
            status: "failed".to_string(),
            output: None,
            error: Some(error),
            started_at,
            completed_at: Some(completed_at),
        }),
    }
}

// Step implementations (stubs for now)

async fn execute_download_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement actual download logic
    Ok(serde_json::json!({"status": "downloaded"}))
}

async fn execute_extract_audio_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement audio extraction
    Ok(serde_json::json!({"status": "audio_extracted"}))
}

async fn execute_transcribe_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement transcription
    Ok(serde_json::json!({"status": "transcribed", "text": ""}))
}

async fn execute_summarize_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement summarization
    Ok(serde_json::json!({"status": "summarized", "summary": ""}))
}

async fn execute_rewrite_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement rewriting
    Ok(serde_json::json!({"status": "rewritten", "text": ""}))
}

async fn execute_analyze_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement analysis
    Ok(serde_json::json!({
        "status": "analyzed",
        "topics": [],
        "keywords": [],
        "entities": [],
        "sentiment": {"label": "neutral", "confidence": 0.5}
    }))
}

async fn execute_fetch_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement fetching
    Ok(serde_json::json!({"status": "fetched"}))
}

async fn execute_fetch_feed_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement RSS feed fetching
    Ok(serde_json::json!({"status": "feed_fetched", "items": []}))
}

async fn execute_extract_content_step(
    _step: &crate::asset_processor::PipelineStep,
    _asset_id: &str,
    _db: &crate::database::Database,
) -> Result<serde_json::Value, String> {
    // TODO: Implement content extraction
    Ok(serde_json::json!({"status": "content_extracted", "text": ""}))
}
