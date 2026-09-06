//! AI agent terminal launcher.
//!
//! Opens the user's local terminal emulator (Ghostty, iTerm2, Terminal.app, …)
//! running an AI coding agent CLI (`claude`, `codex`, `kimi`) with the selected
//! LLM provider/model injected as environment variables.
//!
//! Strategy: instead of passing env vars through the terminal launcher (which
//! `open`/`osascript` cannot do reliably), we generate a small launch script
//! that contains the exports, and tell the terminal to run that script.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

// ───────────────────────────── Terminal detection ─────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AgentTerminalInfo {
    pub id: String,
    pub label: String,
    pub platform: String,
    pub found: bool,
    pub detail: Option<String>,
}

fn is_macos() -> bool {
    std::env::consts::OS == "macos"
}

fn is_windows() -> bool {
    std::env::consts::OS == "windows"
}

fn find_in_path(name: &str) -> Option<String> {
    let path_var = std::env::var("PATH").unwrap_or_default();
    for dir in path_var.split(std::path::MAIN_SEPARATOR) {
        if dir.is_empty() {
            continue;
        }
        let candidate = Path::new(dir).join(name);
        if let Some(name_ext) = windows_executable_name(name) {
            let alt = Path::new(dir).join(name_ext);
            if alt.is_file() {
                return Some(alt.to_string_lossy().to_string());
            }
        }
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    // GUI apps on macOS launch with a minimal PATH; scan common install dirs.
    for extra in extra_bin_dirs() {
        let candidate = Path::new(&extra).join(name);
        if let Some(name_ext) = windows_executable_name(name) {
            let alt = Path::new(&extra).join(name_ext);
            if alt.is_file() {
                return Some(alt.to_string_lossy().to_string());
            }
        }
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

fn windows_executable_name(name: &str) -> Option<String> {
    if is_windows() && !name.ends_with(".exe") {
        Some(format!("{name}.exe"))
    } else {
        None
    }
}

fn extra_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".npm-global").join("bin"));
        dirs.push(home.join(".cargo").join("bin"));
        dirs.push(home.join(".bun").join("bin"));
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs
}

fn macos_app_bundle(app_name: &str) -> Option<String> {
    for root in ["/Applications", "~/Applications"] {
        let root_path = if let Some(stripped) = root.strip_prefix('~') {
            dirs::home_dir()?.join(stripped.trim_start_matches('/'))
        } else {
            PathBuf::from(root)
        };
        let app = root_path.join(format!("{app_name}.app"));
        if app.is_dir() {
            return Some(app.to_string_lossy().to_string());
        }
    }
    None
}

fn macos_app_binary(app_name: &str, binary: &str) -> Option<String> {
    let bundle = macos_app_bundle(app_name)?;
    let bin = Path::new(&bundle)
        .join("Contents")
        .join("MacOS")
        .join(binary);
    if bin.is_file() {
        Some(bin.to_string_lossy().to_string())
    } else {
        None
    }
}

fn terminal_entry(id: &str, label: &str, detail: Option<String>, found: bool) -> AgentTerminalInfo {
    AgentTerminalInfo {
        id: id.to_string(),
        label: label.to_string(),
        platform: std::env::consts::OS.to_string(),
        found,
        detail,
    }
}

