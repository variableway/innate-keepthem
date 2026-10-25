use chrono::Utc;
use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use uuid::Uuid;

use crate::db::{Database, VttReport};
use crate::downloader::Downloader;

#[derive(Debug, Clone, Serialize)]
struct VttStatusEvent {
    #[serde(rename = "reportId")]
    report_id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct VttCompleteEvent {
    #[serde(rename = "reportId")]
    report_id: String,
}

pub async fn start_analysis(
    app: AppHandle,
    db: Database,
    youtube_url: String,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let video_id = extract_video_id(&youtube_url);

    let report = VttReport {
        id: id.clone(),
        youtube_url: youtube_url.clone(),
        video_id: video_id.clone(),
        title: None,
        language: None,
        content: String::new(),
        cue_count: 0,
        duration_sec: None,
        created_at: Utc::now(),
        status: "pending".to_string(),
        error: None,
    };

    db.create_vtt_report(&report)
        .await
        .map_err(|e| e.to_string())?;

    emit_status(&app, &id, "pending", None);

    let app_clone = app.clone();
    let db_clone = db.clone();
    tauri::async_runtime::spawn(async move {
        run_analysis(app_clone, db_clone, id, youtube_url).await;
    });

    Ok(report.id)
}

async fn run_analysis(app: AppHandle, db: Database, id: String, youtube_url: String) {
    let output_dir = default_output_dir();
    let vtt_dir = PathBuf::from(&output_dir).join("vtt-temp").join(&id);

    let result = async {
        tokio::fs::create_dir_all(&vtt_dir).await.map_err(|e| e.to_string())?;

        db.update_vtt_report(&id, None, None, None, None, None, None, Some("processing"), None)
            .await
            .map_err(|e| e.to_string())?;
        emit_status(&app, &id, "processing", None);

        let downloader = Downloader::new_default();
        let video_info = fetch_video_info(&downloader, &youtube_url).await;
        let (language, vtt_path) = download_vtt(&downloader, &youtube_url, &vtt_dir).await?;
        let markdown = convert_vtt_to_markdown(&vtt_path).await?;
        let cue_count = count_cues(&markdown);
        let duration_sec = video_info.as_ref().map(|info| info.duration);

        db.update_vtt_report(
            &id,
            video_info.as_ref().map(|info| info.title.as_str()),
            Some(&language),
            Some(&markdown),
            Some(cue_count),
            duration_sec,
            extract_video_id(&youtube_url).as_deref(),
            Some("done"),
            None,
        )
        .await
        .map_err(|e| e.to_string())?;

        emit_complete(&app, &id);
        Ok::<(), String>(())
    }
    .await;

    if let Err(error) = result {
        let _ = db
            .update_vtt_report(&id, None, None, None, None, None, None, Some("failed"), Some(&error))
            .await;
        emit_status(&app, &id, "failed", Some(error));
    }

    if let Ok(report) = db.get_vtt_report(&id).await {
        if let Some(report) = report {
            if report.status == "done" || report.status == "failed" {
                let _ = tokio::fs::remove_dir_all(&vtt_dir).await;
            }
        }
    }
}

struct VideoInfo {
    title: String,
    duration: f64,
}

async fn fetch_video_info(downloader: &Downloader, url: &str) -> Option<VideoInfo> {
    match downloader.get_info(url).await {
        Ok(info) => Some(VideoInfo {
            title: info.title,
            duration: info.duration.unwrap_or(0) as f64,
        }),
        Err(_) => None,
    }
}

async fn download_vtt(
    downloader: &Downloader,
    url: &str,
    output_dir: &PathBuf,
) -> Result<(String, PathBuf), String> {
    let langs = ["zh", "en", "ja", "ko", "zh-Hans", "zh-Hant"];

    for lang in langs {
        let out_template = output_dir.join("%(id)s.%(lang)s.vtt");
        let out_template = out_template.to_string_lossy().to_string();

        let args = vec![
            "--write-subs".to_string(),
            "--write-auto-subs".to_string(),
            "--sub-langs".to_string(),
            lang.to_string(),
            "--skip-download".to_string(),
            "-o".to_string(),
            out_template,
            url.to_string(),
        ];

        if downloader.run_yt_dlp(args, 60).await.is_err() {
            continue;
        }

        let mut entries = tokio::fs::read_dir(output_dir).await.map_err(|e| e.to_string())?;
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".vtt")
                && (name.contains(&format!(".{}.", lang)) || name.contains(&format!(".{}-", lang)))
            {
                return Ok((lang.to_string(), entry.path()));
            }
        }
    }

    Err("No subtitles found".to_string())
}

async fn convert_vtt_to_markdown(vtt_path: &PathBuf) -> Result<String, String> {
    let cli_path = find_contentforge_cli().await?;

    let output = Command::new(&cli_path)
        .args(["analyze", "--mode", "markdown", &vtt_path.to_string_lossy()])
        .output()
        .await
        .map_err(|e| format!("Failed to run CLI: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(if stderr.is_empty() {
            format!("vtt analyze failed with code {:?}", output.status.code())
        } else {
            stderr.to_string()
        })
    }
}

fn count_cues(markdown: &str) -> i64 {
    let re = Regex::new(r"\d{2}:\d{2}:\d{2}\s+\S").unwrap();
    re.find_iter(markdown).count() as i64
}

fn extract_video_id(url: &str) -> Option<String> {
    let re = Regex::new(
        r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([a-zA-Z0-9_-]{11})",
    )
    .unwrap();
    re.captures(url)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

async fn find_contentforge_cli() -> Result<String, String> {
    if let Ok(path) = std::env::var("CONTENTFORGE_CLI_PATH") {
        if tokio::fs::metadata(&path).await.is_ok() {
            return Ok(path);
        }
    }

    if let Ok(mut cwd) = std::env::current_dir() {
        for _ in 0..6 {
            let candidate = cwd.join("vYtDL").join("vYtDL");
            if tokio::fs::metadata(&candidate).await.is_ok() {
                return Ok(candidate.to_string_lossy().to_string());
            }
            if !cwd.pop() {
                break;
            }
        }
    }

    let lookup_cmd = if std::env::consts::OS == "windows" {
        "where"
    } else {
        "which"
    };

    if let Ok(output) = Command::new(lookup_cmd).arg("vYtDL").output().await {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() && tokio::fs::metadata(&path).await.is_ok() {
                return Ok(path);
            }
        }
    }

    Err("vYtDL CLI not found. Set CONTENTFORGE_CLI_PATH or ensure vYtDL is in PATH.".to_string())
}

fn default_output_dir() -> String {
    std::env::var("CONTENTFORGE_OUTPUT_DIR").unwrap_or_else(|_| {
        dirs::download_dir()
            .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
            .join("ContentForge")
            .to_string_lossy()
            .to_string()
    })
}

fn emit_status(app: &AppHandle, report_id: &str, status: &str, error: Option<String>) {
    let _ = app.emit(
        "vtt-report:status",
        VttStatusEvent {
            report_id: report_id.to_string(),
            status: status.to_string(),
            error,
        },
    );
}

fn emit_complete(app: &AppHandle, report_id: &str) {
    let _ = app.emit(
        "vtt-report:complete",
        VttCompleteEvent {
            report_id: report_id.to_string(),
        },
    );
}
