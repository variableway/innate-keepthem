use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct AgentCliDetection {
    pub id: String,
    pub label: String,
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: String,
    pub config: Option<KimiConfigStatus>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfigCheck {
    pub id: String,
    pub label: String,
    pub ok: bool,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KimiConfigStatus {
    pub status: String,
    pub ready: bool,
    pub config_dir: Option<String>,
    pub config_toml_path: Option<String>,
    pub tui_toml_path: Option<String>,
    pub credentials_path: Option<String>,
    pub default_model: Option<String>,
    pub authenticated: bool,
    pub token_expired: bool,
    pub token_expires_at: Option<String>,
    pub skills_count: u32,
    pub project_skills_exists: bool,
    pub project_skills_path: Option<String>,
    pub checks: Vec<ConfigCheck>,
}

#[derive(Debug, Serialize)]
pub struct DetectAgentCliResult {
    pub kimi: AgentCliDetection,
    pub other: AgentCliDetection,
}

fn find_in_path(names: &[&str]) -> Option<String> {
    for name in names {
        if let Some(path) = find_executable(name) {
            return Some(path);
        }
    }
    None
}

fn find_executable(name: &str) -> Option<String> {
    let path_var = std::env::var("PATH").unwrap_or_default();
    for dir in path_var.split(std::path::MAIN_SEPARATOR) {
        let candidate = Path::new(dir).join(name);
        if candidate.is_file() {
            return candidate.to_str().map(|s| s.to_string());
        }
        #[cfg(windows)]
        {
            let candidate = Path::new(dir).join(format!("{name}.exe"));
            if candidate.is_file() {
                return candidate.to_str().map(|s| s.to_string());
            }
        }
    }
    None
}

fn known_kimi_bin_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".kimi-code").join("bin").join("kimi"));
        paths.push(home.join(".kimi").join("bin").join("kimi"));
        paths.push(home.join(".local").join("bin").join("kimi-cli"));
        paths.push(home.join(".local").join("bin").join("kimi"));
    }
    paths
}

fn resolve_kimi_binary(configured: Option<&str>) -> AgentCliDetection {
    if let Some(path) = configured.filter(|p| !p.trim().is_empty()) {
        let path = path.trim().to_string();
        let exists = Path::new(&path).is_file();
        let version = if exists { detect_version(&path) } else { None };
        let mut detection = AgentCliDetection {
            id: "kimi".to_string(),
            label: "Kimi CLI".to_string(),
            found: exists,
            path: Some(path.clone()),
            version,
            source: if exists {
                "configured".to_string()
            } else {
                "configured_missing".to_string()
            },
            config: None,
        };
        if exists {
            detection.config = Some(inspect_kimi_config(Some(&path)));
        }
        return detection;
    }

    for candidate in known_kimi_bin_paths() {
        if candidate.is_file() {
            let path = candidate.to_string_lossy().to_string();
            let version = detect_version(&path);
            let mut detection = AgentCliDetection {
                id: "kimi".to_string(),
                label: "Kimi CLI".to_string(),
                found: true,
                path: Some(path.clone()),
                version,
                source: "local_install".to_string(),
                config: None,
            };
            detection.config = Some(inspect_kimi_config(Some(&path)));
            return detection;
        }
    }

    if let Some(path) = find_in_path(&["kimi", "kimi-cli", "kimi-code"]) {
        let version = detect_version(&path);
        let mut detection = AgentCliDetection {
            id: "kimi".to_string(),
            label: "Kimi CLI".to_string(),
            found: true,
            path: Some(path.clone()),
            version,
            source: "path".to_string(),
            config: None,
        };
        detection.config = Some(inspect_kimi_config(Some(&path)));
        return detection;
    }

    AgentCliDetection {
        id: "kimi".to_string(),
        label: "Kimi CLI".to_string(),
        found: false,
        path: None,
        version: None,
        source: "not_found".to_string(),
        config: Some(inspect_kimi_config(None)),
    }
}

