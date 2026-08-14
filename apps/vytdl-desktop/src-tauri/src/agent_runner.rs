use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Deserialize)]
pub struct AssetContext {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub asset_type: String,
    pub source_url: Option<String>,
    pub transcript_excerpt: Option<String>,
    pub language: Option<String>,
    pub duration_sec: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AgentTokenEvent {
    pub session_id: String,
    pub token: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AgentDoneEvent {
    pub session_id: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AgentErrorEvent {
    pub session_id: String,
    pub error: String,
}

#[derive(Debug, Deserialize)]
struct KimiStreamLine {
    role: Option<String>,
    content: Option<String>,
}

pub fn find_project_root() -> PathBuf {
    if let Ok(root) = std::env::var("VYTDL_PROJECT_ROOT") {
        let path = PathBuf::from(root);
        if path.join(".agents").join("skills").exists() {
            return path;
        }
    }

    if let Ok(mut cwd) = std::env::current_dir() {
        for _ in 0..8 {
            if cwd.join(".agents").join("skills").exists() {
                return cwd;
            }
            if !cwd.pop() {
                break;
            }
        }
    }

    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn build_prompt(message: &str, context: &[AssetContext]) -> String {
    let mut prompt = String::from(
        "You are an AI assistant helping the user understand and analyze their downloaded videos and transcript reports.\n\
         Answer in the same language as the user's question when possible.\n\
         Reference timestamps when transcript content includes them.\n\n",
    );

    if !context.is_empty() {
        prompt.push_str("## Selected Media Context\n\n");
        for asset in context {
            prompt.push_str(&format!("### {} ({}) \n", asset.title, asset.asset_type));
            if let Some(url) = &asset.source_url {
                prompt.push_str(&format!("Source: {url}\n"));
            }
            if let Some(lang) = &asset.language {
                prompt.push_str(&format!("Language: {lang}\n"));
            }
            if let Some(duration) = asset.duration_sec {
                prompt.push_str(&format!("Duration: {duration:.0}s\n"));
            }
            if let Some(excerpt) = &asset.transcript_excerpt {
                prompt.push_str("\nTranscript excerpt:\n");
                prompt.push_str(excerpt);
                prompt.push_str("\n");
            }
            prompt.push('\n');
        }
    }

    prompt.push_str("## User Question\n");
    prompt.push_str(message);
    prompt.push('\n');
    prompt
}

pub fn spawn_kimi_chat(
    app: AppHandle,
    session_id: String,
    kimi_bin: String,
    prompt: String,
    project_root: PathBuf,
) {
    tauri::async_runtime::spawn(async move {
        let result = run_kimi_stream(&app, &session_id, &kimi_bin, &prompt, &project_root).await;
        if let Err(error) = result {
            let _ = app.emit(
                "agent:error",
                AgentErrorEvent {
                    session_id,
                    error,
                },
            );
        }
    });
}

async fn run_kimi_stream(
    app: &AppHandle,
    session_id: &str,
    kimi_bin: &str,
    prompt: &str,
    project_root: &PathBuf,
) -> Result<(), String> {
    let session_id_owned = session_id.to_string();
    let kimi_bin = kimi_bin.to_string();
    let prompt = prompt.to_string();
    let project_root = project_root.clone();
    let app = app.clone();

    tokio::task::spawn_blocking(move || {
        let mut child = Command::new(&kimi_bin)
            .args([
                "-p",
                &prompt,
                "--output-format",
                "stream-json",
                "-y",
            ])
            .current_dir(&project_root)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start Kimi CLI: {e}"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture Kimi stdout".to_string())?;

        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = line.map_err(|e| format!("Failed to read Kimi output: {e}"))?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(parsed) = serde_json::from_str::<KimiStreamLine>(trimmed) {
                if parsed.role.as_deref() == Some("assistant") {
                    if let Some(token) = parsed.content.filter(|c| !c.is_empty()) {
                        let _ = app.emit(
                            "agent:token",
                            AgentTokenEvent {
                                session_id: session_id_owned.clone(),
                                token,
                            },
                        );
                    }
                }
            }
        }

        let status = child
            .wait()
            .map_err(|e| format!("Kimi CLI process error: {e}"))?;

        if !status.success() {
            return Err(format!(
                "Kimi CLI exited with status {}",
                status.code().unwrap_or(-1)
            ));
        }

        let _ = app.emit(
            "agent:done",
            AgentDoneEvent {
                session_id: session_id_owned,
            },
        );

        Ok(())
    })
    .await
    .map_err(|e| format!("Agent task panicked: {e}"))?
}
