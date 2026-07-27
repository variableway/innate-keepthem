use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::db::{Database, Message, MessageStatus, Session, SessionStatus};
use crate::commands::ApiResponse;

// ─────────────────────────── Chat Types ───────────────────────────

#[derive(Debug, Serialize)]
pub struct ChatSessionOut {
    pub id: String,
    pub title: String,
    pub agent_id: String,
    pub status: String,
    pub linked_task_id: Option<String>,
    pub linked_asset_ids: Vec<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct ChatMessageOut {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub model: Option<String>,
    pub tokens_used: Option<serde_json::Value>,
    pub tool_calls: Option<Vec<serde_json::Value>>,
    pub tool_results: Option<Vec<serde_json::Value>>,
    pub selected_asset_ids: Option<Vec<String>>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateChatSessionRequest {
    pub session_id: String,
    pub agent_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
pub struct GetChatHistoryRequest {
    pub session_id: String,
    pub cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatSendRequest {
    pub session_id: String,
    pub message: String,
    pub agent_id: Option<String>,
    pub selected_asset_ids: Option<Vec<String>>,
    pub streaming: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ChatSendResponse {
    pub message_id: String,
    pub session_id: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct CancelChatStreamRequest {
    pub message_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ArchiveSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
pub struct PinSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionTitleRequest {
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatRetryRequest {
    pub session_id: String,
    pub message_id: String,
    pub message: String,
    pub selected_asset_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteMessageRequest {
    pub session_id: String,
    pub message_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmToolCallRequest {
    pub message_id: String,
    pub call_id: String,
    pub approved: bool,
}

// ─────────────────────────── Helpers ───────────────────────────

fn session_to_out(s: Session) -> ChatSessionOut {
    ChatSessionOut {
        id: s.id,
        title: s.title,
        agent_id: s.agent_id,
        status: match s.status {
            SessionStatus::Active => "active".to_string(),
            SessionStatus::Archived => "archived".to_string(),
            SessionStatus::Pinned => "pinned".to_string(),
        },
        linked_task_id: s.linked_task_id,
        linked_asset_ids: serde_json::from_str(&s.linked_asset_ids).unwrap_or_default(),
        metadata: s.metadata.and_then(|m| serde_json::from_str(&m).ok()),
        created_at: s.created_at.to_rfc3339(),
        updated_at: s.updated_at.to_rfc3339(),
    }
}

fn message_to_out(m: Message) -> ChatMessageOut {
    ChatMessageOut {
        id: m.id.clone(),
        session_id: m.session_id,
        role: m.role,
        content: m.content,
        status: match m.status {
            MessageStatus::Sending => "sending".to_string(),
            MessageStatus::Streaming => "streaming".to_string(),
            MessageStatus::Completed => "completed".to_string(),
            MessageStatus::Failed => "failed".to_string(),
            MessageStatus::Cancelled => "cancelled".to_string(),
        },
        model: m.model,
        tokens_used: m.tokens_used.and_then(|t| serde_json::from_str(&t).ok()),
        tool_calls: m.tool_calls.and_then(|t| serde_json::from_str(&t).ok()),
        tool_results: m.tool_results.and_then(|t| serde_json::from_str(&t).ok()),
        selected_asset_ids: m.selected_asset_ids.and_then(|a| serde_json::from_str(&a).ok()),
        error: m.error,
        created_at: m.created_at.to_rfc3339(),
        updated_at: m.updated_at.to_rfc3339(),
    }
}

// ─────────────────────────── Chat Commands ───────────────────────────

#[tauri::command]
pub async fn get_chat_sessions(
    db: State<'_, Database>,
) -> Result<ApiResponse<Vec<ChatSessionOut>>, String> {
    match db.get_sessions().await {
        Ok(sessions) => {
            let out: Vec<ChatSessionOut> = sessions.into_iter().map(session_to_out).collect();
            Ok(ApiResponse::ok(out))
        }
        Err(e) => Ok(ApiResponse::err(format!("Failed to get sessions: {}", e))),
    }
}

#[tauri::command]
pub async fn create_chat_session(
    db: State<'_, Database>,
    request: CreateChatSessionRequest,
) -> Result<ApiResponse<ChatSessionOut>, String> {
    let now = chrono::Utc::now();
    let session = Session {
        id: request.session_id.clone(),
        title: request.title,
        agent_id: request.agent_id,
        status: SessionStatus::Active,
        linked_task_id: None,
        linked_asset_ids: "[]".to_string(),
        metadata: None,
        created_at: now,
        updated_at: now,
    };

    match db.create_session(&session).await {
        Ok(_) => Ok(ApiResponse::ok(session_to_out(session))),
        Err(e) => Ok(ApiResponse::err(format!("Failed to create session: {}", e))),
    }
}

#[tauri::command]
pub async fn get_chat_history(
    db: State<'_, Database>,
    request: GetChatHistoryRequest,
) -> Result<ApiResponse<serde_json::Value>, String> {
    let page_size = 50;
    let offset = request.cursor.and_then(|c| c.parse::<i64>().ok()).unwrap_or(0);

    match db.get_messages_by_session(&request.session_id, page_size, offset).await {
        Ok(messages) => {
            let out: Vec<ChatMessageOut> = messages.into_iter().map(message_to_out).collect();
            let has_more = out.len() as i64 >= page_size;
            let next_cursor = if has_more {
                Some((offset + page_size).to_string())
            } else {
                None
            };
            Ok(ApiResponse::ok(serde_json::json!({
                "messages": out,
                "hasMore": has_more,
                "nextCursor": next_cursor,
            })))
        }
        Err(e) => Ok(ApiResponse::err(format!("Failed to get history: {}", e))),
    }
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    db: State<'_, Database>,
    request: ChatSendRequest,
) -> Result<ApiResponse<ChatSendResponse>, String> {
    if request.message.trim().is_empty() {
        return Ok(ApiResponse::err("Message is empty".to_string()));
    }

    let user_message_id = uuid::Uuid::new_v4().to_string();
    let assistant_message_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    // Ensure session exists
    if db.get_session_by_id(&request.session_id).await.map_err(|e| e.to_string())?.is_none() {
        let session = Session {
            id: request.session_id.clone(),
            title: request.message.chars().take(30).collect::<String>(),
            agent_id: request.agent_id.clone().unwrap_or_else(|| "general".to_string()),
            status: SessionStatus::Active,
            linked_task_id: None,
            linked_asset_ids: "[]".to_string(),
            metadata: None,
            created_at: now,
            updated_at: now,
        };
        if let Err(e) = db.create_session(&session).await {
            return Ok(ApiResponse::err(format!("Failed to create session: {}", e)));
        }
    }

    // Save user message
    let user_msg = Message {
        id: user_message_id,
        session_id: request.session_id.clone(),
        role: "user".to_string(),
        content: request.message.clone(),
        status: MessageStatus::Completed,
        model: None,
        tokens_used: None,
        tool_calls: None,
        tool_results: None,
        selected_asset_ids: request.selected_asset_ids.as_ref().map(|ids| serde_json::to_string(ids).unwrap_or_default()),
        error: None,
        created_at: now,
        updated_at: now,
    };

    if let Err(e) = db.create_message(&user_msg).await {
        return Ok(ApiResponse::err(format!("Failed to save user message: {}", e)));
    }

    // Save assistant placeholder message
    let assistant_msg = Message {
        id: assistant_message_id.clone(),
        session_id: request.session_id.clone(),
        role: "assistant".to_string(),
        content: "".to_string(),
        status: MessageStatus::Streaming,
        model: None,
        tokens_used: None,
        tool_calls: None,
        tool_results: None,
        selected_asset_ids: None,
        error: None,
        created_at: now,
        updated_at: now,
    };

    if let Err(e) = db.create_message(&assistant_msg).await {
        return Ok(ApiResponse::err(format!("Failed to save assistant message: {}", e)));
    }

    // Update session title if it's the first message
    if let Ok(Some(session)) = db.get_session_by_id(&request.session_id).await {
        if session.title == "新会话" || session.title.is_empty() {
            let title = request.message.chars().take(30).collect::<String>();
            let _ = db.update_session_title(&request.session_id, &title).await;
        }
        let _ = db.update_session_agent(&request.session_id, &request.agent_id.clone().unwrap_or_else(|| "general".to_string())).await;
    }

    // Emit event to notify frontend that message is accepted
    let _ = app.emit(
        &format!("chat:accepted:{}", request.session_id),
        serde_json::json!({
            "userMessageId": user_msg.id,
            "assistantMessageId": assistant_message_id.clone(),
        }),
    );

    // Simulate streaming response (placeholder for actual AI integration)
    let app_clone = app.clone();
    let db_clone = db.inner().clone();
    let assistant_id = assistant_message_id.clone();
    let message_text = request.message.clone();

    tokio::spawn(async move {
        let response_text = format!("收到: {}", message_text);
        let words: Vec<&str> = response_text.split_whitespace().collect();
        let mut accumulated = String::new();

        for word in words {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            accumulated.push_str(word);
            accumulated.push(' ');

            let _ = app_clone.emit(
                &format!("message:delta:{}", assistant_id),
                serde_json::json!({
                    "messageId": assistant_id,
                    "delta": format!("{} ", word),
                    "accumulated": accumulated.trim(),
                }),
            );
        }

        let _ = db_clone.update_message_content(&assistant_id, accumulated.trim()).await;
        let _ = db_clone.update_message_status(&assistant_id, MessageStatus::Completed).await;

        let _ = app_clone.emit(
            &format!("message:completed:{}", assistant_id),
            serde_json::json!({
                "messageId": assistant_id,
                "content": accumulated.trim(),
            }),
        );
    });

    Ok(ApiResponse::ok(ChatSendResponse {
        message_id: assistant_message_id,
        session_id: request.session_id,
        status: "accepted".to_string(),
    }))
}

#[tauri::command]
pub async fn cancel_chat_stream(
    db: State<'_, Database>,
    request: CancelChatStreamRequest,
) -> Result<ApiResponse<()>, String> {
    match db.update_message_status(&request.message_id, MessageStatus::Cancelled).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to cancel: {}", e))),
    }
}

#[tauri::command]
pub async fn archive_chat_session(
    db: State<'_, Database>,
    request: ArchiveSessionRequest,
) -> Result<ApiResponse<()>, String> {
    match db.update_session_status(&request.session_id, SessionStatus::Archived).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to archive: {}", e))),
    }
}

#[tauri::command]
pub async fn pin_chat_session(
    db: State<'_, Database>,
    request: PinSessionRequest,
) -> Result<ApiResponse<()>, String> {
    match db.update_session_status(&request.session_id, SessionStatus::Pinned).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to pin: {}", e))),
    }
}

#[tauri::command]
pub async fn update_chat_session_title(
    db: State<'_, Database>,
    request: UpdateSessionTitleRequest,
) -> Result<ApiResponse<()>, String> {
    match db.update_session_title(&request.session_id, &request.title).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to update title: {}", e))),
    }
}

#[tauri::command]
pub async fn delete_chat_session(
    db: State<'_, Database>,
    request: DeleteSessionRequest,
) -> Result<ApiResponse<()>, String> {
    match db.delete_session(&request.session_id).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to delete session: {}", e))),
    }
}

#[tauri::command]
pub async fn chat_retry(
    app: AppHandle,
    db: State<'_, Database>,
    request: ChatRetryRequest,
) -> Result<ApiResponse<ChatSendResponse>, String> {
    let assistant_message_id = request.message_id.clone();
    let now = chrono::Utc::now();

    let _ = db.update_message_content(&assistant_message_id, "").await;
    let _ = db.update_message_status(&assistant_message_id, MessageStatus::Streaming).await;
    let _ = db.update_message_error(&assistant_message_id, "").await;

    let app_clone = app.clone();
    let db_clone = db.inner().clone();
    let assistant_id = assistant_message_id.clone();
    let message_text = request.message.clone();

    tokio::spawn(async move {
        let response_text = format!("重试回复: {}", message_text);
        let words: Vec<&str> = response_text.split_whitespace().collect();
        let mut accumulated = String::new();

        for word in words {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            accumulated.push_str(word);
            accumulated.push(' ');

            let _ = app_clone.emit(
                &format!("message:delta:{}", assistant_id),
                serde_json::json!({
                    "messageId": assistant_id,
                    "delta": format!("{} ", word),
                }),
            );
        }

        let _ = db_clone.update_message_content(&assistant_id, accumulated.trim()).await;
        let _ = db_clone.update_message_status(&assistant_id, MessageStatus::Completed).await;

        let _ = app_clone.emit(
            &format!("message:completed:{}", assistant_id),
            serde_json::json!({
                "messageId": assistant_id,
                "content": accumulated.trim(),
            }),
        );
    });

    Ok(ApiResponse::ok(ChatSendResponse {
        message_id: assistant_message_id,
        session_id: request.session_id,
        status: "accepted".to_string(),
    }))
}

#[tauri::command]
pub async fn delete_chat_message(
    db: State<'_, Database>,
    request: DeleteMessageRequest,
) -> Result<ApiResponse<()>, String> {
    match db.delete_message(&request.message_id).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to delete message: {}", e))),
    }
}

#[tauri::command]
pub async fn confirm_tool_call(
    _request: ConfirmToolCallRequest,
) -> Result<ApiResponse<()>, String> {
    Ok(ApiResponse::ok(()))
}