/// Detect terminals available on this machine, ordered by preference.
pub fn detect_terminals() -> Vec<AgentTerminalInfo> {
    let mut out = Vec::new();

    if is_macos() {
        let ghostty = macos_app_bundle("Ghostty");
        out.push(terminal_entry(
            "ghostty",
            "Ghostty",
            ghostty.clone(),
            ghostty.is_some(),
        ));
        let iterm = macos_app_bundle("iTerm");
        out.push(terminal_entry(
            "iterm",
            "iTerm 2",
            iterm.clone(),
            iterm.is_some(),
        ));
        out.push(terminal_entry("terminal", "Terminal.app", None, true));
        let alacritty = macos_app_binary("Alacritty", "alacritty").or_else(|| find_in_path("alacritty"));
        out.push(terminal_entry(
            "alacritty",
            "Alacritty",
            alacritty.clone(),
            alacritty.is_some(),
        ));
        let kitty = find_in_path("kitty");
        out.push(terminal_entry("kitty", "kitty", kitty.clone(), kitty.is_some()));
        let wezterm = find_in_path("wezterm");
        out.push(terminal_entry("wezterm", "WezTerm", wezterm.clone(), wezterm.is_some()));
    } else if is_windows() {
        let wt = find_in_path("wt.exe").or_else(|| find_in_path("wt"));
        out.push(terminal_entry("wt", "Windows Terminal", wt, true));
        out.push(terminal_entry("cmd", "Command Prompt", None, true));
    } else {
        let ghostty = find_in_path("ghostty");
        out.push(terminal_entry("ghostty", "Ghostty", ghostty.clone(), ghostty.is_some()));
        let gnome = find_in_path("gnome-terminal");
        out.push(terminal_entry(
            "gnome-terminal",
            "GNOME Terminal",
            gnome.clone(),
            gnome.is_some(),
        ));
        let konsole = find_in_path("konsole");
        out.push(terminal_entry("konsole", "Konsole", konsole.clone(), konsole.is_some()));
        let kitty = find_in_path("kitty");
        out.push(terminal_entry("kitty", "kitty", kitty.clone(), kitty.is_some()));
        let alacritty = find_in_path("alacritty");
        out.push(terminal_entry(
            "alacritty",
            "Alacritty",
            alacritty.clone(),
            alacritty.is_some(),
        ));
        let wezterm = find_in_path("wezterm");
        out.push(terminal_entry("wezterm", "WezTerm", wezterm.clone(), wezterm.is_some()));
    }

    out
}

// ───────────────────────────── Provider catalog ─────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AgentModelInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderRegion {
    pub id: String,
    pub label: String,
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentProviderInfo {
    pub id: String,
    pub label: String,
    /// "kimi" | "claude-code" | "codex"
    pub agent_cli: String,
    pub requires_api_key: bool,
    /// settings key used to persist the API key for this provider
    pub api_key_setting: Option<String>,
    /// model ids are injected verbatim; empty = use the CLI's own default
    pub models: Vec<AgentModelInfo>,
    pub regions: Vec<ProviderRegion>,
    pub hint: Option<String>,
}

fn model(id: &str, label: &str) -> AgentModelInfo {
    AgentModelInfo {
        id: id.to_string(),
        label: label.to_string(),
    }
}

fn region(id: &str, label: &str, base_url: &str) -> ProviderRegion {
    ProviderRegion {
        id: id.to_string(),
        label: label.to_string(),
        base_url: base_url.to_string(),
    }
}

