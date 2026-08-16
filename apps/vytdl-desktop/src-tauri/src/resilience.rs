//! 下载韧性与错误分类引擎。
//!
//! 借鉴自 yt-dlp-gui-v2（kannagi0303，MIT）的 download_resilience.rs，
//! 按本仓库结构调整并精简：错误分类 + 恢复决策 + 格式回退选择器。
//! 纯函数、无 UI/状态依赖，可单测。
//!
//! 设计 trade-off（相对 v2 原版）：
//! - 保留 11 类分类与 5 种恢复决策的语义，但去掉 v2 的 RecoveryStep 事件流
//!   （本仓库失败信息直接进 SQLite downloads.error 与前端事件，不需要独立事件类型）。
//! - 分类顺序与 v2 一致并有测试锁定：如 "403 + Sign in" 判为鉴权而非网络。

use serde::{Deserialize, Serialize};

/// 错误类别（按分类优先级排列，越靠前越先匹配）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadErrorKind {
    Cancelled,
    ToolMissing,
    CookieInvalid,
    AuthRequired,
    RateLimited,
    FormatUnavailable,
    ThumbnailPostProcess,
    MetadataPostProcess,
    FragmentFailure,
    TransientNetwork,
    Fatal,
}

impl DownloadErrorKind {
    /// 用户可读的失败原因（中文，前端徽章直接用）。
    pub fn label(&self) -> &'static str {
        match self {
            DownloadErrorKind::Cancelled => "已取消",
            DownloadErrorKind::ToolMissing => "缺少工具（yt-dlp / FFmpeg）",
            DownloadErrorKind::CookieInvalid => "Cookie 失效",
            DownloadErrorKind::AuthRequired => "需要登录 / Cookie",
            DownloadErrorKind::RateLimited => "被限流（429）",
            DownloadErrorKind::FormatUnavailable => "所选格式不可用",
            DownloadErrorKind::ThumbnailPostProcess => "缩略图后处理失败",
            DownloadErrorKind::MetadataPostProcess => "元数据后处理失败",
            DownloadErrorKind::FragmentFailure => "分片下载失败",
            DownloadErrorKind::TransientNetwork => "网络瞬断",
            DownloadErrorKind::Fatal => "致命错误",
        }
    }

    /// 可操作的修复提示。
    pub fn hint(&self) -> &'static str {
        match self {
            DownloadErrorKind::Cancelled => "",
            DownloadErrorKind::ToolMissing => "请在设置中检查 yt-dlp / FFmpeg 路径，或运行依赖安装",
            DownloadErrorKind::CookieInvalid => "Cookie 已过期：请在设置中更换 cookies.txt 或重新从浏览器导出",
            DownloadErrorKind::AuthRequired => "该视频需要登录：设置 -> 网络与访问 -> 配置 Cookie 后重试",
            DownloadErrorKind::RateLimited => "触发限流：等待几分钟后重试；频繁出现可配置代理或 PO Token",
            DownloadErrorKind::FormatUnavailable => "换一个格式重试，或开启“格式不可用自动回退”",
            DownloadErrorKind::ThumbnailPostProcess => "已自动降级：可在设置中关闭缩略图嵌入",
            DownloadErrorKind::MetadataPostProcess => "主文件已保留；可在设置中关闭元数据嵌入",
            DownloadErrorKind::FragmentFailure => "网络不稳：重试，或降低并发分片数",
            DownloadErrorKind::TransientNetwork => "直接重试通常可恢复",
            DownloadErrorKind::Fatal => "查看日志定位；常见为站点改版，更新 yt-dlp 可解决",
        }
    }
}

/// 恢复决策。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    /// 无需恢复（用户取消）。
    None,
    /// 仅报告，不自动重试（对站点友好：鉴权/限流类）。
    ReportOnly,
    /// 用修正后的参数重试一次（返回重试理由与回退格式选择器）。
    RetryWithFallback { reason: String, format_selector: Option<String> },
}

/// 回退格式选择器（与 v2 download_worker.rs 对齐）。
pub const FALLBACK_SELECTOR_NORMAL: &str = "bestvideo*+bestaudio/best";
pub const FALLBACK_SELECTOR_VIDEO_ONLY: &str = "bestvideo*[vcodec!=none]/bestvideo/best[vcodec!=none]/best";
pub const FALLBACK_SELECTOR_AUDIO: &str = "bestaudio/best[acodec!=none]";
/// 章节/时间裁剪专用的 muxed 安全选择器（Dash 流直下会卡进度，见 borrow 文档坑知识 #1）。
pub const SECTION_SAFE_SELECTOR: &str =
    "best[protocol!*=dash][vcodec!=none][acodec!=none]/best[protocol!*=dash]/best";

