use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{AgentSwitchRecord, Database};
use crate::commands::ApiResponse;

// ─────────────────────────── Agent Types ───────────────────────────

#[derive(Debug, Serialize)]
pub struct AgentRoleOut {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub capabilities: Vec<String>,
    pub tools: Vec<String>,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: i32,
    pub context_window: i32,
    pub icon: String,
    pub color: String,
    pub auto_switch: bool,
    pub streaming: bool,
    pub requires_context: bool,
    pub order: i32,
}

#[derive(Debug, Serialize)]
pub struct QuickActionOut {
    pub id: String,
    pub agent_id: String,
    pub label: String,
    pub description: String,
    pub prompt_template: String,
    pub icon: String,
}

#[derive(Debug, Serialize)]
pub struct SkillOut {
    pub id: String,
    pub name: String,
    pub description: String,
    pub metadata: serde_json::Value,
    pub content: String,
    pub triggers: Vec<String>,
}

// ─────────────────────────── Agent Commands ───────────────────────────

fn builtin_agents() -> Vec<AgentRoleOut> {
    vec![
        AgentRoleOut {
            id: "general".to_string(),
            name: "通用助手".to_string(),
            description: "ContentForge 通用助手，帮助用户管理和处理内容".to_string(),
            system_prompt: "你是 ContentForge 的通用助手。你帮助用户管理内容资产、执行内容处理任务、导航应用功能。当用户请求需要专业分析时，你会建议切换到对应的专家 Agent。".to_string(),
            capabilities: vec!["general".to_string(), "search".to_string()],
            tools: vec!["search_assets".to_string(), "get_asset_detail".to_string(), "list_sessions".to_string()],
            model: "gpt-4o-mini".to_string(),
            temperature: 0.7,
            max_tokens: 4000,
            context_window: 128000,
            icon: "bot".to_string(),
            color: "#6366f1".to_string(),
            auto_switch: false,
            streaming: true,
            requires_context: false,
            order: 0,
        },
        AgentRoleOut {
            id: "content_analyst".to_string(),
            name: "内容分析师".to_string(),
            description: "分析内容结构、提取要点、情感分析".to_string(),
            system_prompt: "你是内容分析专家，擅长从文本/视频中提取结构化洞察。你能分析主题、关键词、情感倾向、内容质量，并给出结构化的分析报告。".to_string(),
            capabilities: vec!["analyze".to_string(), "search".to_string()],
            tools: vec!["analyze".to_string(), "extract_keywords".to_string(), "detect_language".to_string()],
            model: "gpt-4o".to_string(),
            temperature: 0.3,
            max_tokens: 4000,
            context_window: 128000,
            icon: "microscope".to_string(),
            color: "#0ea5e9".to_string(),
            auto_switch: true,
            streaming: true,
            requires_context: true,
            order: 1,
        },
        AgentRoleOut {
            id: "summarizer".to_string(),
            name: "摘要专家".to_string(),
            description: "生成多风格摘要".to_string(),
            system_prompt: "你是摘要专家，擅长将长内容转化为精炼的要点。你支持多种摘要风格：结构化、简洁、详细、要点列表、执行摘要。".to_string(),
            capabilities: vec!["summarize".to_string(), "search".to_string()],
            tools: vec!["summarize".to_string(), "chunk_text".to_string()],
            model: "gpt-4o-mini".to_string(),
            temperature: 0.5,
            max_tokens: 4000,
            context_window: 128000,
            icon: "scroll-text".to_string(),
            color: "#8b5cf6".to_string(),
            auto_switch: true,
            streaming: true,
            requires_context: true,
            order: 2,
        },
        AgentRoleOut {
            id: "rewriter".to_string(),
            name: "改写专家".to_string(),
            description: "改写风格、翻译、润色".to_string(),
            system_prompt: "你是文案改写专家，能根据不同平台调性调整内容。你支持专业、casual、幽默、学术、营销等多种风格，也支持中英日翻译。".to_string(),
            capabilities: vec!["rewrite".to_string(), "translate".to_string(), "search".to_string()],
            tools: vec!["rewrite".to_string(), "translate".to_string(), "xiaohongshu_convert".to_string()],
            model: "gpt-4o".to_string(),
            temperature: 0.8,
            max_tokens: 4000,
            context_window: 128000,
            icon: "pen-tool".to_string(),
            color: "#ec4899".to_string(),
            auto_switch: true,
            streaming: true,
            requires_context: true,
            order: 3,
        },
        AgentRoleOut {
            id: "publisher".to_string(),
            name: "发布助手".to_string(),
            description: "格式转换、发布准备".to_string(),
            system_prompt: "你是发布专家，负责将内容转化为各平台可用格式。你支持 Markdown、小红书、JSON 等格式导出，并确保内容符合平台规范。".to_string(),
            capabilities: vec!["publish".to_string(), "search".to_string()],
            tools: vec!["publish".to_string(), "generate_markdown".to_string(), "generate_xhs".to_string()],
            model: "gpt-4o-mini".to_string(),
            temperature: 0.6,
            max_tokens: 4000,
            context_window: 128000,
            icon: "send".to_string(),
            color: "#10b981".to_string(),
            auto_switch: true,
            streaming: true,
            requires_context: true,
            order: 4,
        },
        AgentRoleOut {
            id: "pipeline_runner".to_string(),
            name: "流水线执行器".to_string(),
            description: "执行预设 Pipeline".to_string(),
            system_prompt: "你是流水线调度员，负责执行和管理内容处理 Pipeline。你了解所有预设流程，能根据用户需求选择最佳流程。".to_string(),
            capabilities: vec!["pipeline".to_string(), "search".to_string()],
            tools: vec!["run_pipeline".to_string(), "list_presets".to_string()],
            model: "gpt-4o-mini".to_string(),
            temperature: 0.3,
            max_tokens: 4000,
            context_window: 128000,
            icon: "workflow".to_string(),
            color: "#f59e0b".to_string(),
            auto_switch: true,
            streaming: true,
            requires_context: true,
            order: 5,
        },
    ]
}