fn resolve_other_binary(configured: Option<&str>) -> AgentCliDetection {
    if let Some(path) = configured.filter(|p| !p.trim().is_empty()) {
        let path = path.trim().to_string();
        let exists = Path::new(&path).is_file();
        return AgentCliDetection {
            id: "other".to_string(),
            label: "Other".to_string(),
            found: exists,
            path: Some(path),
            version: None,
            source: if exists {
                "configured".to_string()
            } else {
                "configured_missing".to_string()
            },
            config: None,
        };
    }

    AgentCliDetection {
        id: "other".to_string(),
        label: "Other".to_string(),
        found: false,
        path: None,
        version: None,
        source: "disabled".to_string(),
        config: None,
    }
}

fn detect_version(bin_path: &str) -> Option<String> {
    for args in [["--version"], ["version"], ["-V"], ["-v"]] {
        let output = Command::new(bin_path).args(args).output().ok()?;
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            let line = text.lines().next()?.trim();
            if !line.is_empty() {
                return Some(line.to_string());
            }
        }
    }
    None
}

fn kimi_config_root() -> Option<PathBuf> {
    if let Some(home) = dirs::home_dir() {
        let modern = home.join(".kimi-code");
        if modern.join("config.toml").is_file() {
            return Some(modern);
        }
        let legacy = home.join(".kimi");
        if legacy.join("config.toml").is_file() {
            return Some(legacy);
        }
        if modern.is_dir() {
            return Some(modern);
        }
    }
    None
}

fn parse_default_model(config_text: &str) -> Option<String> {
    for line in config_text.lines() {
        let line = line.trim();
        if line.starts_with("default_model") {
            if let Some((_, value)) = line.split_once('=') {
                let value = value.trim().trim_matches('"').trim_matches('\'');
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

fn read_credentials_status(credentials_path: &Path) -> (bool, bool, Option<String>) {
    let text = match std::fs::read_to_string(credentials_path) {
        Ok(t) => t,
        Err(_) => return (false, false, None),
    };

    let json: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return (false, false, None),
    };

    let has_token = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false);

    if !has_token {
        return (false, false, None);
    }

    let expires_at = json.get("expires_at").and_then(|v| {
        if let Some(n) = v.as_i64() {
            return Some(n);
        }
        v.as_str().and_then(|s| s.parse::<i64>().ok())
    });

    if let Some(exp) = expires_at {
        let expires_dt = DateTime::<Utc>::from_timestamp(exp, 0);
        let expired = expires_dt.map(|dt| dt < Utc::now()).unwrap_or(false);
        let expires_label = expires_dt.map(|dt| dt.to_rfc3339());
        return (true, expired, expires_label);
    }

    (true, false, None)
}

fn count_skills(skills_dir: &Path) -> u32 {
    std::fs::read_dir(skills_dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().is_dir() || e.path().extension().is_some())
                .count() as u32
        })
        .unwrap_or(0)
}

fn find_project_skills() -> Option<PathBuf> {
    if let Ok(root) = std::env::var("VYTDL_PROJECT_ROOT") {
        let path = PathBuf::from(root).join(".agents").join("skills");
        if path.is_dir() {
            return Some(path);
        }
    }

    if let Ok(mut cwd) = std::env::current_dir() {
        for _ in 0..8 {
            let candidate = cwd.join(".agents").join("skills");
            if candidate.is_dir() {
                return Some(candidate);
            }
            if !cwd.pop() {
                break;
            }
        }
    }

    None
}

