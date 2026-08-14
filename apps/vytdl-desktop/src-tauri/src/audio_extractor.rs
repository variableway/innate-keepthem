use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

/// Find ffmpeg executable using multiple strategies.
async fn find_ffmpeg() -> Result<String, String> {
    // 1. Check FFMPEG_PATH env var
    if let Ok(path) = std::env::var("FFMPEG_PATH") {
        if tokio::fs::metadata(&path).await.is_ok() {
            return Ok(path);
        }
    }

    // 2. Cross-platform PATH lookup
    let is_windows = std::env::consts::OS == "windows";
    let lookup_cmd = if is_windows { "where" } else { "which" };
    let binaries = if is_windows {
        vec!["ffmpeg.exe", "ffmpeg"]
    } else {
        vec!["ffmpeg"]
    };

    for bin in &binaries {
        if let Ok(output) = Command::new(lookup_cmd).arg(bin).output().await {
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
    }

    // 3. Common installation paths
    let common_paths = if is_windows {
        vec![
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
            r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
        ]
    } else if std::env::consts::OS == "macos" {
        vec![
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
            "~/.local/bin/ffmpeg",
        ]
    } else {
        vec![
            "/usr/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/bin/ffmpeg",
            "~/.local/bin/ffmpeg",
        ]
    };

    for path in &common_paths {
        let expanded = shellexpand::tilde(path).to_string();
        if tokio::fs::metadata(&expanded).await.is_ok() {
            return Ok(expanded);
        }
    }

    Err(ffmpeg_install_hint())
}

fn ffmpeg_install_hint() -> String {
    let os = std::env::consts::OS;
    let hint = match os {
        "macos" => {
            "ffmpeg not found.\n\n\
            Install hints for macOS:\n\
            • Homebrew: brew install ffmpeg\n\
            • MacPorts: sudo port install ffmpeg\n\n\
            After installing, ensure ffmpeg is in your PATH."
        }
        "windows" => {
            "ffmpeg not found.\n\n\
            Install hints for Windows:\n\
            • WinGet: winget install Gyan.FFmpeg\n\
            • Chocolatey: choco install ffmpeg\n\
            • Manual: download from https://ffmpeg.org/download.html\n\n\
            After installing, ensure ffmpeg is in your PATH."
        }
        _ => {
            "ffmpeg not found.\n\n\
            Install hints for Linux:\n\
            • apt: sudo apt install ffmpeg\n\
            • dnf: sudo dnf install ffmpeg\n\
            • pacman: sudo pacman -S ffmpeg\n\n\
            After installing, ensure ffmpeg is in your PATH."
        }
    };
    hint.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractAudioOptions {
    pub video_path: String,
    pub output_dir: Option<String>,
    pub audio_format: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExtractAudioResult {
    pub audio_path: String,
}

/// Extract audio from a video file using ffmpeg.
pub async fn extract_audio(options: ExtractAudioOptions) -> Result<ExtractAudioResult, String> {
    let ffmpeg_path = find_ffmpeg().await?;

    let video_path = Path::new(&options.video_path);
    if !video_path.exists() {
        return Err(format!("Video file not found: {}", options.video_path));
    }

    // Determine output directory
    let output_dir = options
        .output_dir
        .or_else(|| {
            video_path
                .parent()
                .map(|p| p.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| ".".to_string());

    // Ensure output directory exists
    tokio::fs::create_dir_all(&output_dir)
        .await
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    // Determine output filename
    let stem = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");

    let audio_format = options.audio_format.unwrap_or_else(|| "mp3".to_string());
    let (ext, codec_args): (&str, Vec<String>) = match audio_format.as_str() {
        "mp3" => ("mp3", vec!["-c:a".to_string(), "libmp3lame".to_string(), "-q:a".to_string(), "2".to_string()]),
        "m4a" | "aac" => ("m4a", vec!["-c:a".to_string(), "aac".to_string(), "-b:a".to_string(), "192k".to_string()]),
        "flac" => ("flac", vec!["-c:a".to_string(), "flac".to_string()]),
        "wav" => ("wav", vec!["-c:a".to_string(), "pcm_s16le".to_string()]),
        "ogg" => ("ogg", vec!["-c:a".to_string(), "libvorbis".to_string(), "-q:a".to_string(), "4".to_string()]),
        "opus" => ("opus", vec!["-c:a".to_string(), "libopus".to_string(), "-b:a".to_string(), "128k".to_string()]),
        _ => ("mp3", vec!["-c:a".to_string(), "libmp3lame".to_string(), "-q:a".to_string(), "2".to_string()]),
    };

    let output_path = format!("{}/{}.{}", output_dir, stem, ext);

    // Build ffmpeg command
    let mut args = vec![
        "-i".to_string(),
        options.video_path.clone(),
        "-vn".to_string(), // no video
        "-y".to_string(),  // overwrite output
    ];
    args.extend(codec_args);
    args.push(output_path.clone());

    log::info!("Running ffmpeg: {} {}", ffmpeg_path, args.join(" "));

    let output = Command::new(&ffmpeg_path)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "ffmpeg failed: {}",
            if stderr.is_empty() {
                "Unknown error".to_string()
            } else {
                stderr.to_string()
            }
        ));
    }

    log::info!("Audio extracted successfully: {}", output_path);

    Ok(ExtractAudioResult { audio_path: output_path })
}