/// Catalog of launchable agent + LLM provider combinations.
pub fn list_agent_providers() -> Vec<AgentProviderInfo> {
    let mut out = Vec::new();

    // ── Kimi: single fixed model, opens directly with its own login ──
    out.push(AgentProviderInfo {
        id: "moonshot-kimi".into(),
        label: "Kimi (Moonshot 官方)".into(),
        agent_cli: "kimi".into(),
        requires_api_key: false,
        api_key_setting: None,
        models: vec![model("kimi-for-coding", "kimi-for-coding（固定）")],
        regions: vec![],
        hint: Some("Kimi CLI 使用自身登录态（kimi 登录后即可使用），无需注入 API Key。".into()),
    });

    // ── Claude Code ──
    out.push(AgentProviderInfo {
        id: "anthropic".into(),
        label: "Anthropic 官方".into(),
        agent_cli: "claude-code".into(),
        requires_api_key: false,
        api_key_setting: None,
        models: vec![],
        regions: vec![],
        hint: Some("使用 Anthropic 账号订阅；首次启动后在 CLI 内执行 /login 登录。".into()),
    });
    out.push(AgentProviderInfo {
        id: "glm".into(),
        label: "智谱 GLM".into(),
        agent_cli: "claude-code".into(),
        requires_api_key: true,
        api_key_setting: Some("agent_glm_api_key".into()),
        models: vec![
            model("glm-5.3", "glm-5.3（旗舰）"),
            model("glm-5.3-flash", "glm-5.3-flash（快速）"),
            model("glm-5.3[1m]", "glm-5.3[1m]（1M 上下文）"),
            model("glm-4.6", "glm-4.6（兼容）"),
        ],
        regions: vec![region(
            "default",
            "默认",
            "https://open.bigmodel.cn/api/anthropic",
        )],
        hint: Some("API Key 来自 open.bigmodel.cn 的 GLM Coding Plan。".into()),
    });
    out.push(AgentProviderInfo {
        id: "minimax".into(),
        label: "MiniMax".into(),
        agent_cli: "claude-code".into(),
        requires_api_key: true,
        api_key_setting: Some("agent_minimax_api_key".into()),
        models: vec![
            model("MiniMax-M3", "MiniMax-M3"),
            model("MiniMax-M3[1m]", "MiniMax-M3[1m]（1M 上下文）"),
            model("MiniMax-M2.1", "MiniMax-M2.1（兼容）"),
        ],
        regions: vec![
            region("china", "中国区", "https://api.minimax.cn/anthropic"),
            region("global", "国际区", "https://api.minimax.io/anthropic"),
        ],
        hint: Some("API Key 来自 MiniMax 开放平台 Token 管理页。".into()),
    });

    // ── Codex ──
    out.push(AgentProviderInfo {
        id: "openai".into(),
        label: "OpenAI 官方".into(),
        agent_cli: "codex".into(),
        requires_api_key: false,
        api_key_setting: None,
        models: vec![],
        regions: vec![],
        hint: Some("使用 ChatGPT 账号登录（codex 内 login），无需注入 API Key。".into()),
    });
    out.push(AgentProviderInfo {
        id: "glm".into(),
        label: "智谱 GLM".into(),
        agent_cli: "codex".into(),
        requires_api_key: true,
        api_key_setting: Some("agent_glm_api_key".into()),
        models: vec![
            model("glm-5.3", "glm-5.3（旗舰）"),
            model("glm-5-turbo", "glm-5-turbo（Agent 优化）"),
            model("glm-4.6", "glm-4.6（兼容）"),
        ],
        regions: vec![region("default", "默认", "https://open.bigmodel.cn/api/v1")],
        hint: Some("使用 GLM Coding Plan 的 OpenAI Responses 协议端点。".into()),
    });
    out.push(AgentProviderInfo {
        id: "minimax".into(),
        label: "MiniMax".into(),
        agent_cli: "codex".into(),
        requires_api_key: true,
        api_key_setting: Some("agent_minimax_api_key".into()),
        models: vec![
            model("MiniMax-M3", "MiniMax-M3"),
            model("MiniMax-M2.1", "MiniMax-M2.1（兼容）"),
        ],
        regions: vec![
            region("china", "中国区", "https://api.minimax.cn/v1"),
            region("global", "国际区", "https://api.minimax.io/v1"),
        ],
        hint: Some("使用 MiniMax M 系列模型的 Responses 协议端点。".into()),
    });

    out
}

// ───────────────────────────── Agent CLI detection ─────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AgentCliToolInfo {
    pub id: String,
    pub label: String,
    /// the command name the launch script should exec
    pub command: String,
    pub found: bool,
    pub path: Option<String>,
    pub source: String,
}

fn detect_cli(id: &str, label: &str, command: &str, extra_dirs: Vec<PathBuf>) -> AgentCliToolInfo {
    for dir in extra_dirs {
        let name = windows_executable_name(command).unwrap_or_else(|| command.to_string());
        let candidate = dir.join(name);
        if candidate.is_file() {
            return AgentCliToolInfo {
                id: id.into(),
                label: label.into(),
                command: command.into(),
                found: true,
                path: Some(candidate.to_string_lossy().to_string()),
                source: "local_install".into(),
            };
        }
    }
    if let Some(path) = find_in_path(command) {
        return AgentCliToolInfo {
            id: id.into(),
            label: label.into(),
            command: command.into(),
            found: true,
            path: Some(path),
            source: "path".into(),
        };
    }
    AgentCliToolInfo {
        id: id.into(),
        label: label.into(),
        command: command.into(),
        found: false,
        path: None,
        source: "not_found".into(),
    }
}

/// Detect agent CLIs (kimi / claude / codex) visible to the app.
pub fn detect_agent_clis() -> Vec<AgentCliToolInfo> {
    let mut out = Vec::new();

    let kimi = crate::agent_cli::detect_agent_cli_tools(None, None).kimi;
    out.push(AgentCliToolInfo {
        id: "kimi".into(),
        label: "Kimi CLI".into(),
        command: "kimi".into(),
        found: kimi.found,
        path: kimi.path,
        source: kimi.source,
    });

    let mut claude_dirs: Vec<PathBuf> = extra_bin_dirs();
    if let Some(home) = dirs::home_dir() {
        claude_dirs.push(home.join(".claude").join("local"));
    }
    out.push(detect_cli("claude-code", "Claude Code", "claude", claude_dirs));

    let mut codex_dirs: Vec<PathBuf> = extra_bin_dirs();
    if let Some(home) = dirs::home_dir() {
        codex_dirs.push(home.join(".codex").join("bin"));
    }
    out.push(detect_cli("codex", "Codex CLI", "codex", codex_dirs));

    out
}

