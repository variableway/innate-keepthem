//! Cookie 支持：四种模式 -> yt-dlp 参数。
//!
//! 借鉴自 yt-dlp-gui（imsyy，MIT）的四模式设计与 yt-dlp-gui-v2 的校验思路。
//!
//! ## 安全 trade-off（记录于 borrow 文档）
//! - "文本粘贴"模式会把 Netscape 文本落盘到 app_data/cookies-{hash}.txt 明文保存
//!   （yt-dlp 只接受文件）；偏好安全的用户应使用"浏览器"或"文件"模式并自行管理文件。
//! - 与 v2 的 per-site 自动选 cookie（sites.yaml）暂不实现：当前主场景单一站点居多，
//!   引入站点索引的复杂度先不划算（列入 STATUS 后续项）。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case", tag = "mode")]
pub enum CookieConfig {
    #[default]
    None,
    /// 粘贴 Netscape 文本（运行前落盘为临时文件）
    Text { content: String },
    /// 本地 cookies.txt 文件路径
    File { path: String },
    /// 从浏览器读取（--cookies-from-browser）
    Browser { browser: String },
}

impl CookieConfig {
    /// 生成 yt-dlp 参数。app_data_dir 用于 Text 模式落盘。
    pub fn to_args(&self, app_data_dir: Option<&std::path::Path>) -> Result<Vec<String>, String> {
        match self {
            CookieConfig::None => Ok(vec![]),
            CookieConfig::Text { content } => {
                let dir = app_data_dir.ok_or("Cookie 文本模式需要 app_data 目录")?;
                std::fs::create_dir_all(dir).map_err(|e| format!("创建 app_data 失败: {e}"))?;
                let file = cookie_file_path(dir);
                std::fs::write(&file, content).map_err(|e| format!("写入 cookie 文件失败: {e}"))?;
                Ok(vec!["--cookies".into(), file.to_string_lossy().into()])
            }
            CookieConfig::File { path } => {
                if path.trim().is_empty() {
                    return Err("Cookie 模式为“文件”但未配置路径".into());
                }
                Ok(vec!["--cookies".into(), path.clone()])
            }
            CookieConfig::Browser { browser } => {
                if browser.trim().is_empty() {
                    return Err("Cookie 模式为“浏览器”但未选择浏览器".into());
                }
                Ok(vec!["--cookies-from-browser".into(), browser.clone()])
            }
        }
    }
}

fn cookie_file_path(app_data: &std::path::Path) -> PathBuf {
    app_data.join("cookies-vytdl.txt")
}

/// 前端下拉用的浏览器列表（与 yt-dlp --cookies-from-browser 支持一致）。
pub const SUPPORTED_BROWSERS: &[&str] = &[
    "chrome", "firefox", "edge", "brave", "chromium", "opera", "safari", "vivaldi", "whale",
];