pub fn inspect_kimi_config(bin_path: Option<&str>) -> KimiConfigStatus {
    let mut checks: Vec<ConfigCheck> = Vec::new();
    let config_root = kimi_config_root();

    let config_dir = config_root
        .as_ref()
        .map(|p| p.to_string_lossy().to_string());
    let config_toml_path = config_root
        .as_ref()
        .map(|p| p.join("config.toml"))
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().to_string());
    let tui_toml_path = config_root
        .as_ref()
        .map(|p| p.join("tui.toml"))
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().to_string());

    let config_exists = config_toml_path.is_some();
    checks.push(ConfigCheck {
        id: "config_toml".to_string(),
        label: "config.toml".to_string(),
        ok: config_exists,
        detail: config_toml_path.clone(),
    });

    let tui_exists = tui_toml_path.is_some();
    checks.push(ConfigCheck {
        id: "tui_toml".to_string(),
        label: "tui.toml".to_string(),
        ok: tui_exists,
        detail: tui_toml_path.clone(),
    });

    let default_model = config_root
        .as_ref()
        .and_then(|root| std::fs::read_to_string(root.join("config.toml")).ok())
        .and_then(|text| parse_default_model(&text));

    if let Some(model) = &default_model {
        checks.push(ConfigCheck {
            id: "default_model".to_string(),
            label: "default_model".to_string(),
            ok: true,
            detail: Some(model.clone()),
        });
    }

    let credentials_path = config_root.as_ref().and_then(|root| {
        let modern = root.join("credentials").join("kimi-code.json");
        if modern.is_file() {
            return Some(modern);
        }
        let legacy = root.join("kimi.json");
        if legacy.is_file() {
            return Some(legacy);
        }
        None
    });

    let credentials_path_str = credentials_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string());

    let (authenticated, token_expired, token_expires_at) = credentials_path
        .as_ref()
        .map(|p| read_credentials_status(p))
        .unwrap_or((false, false, None));

    checks.push(ConfigCheck {
        id: "credentials".to_string(),
        label: "credentials".to_string(),
        ok: authenticated && !token_expired,
        detail: credentials_path_str.clone(),
    });

    let bin_found = bin_path
        .map(|p| Path::new(p).is_file())
        .unwrap_or(false)
        || known_kimi_bin_paths().iter().any(|p| p.is_file());

    let bin_detail = bin_path
        .map(|s| s.to_string())
        .or_else(|| {
            known_kimi_bin_paths()
                .into_iter()
                .find(|p| p.is_file())
                .map(|p| p.to_string_lossy().to_string())
        });

    checks.push(ConfigCheck {
        id: "binary".to_string(),
        label: "kimi binary".to_string(),
        ok: bin_found,
        detail: bin_detail,
    });

    let skills_count = config_root
        .as_ref()
        .map(|root| root.join("skills"))
        .filter(|p| p.is_dir())
        .map(|p| count_skills(&p))
        .unwrap_or(0);

    if skills_count > 0 {
        checks.push(ConfigCheck {
            id: "skills".to_string(),
            label: "user skills".to_string(),
            ok: true,
            detail: Some(format!("{skills_count} items")),
        });
    }

    let project_skills = find_project_skills();
    let project_skills_exists = project_skills.is_some();
    let project_skills_path = project_skills
        .as_ref()
        .map(|p| p.to_string_lossy().to_string());

    checks.push(ConfigCheck {
        id: "project_skills".to_string(),
        label: "project skills".to_string(),
        ok: project_skills_exists,
        detail: project_skills_path.clone(),
    });

    let status = if !bin_found {
        "not_installed".to_string()
    } else if !config_exists {
        "config_missing".to_string()
    } else if !authenticated {
        "needs_login".to_string()
    } else if token_expired {
        "token_expired".to_string()
    } else {
        "ready".to_string()
    };

    let ready = status == "ready";

    KimiConfigStatus {
        status,
        ready,
        config_dir,
        config_toml_path,
        tui_toml_path,
        credentials_path: credentials_path_str,
        default_model,
        authenticated,
        token_expired,
        token_expires_at,
        skills_count,
        project_skills_exists,
        project_skills_path,
        checks,
    }
}

pub fn detect_agent_cli_tools(
    kimi_bin: Option<String>,
    other_bin: Option<String>,
) -> DetectAgentCliResult {
    DetectAgentCliResult {
        kimi: resolve_kimi_binary(kimi_bin.as_deref()),
        other: resolve_other_binary(other_bin.as_deref()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_default_model_from_sample() {
        let text = r#"default_model = "kimi-code/kimi-for-coding"
default_thinking = true"#;
        assert_eq!(
            parse_default_model(text),
            Some("kimi-code/kimi-for-coding".to_string())
        );
    }

    #[test]
    fn inspect_kimi_config_reads_local_files() {
        let status = inspect_kimi_config(None);
        // On dev machines with kimi installed this should find config
        if dirs::home_dir()
            .map(|h| h.join(".kimi-code").join("config.toml").is_file())
            .unwrap_or(false)
        {
            assert!(status.config_toml_path.is_some());
        }
    }
}