// ───────────────────────────── Launch ─────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LaunchAgentTerminalRequest {
    pub terminal_id: String,
    /// "kimi" | "claude-code" | "codex"
    pub agent_cli: String,
    pub provider_id: String,
    pub region: Option<String>,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub workdir: Option<String>,
    /// explicit CLI binary resolved by the frontend (detection result)
    pub cli_bin: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LaunchAgentTerminalResult {
    pub terminal_label: String,
    pub script_path: String,
    pub command_line: String,
    pub env_summary: Vec<String>,
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn toml_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn sessions_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".vytdl")
        .join("agent-sessions")
}

/// env exports injected into the launch script for claude-code compatible providers.
fn claude_code_env(base_url: &str, api_key: &str, model: &str) -> Vec<(String, String)> {
    let mut env = vec![
        ("ANTHROPIC_BASE_URL".to_string(), base_url.to_string()),
        ("ANTHROPIC_AUTH_TOKEN".to_string(), api_key.to_string()),
        ("ANTHROPIC_MODEL".to_string(), model.to_string()),
        (
            "ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(),
            model.to_string(),
        ),
        (
            "ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(),
            model.to_string(),
        ),
        (
            "ANTHROPIC_DEFAULT_OPUS_MODEL".to_string(),
            model.to_string(),
        ),
    ];
    if model.contains("[1m]") {
        env.push((
            "CLAUDE_CODE_AUTO_COMPACT_WINDOW".to_string(),
            "1000000".to_string(),
        ));
    }
    env
}

fn agent_command(agent_cli: &str) -> &str {
    match agent_cli {
        "kimi" => "kimi",
        "codex" => "codex",
        _ => "claude",
    }
}

fn agent_label(agent_cli: &str) -> &str {
    match agent_cli {
        "kimi" => "Kimi CLI",
        "codex" => "Codex CLI",
        _ => "Claude Code",
    }
}

/// Write the generated codex home (config.toml) for third-party providers and
/// return the CODEX_HOME path.
fn write_codex_home(session_dir: &Path, provider: &AgentProviderInfo, base_url: &str, api_key: &str, model: &str) -> Result<PathBuf, String> {
    let codex_home = session_dir.join("codex-home");
    std::fs::create_dir_all(&codex_home).map_err(|e| format!("Failed to create CODEX_HOME: {e}"))?;
    let config = format!(
        "# Generated by vYtDL Desktop — agent terminal session\n\
         model = \"{}\"\n\
         model_provider = \"vytdl\"\n\
         \n\
         [model_providers.vytdl]\n\
         name = \"{}\"\n\
         base_url = \"{}\"\n\
         experimental_bearer_token = \"{}\"\n\
         wire_api = \"responses\"\n",
        toml_escape(model),
        toml_escape(&provider.label),
        toml_escape(base_url),
        toml_escape(api_key),
    );
    std::fs::write(codex_home.join("config.toml"), config)
        .map_err(|e| format!("Failed to write codex config.toml: {e}"))?;
    Ok(codex_home)
}