fn builtin_quick_actions() -> Vec<QuickActionOut> {
    vec![
        QuickActionOut {
            id: "summarize".to_string(),
            agent_id: "summarizer".to_string(),
            label: "生成摘要".to_string(),
            description: "为选中的内容生成结构化摘要".to_string(),
            prompt_template: "请为以下内容生成摘要：\n\n{{asset_content}}".to_string(),
            icon: "scroll-text".to_string(),
        },
        QuickActionOut {
            id: "rewrite-xhs".to_string(),
            agent_id: "rewriter".to_string(),
            label: "转小红书".to_string(),
            description: "将内容改写为小红书风格".to_string(),
            prompt_template: "请将以下内容改写为小红书风格的文案：\n\n{{asset_content}}".to_string(),
            icon: "pen-tool".to_string(),
        },
        QuickActionOut {
            id: "analyze".to_string(),
            agent_id: "content_analyst".to_string(),
            label: "分析内容".to_string(),
            description: "分析内容的主题、情感和关键词".to_string(),
            prompt_template: "请分析以下内容：\n\n{{asset_content}}".to_string(),
            icon: "microscope".to_string(),
        },
    ]
}

#[tauri::command]
pub async fn get_agents() -> Result<ApiResponse<Vec<AgentRoleOut>>, String> {
    Ok(ApiResponse::ok(builtin_agents()))
}

#[derive(Debug, Deserialize)]
pub struct SwitchAgentRequest {
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub triggered_by: String,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn switch_agent(
    db: State<'_, Database>,
    request: SwitchAgentRequest,
) -> Result<ApiResponse<()>, String> {
    let record = AgentSwitchRecord {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: "".to_string(),
        from_agent_id: request.from_agent_id,
        to_agent_id: request.to_agent_id.clone(),
        reason: request.reason,
        triggered_by: request.triggered_by,
        created_at: chrono::Utc::now(),
    };

    match db.record_agent_switch(&record).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to record switch: {}", e))),
    }
}

#[tauri::command]
pub async fn get_quick_actions() -> Result<ApiResponse<Vec<QuickActionOut>>, String> {
    Ok(ApiResponse::ok(builtin_quick_actions()))
}

#[tauri::command]
pub async fn get_skills() -> Result<ApiResponse<Vec<SkillOut>>, String> {
    Ok(ApiResponse::ok(vec![]))
}

#[derive(Debug, Deserialize)]
pub struct ExecuteSkillRequest {
    pub skill_id: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct SkillExecutionResult {
    pub skill_id: String,
    pub status: String,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn execute_skill(
    _request: ExecuteSkillRequest,
) -> Result<ApiResponse<SkillExecutionResult>, String> {
    Ok(ApiResponse::err("Skill execution not yet implemented".to_string()))
}