/// 从 yt-dlp stdout + stderr 文本分类错误。
/// 顺序即优先级；有测试锁定，调整前先读注释。
pub fn classify_download_error(stdout: &str, stderr: &str, cancelled: bool) -> DownloadErrorKind {
    let combined = format!("{}\n{}", stdout, stderr);
    let c = combined.to_lowercase();

    if cancelled {
        return DownloadErrorKind::Cancelled;
    }
    if c.contains("ffmpeg is not installed") || c.contains("ffprobe is not installed") || c.contains("no such file") && c.contains("yt-dlp") {
        return DownloadErrorKind::ToolMissing;
    }
    // Cookie 失效 vs 需要登录：二者都涉及鉴权，但修复动作不同
    if c.contains("cookies") && (c.contains("expired") || c.contains("invalid")) {
        return DownloadErrorKind::CookieInvalid;
    }
    if c.contains("sign in") || c.contains("login") || c.contains("age-restricted")
        || c.contains("members-only") || c.contains("members only") || c.contains("private video")
        || (c.contains("403") && (c.contains("sign") || c.contains("login")))
    {
        // 坑知识 #9：403+Sign in 判鉴权，不判网络
        return DownloadErrorKind::AuthRequired;
    }
    if c.contains("429") || c.contains("too many requests") {
        return DownloadErrorKind::RateLimited;
    }
    if c.contains("requested format is not available") || c.contains("no video formats") {
        return DownloadErrorKind::FormatUnavailable;
    }
    if c.contains("thumbnail") && (c.contains("postprocessing") || c.contains("embed")) {
        return DownloadErrorKind::ThumbnailPostProcess;
    }
    if c.contains("metadata") && c.contains("postprocessing") {
        return DownloadErrorKind::MetadataPostProcess;
    }
    if c.contains("fragment") || c.contains("unable to download") && c.contains("dash") {
        return DownloadErrorKind::FragmentFailure;
    }
    if c.contains("timed out") || c.contains("connection reset") || c.contains("network")
        || c.contains("unable to connect") || c.contains("temporary failure")
    {
        return DownloadErrorKind::TransientNetwork;
    }
    DownloadErrorKind::Fatal
}

/// 恢复决策（每种类别一种，策略与 v2 对齐并注释理由）。
pub fn decide_recovery(kind: DownloadErrorKind, main_file_exists: bool) -> RecoveryAction {
    match kind {
        DownloadErrorKind::Cancelled => RecoveryAction::None,
        // 缩略图失败：去缩略图重试一次（参数修正由调用方应用）
        DownloadErrorKind::ThumbnailPostProcess => RecoveryAction::RetryWithFallback {
            reason: "关闭缩略图嵌入后重试".to_string(),
            format_selector: None,
        },
        // 元数据后处理失败但主文件在：不算失败，保留文件
        DownloadErrorKind::MetadataPostProcess if main_file_exists => RecoveryAction::ReportOnly,
        // 格式不可用：回退到安全选择器重试一次
        DownloadErrorKind::FormatUnavailable => RecoveryAction::RetryWithFallback {
            reason: "回退到安全格式选择器".to_string(),
            format_selector: Some(FALLBACK_SELECTOR_NORMAL.to_string()),
        },
        // 鉴权/限流/Cookie：不自动重试（对站点友好，也避免放大限流）
        DownloadErrorKind::AuthRequired | DownloadErrorKind::RateLimited | DownloadErrorKind::CookieInvalid => {
            RecoveryAction::ReportOnly
        }
        // 网络瞬断：直接重试（不带参数修正）
        DownloadErrorKind::TransientNetwork => RecoveryAction::RetryWithFallback {
            reason: "网络瞬断，重试".to_string(),
            format_selector: None,
        },
        _ => RecoveryAction::ReportOnly,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_beats_network_for_403_signin() {
        let k = classify_download_error("", "HTTP Error 403: Forbidden; please sign in", false);
        assert_eq!(k, DownloadErrorKind::AuthRequired);
    }

    #[test]
    fn rate_limit_detected() {
        assert_eq!(
            classify_download_error("", "HTTP Error 429: Too Many Requests", false),
            DownloadErrorKind::RateLimited
        );
    }

    #[test]
    fn format_unavailable_falls_back() {
        let k = classify_download_error("", "ERROR: requested format is not available", false);
        assert_eq!(k, DownloadErrorKind::FormatUnavailable);
        match decide_recovery(k, false) {
            RecoveryAction::RetryWithFallback { format_selector, .. } => {
                assert_eq!(format_selector.as_deref(), Some(FALLBACK_SELECTOR_NORMAL))
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn auth_never_auto_retries() {
        let k = DownloadErrorKind::AuthRequired;
        assert_eq!(decide_recovery(k, false), RecoveryAction::ReportOnly);
        assert_eq!(decide_recovery(DownloadErrorKind::RateLimited, false), RecoveryAction::ReportOnly);
    }

    #[test]
    fn cancelled_wins() {
        assert_eq!(
            classify_download_error("HTTP Error 429", "", true),
            DownloadErrorKind::Cancelled
        );
    }

    #[test]
    fn thumbnail_retry_but_metadata_keeps_file() {
        assert!(matches!(
            decide_recovery(DownloadErrorKind::ThumbnailPostProcess, false),
            RecoveryAction::RetryWithFallback { .. }
        ));
        assert_eq!(
            decide_recovery(DownloadErrorKind::MetadataPostProcess, true),
            RecoveryAction::ReportOnly
        );
    }

    #[test]
    fn cookie_expired_classified() {
        assert_eq!(
            classify_download_error("", "ERROR: cookies expired", false),
            DownloadErrorKind::CookieInvalid
        );
    }
}

/// 进度辅助：CSV 速度字节数 -> 人类可读（如 "2.5 MiB/s"）。
pub fn human_bytes_speed(raw: &str) -> Option<String> {
    let v: f64 = raw.trim().parse().ok()?;
    if v <= 0.0 {
        return None;
    }
    const UNITS: [&str; 5] = ["B/s", "KiB/s", "MiB/s", "GiB/s", "TiB/s"];
    let mut val = v;
    let mut idx = 0usize;
    while val >= 1024.0 && idx < UNITS.len() - 1 {
        val /= 1024.0;
        idx += 1;
    }
    Some(format!("{:.1} {}", val, UNITS[idx]))
}