fn build_unix_script(
    req: &LaunchAgentTerminalRequest,
    provider: &AgentProviderInfo,
    base_url: Option<&str>,
    codex_home: Option<&Path>,
) -> String {
    let mut env: Vec<(String, String)> = Vec::new();
    let model = req.model.clone().unwrap_or_default();

    if req.agent_cli == "claude-code" && base_url.is_some() {
        let key = req.api_key.clone().unwrap_or_default();
        if !key.is_empty() && !model.is_empty() {
            env.extend(claude_code_env(base_url.unwrap(), &key, &model));
        }
    }
    if let Some(home) = codex_home {
        env.push((
            "CODEX_HOME".to_string(),
            home.to_string_lossy().to_string(),
        ));
    }

    let command = agent_command(&req.agent_cli);
    let workdir = req
        .workdir
        .clone()
        .filter(|w| !w.trim().is_empty())
        .unwrap_or_else(|| dirs::home_dir().map(|h| h.to_string_lossy().to_string()).unwrap_or_default());

    let mut script = String::new();
    script.push_str("#!/bin/sh\n");
    script.push_str("# Generated by vYtDL Desktop — AI agent terminal launcher\n");
    script.push_str(&format!(
        "# agent: {} | provider: {} | model: {}\n",
        req.agent_cli, provider.id, model
    ));
    // GUI-launched terminals often lack the user's shell PATH; bootstrap it so
    // claude/codex/kimi installed via npm/homebrew/cargo resolve correctly.
    script.push_str(
        "export PATH=\"$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.cargo/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH\"\n",
    );
    for (key, value) in &env {
        script.push_str(&format!("export {}={}\n", key, shell_quote(value)));
    }
    script.push_str(&format!("cd {} 2>/dev/null || cd \"$HOME\"\n", shell_quote(&workdir)));
    script.push_str(&format!(
        "echo \"vYtDL: launching {} ({})\"\n",
        agent_label(&req.agent_cli),
        provider.label
    ));
    script.push_str(&format!("if command -v {command} >/dev/null 2>&1; then\n  exec {command}\nfi\n"));
    if let Some(bin) = req.cli_bin.as_ref().filter(|b| !b.trim().is_empty()) {
        script.push_str(&format!("if [ -x {} ]; then\n  exec {}\nfi\n", shell_quote(bin), shell_quote(bin)));
    }
    script.push_str(&format!(
        "echo \"vYtDL: '{command}' not found in PATH. Install it or set the binary path in Settings.\"\n"
    ));
    script.push_str("exec \"$SHELL\" -l\n");
    script
}

fn build_windows_script(
    req: &LaunchAgentTerminalRequest,
    provider: &AgentProviderInfo,
    base_url: Option<&str>,
    codex_home: Option<&Path>,
) -> String {
    let model = req.model.clone().unwrap_or_default();
    let mut env: Vec<(String, String)> = Vec::new();

    if req.agent_cli == "claude-code" && base_url.is_some() {
        let key = req.api_key.clone().unwrap_or_default();
        if !key.is_empty() && !model.is_empty() {
            env.extend(claude_code_env(base_url.unwrap(), &key, &model));
        }
    }
    if let Some(home) = codex_home {
        env.push((
            "CODEX_HOME".to_string(),
            home.to_string_lossy().to_string(),
        ));
    }

    let command = agent_command(&req.agent_cli);
    let workdir = req
        .workdir
        .clone()
        .filter(|w| !w.trim().is_empty())
        .unwrap_or_else(|| "%USERPROFILE%".to_string());

    let mut script = String::new();
    script.push_str("@echo off\r\n");
    script.push_str("REM Generated by vYtDL Desktop — AI agent terminal launcher\r\n");
    for (key, value) in &env {
        script.push_str(&format!("set \"{}={}\"\r\n", key, value.replace('"', "")));
    }
    script.push_str(&format!("cd /d \"{}\"\r\n", workdir.replace('"', "")));
    script.push_str(&format!(
        "echo vYtDL: launching {} ({})\r\n",
        agent_label(&req.agent_cli),
        provider.label
    ));
    script.push_str(&format!("where {command} >nul 2>nul\r\n"));
    script.push_str(&format!("if %errorlevel%==0 (\r\n  {command}\r\n) else (\r\n  echo vYtDL: '{command}' not found in PATH.\r\n)\r\n"));
    script.push_str("cmd /k\r\n");
    script
}

