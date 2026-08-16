//! 下载子进程控制：真实暂停/恢复 + 进程树取消。
//!
//! 暂停/恢复借鉴自 yt-dlp-gui（imsyy，MIT）的 process.rs：
//! Unix 用 SIGSTOP/SIGCONT 挂起/恢复进程（不杀进程、不丢已下数据）。
//!
//! ## Trade-off（有意为之，记录于 borrow 文档）
//! - **Windows 暂停暂不实现**：v1 用 Toolhelp32 快照挂起整棵进程树的所有线程，
//!   涉及 win32 API 且需枚举子进程（yt-dlp 可能再 spawn ffmpeg），风险/收益比不佳；
//!   Windows 上 pause_download 返回友好错误，UI 禁用按钮。后续若需要再补。
//! - **进程树取消**：Unix 上用进程组（spawn 时 setsid 由 std 不支持，改为
//!   `pkill -TERM -P` 递归 + `kill -KILL` 兜底）；Windows 用 `taskkill /T /F`。
//!   防止孤儿 yt-dlp/ffmpeg（v2 的 process_guard 教训）。

use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tokio::sync::mpsc;

/// 全局子进程注册表：download_id -> pid。
static CHILDREN: Lazy<Mutex<HashMap<String, u32>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn register_child(download_id: &str, pid: u32) {
    CHILDREN.lock().unwrap().insert(download_id.to_string(), pid);
}

pub fn unregister_child(download_id: &str) {
    CHILDREN.lock().unwrap().remove(download_id);
}

pub fn child_pid(download_id: &str) -> Option<u32> {
    CHILDREN.lock().unwrap().get(download_id).copied()
}

/// 暂停（挂起）下载进程。Unix only。
#[tauri::command]
pub async fn pause_download(download_id: String) -> Result<(), String> {
    let pid = child_pid(&download_id).ok_or("下载进程不在运行")?;
    #[cfg(unix)]
    {
        nix_kill(pid, libc::SIGSTOP).map_err(|e| format!("挂起进程失败: {e}"))
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        Err("Windows 暂不支持暂停（见文档 trade-off），可先停止后重试".to_string())
    }
}

/// 恢复（继续）下载进程。Unix only。
#[tauri::command]
pub async fn resume_download(download_id: String) -> Result<(), String> {
    let pid = child_pid(&download_id).ok_or("下载进程不在运行")?;
    #[cfg(unix)]
    {
        nix_kill(pid, libc::SIGCONT).map_err(|e| format!("恢复进程失败: {e}"))
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        Err("Windows 暂不支持恢复".to_string())
    }
}

#[cfg(unix)]
fn nix_kill(pid: u32, sig: i32) -> Result<(), String> {
    let r = unsafe { libc::kill(pid as i32, sig) };
    if r == 0 { Ok(()) } else { Err(format!("kill({pid}, {sig}) = {r}")) }
}

/// 杀掉进程树（先 TERM 递归子进程，再 KILL 自身），用于取消。
/// 同时关闭其取消通道由调用方负责。
pub async fn kill_tree(download_id: String) {
    if let Some(pid) = child_pid(&download_id) {
        #[cfg(unix)]
        {
            // 递归 TERM 子进程（ffmpeg 等），再 KILL 主进程兜底
            let _ = std::process::Command::new("pkill")
                .args(["-TERM", "-P", &pid.to_string()])
                .output();
            let _ = nix_kill(pid, libc::SIGTERM);
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            let _ = nix_kill(pid, libc::SIGKILL);
        }
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }
    }
    unregister_child(&download_id);
}

/// 创建取消通道的便捷封装（queue/downloader 已有 mpsc 模式，统一语义）。
pub fn cancel_channel(buffer: usize) -> (mpsc::Sender<()>, mpsc::Receiver<()>) {
    mpsc::channel(buffer)
}