fn apple_script_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Build the process command that opens the chosen terminal running `script`.
fn terminal_launch_command(
    terminal: &AgentTerminalInfo,
    script_path: &str,
) -> Result<(std::process::Command, String), String> {
    Ok(match terminal.id.as_str() {
        "ghostty" if is_macos() => {
            let mut command = std::process::Command::new("/usr/bin/open");
            command.args(["-na", "Ghostty", "--args", "-e", script_path]);
            (command, format!("open -na Ghostty --args -e {script_path}"))
        }
        "ghostty" => {
            let bin = terminal.detail.clone().unwrap_or_else(|| "ghostty".to_string());
            let mut command = std::process::Command::new(&bin);
            command.args(["-e", script_path]);
            (command, format!("{bin} -e {script_path}"))
        }
        "iterm" => {
            let script = apple_script_escape(script_path);
            let src = format!(
                "tell application \"iTerm\" to activate\ntell application \"iTerm\" to create window with default profile command \"{}\"",
                script
            );
            let mut command = std::process::Command::new("/usr/bin/osascript");
            command.arg("-e").arg(&src);
            (command, format!("osascript (iTerm: create window with command {script_path})"))
        }
        "terminal" => {
            let script = apple_script_escape(script_path);
            let src = format!(
                "tell application \"Terminal\" to activate\ntell application \"Terminal\" to do script \"{}\"",
                script
            );
            let mut command = std::process::Command::new("/usr/bin/osascript");
            command.arg("-e").arg(&src);
            (command, format!("osascript (Terminal: do script {script_path})"))
        }
        "alacritty" => {
            let bin = terminal.detail.clone().unwrap_or_else(|| "alacritty".to_string());
            let mut command = std::process::Command::new(&bin);
            command.args(["-e", script_path]);
            (command, format!("{bin} -e {script_path}"))
        }
        "kitty" => {
            let bin = terminal.detail.clone().unwrap_or_else(|| "kitty".to_string());
            let mut command = std::process::Command::new(&bin);
            command.arg(script_path);
            (command, format!("{bin} {script_path}"))
        }
        "wezterm" => {
            let bin = terminal.detail.clone().unwrap_or_else(|| "wezterm".to_string());
            let mut command = std::process::Command::new(&bin);
            command.args(["start", "--", script_path]);
            (command, format!("{bin} start -- {script_path}"))
        }
        "gnome-terminal" => {
            let mut command = std::process::Command::new("gnome-terminal");
            command.arg("--").arg(script_path);
            (command, format!("gnome-terminal -- {script_path}"))
        }
        "konsole" => {
            let mut command = std::process::Command::new("konsole");
            command.args(["-e", script_path]);
            (command, format!("konsole -e {script_path}"))
        }
        "wt" => {
            let mut command = std::process::Command::new("cmd");
            command.args(["/c", "start", "", "wt.exe", "cmd", "/k", script_path]);
            (command, format!("wt.exe cmd /k {script_path}"))
        }
        "cmd" => {
            let mut command = std::process::Command::new("cmd");
            command.args(["/c", "start", "", "cmd", "/k", script_path]);
            (command, format!("start cmd /k {script_path}"))
        }
        other => return Err(format!("Unknown terminal: {other}")),
    })
}

pub fn launch_agent_terminal(
    req: LaunchAgentTerminalRequest,
) -> Result<LaunchAgentTerminalResult, String> {
    // Resolve terminal
    let terminals = detect_terminals();
    let terminal = terminals
        .iter()
        .find(|t| t.id == req.terminal_id)
        .ok_or_else(|| format!("Unknown terminal: {}", req.terminal_id))?
        .clone();
    if !terminal.found {
        return Err(format!("Terminal '{}' is not installed on this machine", terminal.label));
    }

    // Resolve provider
    let providers = list_agent_providers();
    let provider = providers
        .iter()
        .find(|p| p.agent_cli == req.agent_cli && p.id == req.provider_id)
        .ok_or_else(|| {
            format!(
                "Unknown provider '{}' for agent '{}'",
                req.provider_id, req.agent_cli
            )
        })?
        .clone();

    let api_key = req.api_key.clone().unwrap_or_default();
    if provider.requires_api_key && api_key.trim().is_empty() {
        return Err(format!("Provider '{}' requires an API key", provider.label));
    }

    // Resolve region → base_url
    let base_url = if provider.regions.is_empty() {
        None
    } else {
        let region_id = req
            .region
            .clone()
            .or_else(|| provider.regions.first().map(|r| r.id.clone()))
            .unwrap_or_default();
        let region = provider
            .regions
            .iter()
            .find(|r| r.id == region_id)
            .or_else(|| provider.regions.first())
            .ok_or("Provider has no region")?;
        Some(region.base_url.clone())
    };

    // Codex third-party providers run with a session-scoped CODEX_HOME so we
    // never touch the user's own ~/.codex.
    let session_dir = sessions_root().join(Uuid::new_v4().to_string());
    std::fs::create_dir_all(&session_dir).map_err(|e| format!("Failed to create session dir: {e}"))?;

    let codex_home = if req.agent_cli == "codex" && base_url.is_some() {
        let model = req.model.clone().unwrap_or_default();
        Some(write_codex_home(
            &session_dir,
            &provider,
            base_url.as_deref().unwrap(),
            &api_key,
            &model,
        )?)
    } else {
        None
    };

    // Write launch script
    let script_path = if is_windows() {
        let path = session_dir.join("launch.cmd");
        let script = build_windows_script(&req, &provider, base_url.as_deref(), codex_home.as_deref());
        std::fs::write(&path, script).map_err(|e| format!("Failed to write launch script: {e}"))?;
        path
    } else {
        let path = session_dir.join("launch.sh");
        let script = build_unix_script(&req, &provider, base_url.as_deref(), codex_home.as_deref());
        std::fs::write(&path, script).map_err(|e| format!("Failed to write launch script: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("Failed to chmod launch script: {e}"))?;
        }
        path
    };

    let script_path_str = script_path.to_string_lossy().to_string();

    // Open the terminal
    let (mut command, line) = terminal_launch_command(&terminal, &script_path_str)?;
    command
        .spawn()
        .map_err(|e| format!("Failed to open terminal '{}': {e}", terminal.label))?;

    // Human-readable env summary (never include the raw API key)
    let mut env_summary = Vec::new();
    if let Some(url) = &base_url {
        env_summary.push(format!("BASE_URL = {url}"));
    }
    if let Some(model) = req.model.as_ref().filter(|m| !m.is_empty()) {
        env_summary.push(format!("MODEL = {model}"));
    }
    if codex_home.is_some() {
        env_summary.push("CODEX_HOME = <session dir>".to_string());
    }
    if env_summary.is_empty() {
        env_summary.push("no injection (CLI own auth)".to_string());
    }

    Ok(LaunchAgentTerminalResult {
        terminal_label: terminal.label,
        script_path: script_path_str,
        command_line: line,
        env_summary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn providers_catalog_is_consistent() {
        let providers = list_agent_providers();
        assert!(providers.iter().any(|p| p.agent_cli == "kimi"));
        assert!(providers
            .iter()
            .any(|p| p.agent_cli == "claude-code" && p.id == "glm"));
        assert!(providers
            .iter()
            .any(|p| p.agent_cli == "codex" && p.id == "minimax"));
        // kimi must be direct-open (no key, single model)
        let kimi = providers.iter().find(|p| p.agent_cli == "kimi").unwrap();
        assert!(!kimi.requires_api_key);
        assert_eq!(kimi.models.len(), 1);
    }

    #[test]
    fn unix_script_quotes_values() {
        let req = LaunchAgentTerminalRequest {
            terminal_id: "ghostty".into(),
            agent_cli: "claude-code".into(),
            provider_id: "glm".into(),
            region: None,
            model: Some("glm-5.3".into()),
            api_key: Some("sk-test'123".into()),
            workdir: Some("/tmp/dir with space".into()),
            cli_bin: None,
        };
        let providers = list_agent_providers();
        let provider = providers
            .iter()
            .find(|p| p.agent_cli == "claude-code" && p.id == "glm")
            .unwrap();
        let script = build_unix_script(
            &req,
            provider,
            provider.regions.first().map(|r| r.base_url.as_str()),
            None,
        );
        assert!(script.contains("export ANTHROPIC_BASE_URL='https://open.bigmodel.cn/api/anthropic'"));
        assert!(script.contains("'\\''")); // single quote escaped
        assert!(script.contains("exec claude"));
        assert!(script.contains("exec \"$SHELL\" -l"));
    }

    #[test]
    fn codex_config_contains_provider() {
        let providers = list_agent_providers();
        let provider = providers
            .iter()
            .find(|p| p.agent_cli == "codex" && p.id == "glm")
            .unwrap()
            .clone();
        let dir = std::env::temp_dir().join(format!("vytdl-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let home = write_codex_home(&dir, &provider, "https://open.bigmodel.cn/api/v1", "sk-key", "glm-5.3").unwrap();
        let config = std::fs::read_to_string(home.join("config.toml")).unwrap();
        assert!(config.contains("model = \"glm-5.3\""));
        assert!(config.contains("wire_api = \"responses\""));
        assert!(config.contains("experimental_bearer_token = \"sk-key\""));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
