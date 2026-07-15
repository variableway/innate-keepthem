# ContentForge ytdownload 模块重构计划

> **调研日期**: 2026-07-12  
> **调研范围**: yt-dlp-gui (imsyy), yt-dlp-gui-v2 (imsyy), Open Video Downloader (jely2002), Flux Downloader (eoNaho), vYtDL-desktop (自有项目)  
> **目标**: 为 ContentForge 桌面端设计一套生产级的 YouTube 下载模块架构

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [参考项目架构分析](#2-参考项目架构分析)
3. [核心功能拆解与对比](#3-核心功能拆解与对比)
4. [可借鉴的设计模式](#4-可借鉴的设计模式)
5. [ContentForge 适配建议](#5-contentforge-适配建议)
6. [风险与注意事项](#6-风险与注意事项)
7. [分阶段实施计划](#7-分阶段实施计划)
8. [附录：关键代码参考](#8-附录关键代码参考)

---

## 1. 执行摘要

### 1.1 一句话结论

> **推荐采用「Rust (Tauri) 编排层 + Python Sidecar 处理层」的混合架构，下载核心由 Rust 直接控制 yt-dlp 子进程，后处理（转录/分析）委托 Python Sidecar。**

### 1.2 调研结论速查

| 维度 | yt-dlp-gui (Vue) | yt-dlp-gui-v2 (egui) | vYtDL-desktop (Next.js) | **推荐方案** |
|------|:----------------:|:--------------------:|:-----------------------:|:------------:|
| **技术栈** | Tauri + Vue 3 + Rust | Rust + egui | Tauri + Next.js + Rust | Tauri + Next.js + Rust |
| **进度推送** | Tauri Event | 内部状态机 | Tauri Event | **Tauri Event + Channel** |
| **队列管理** | Pinia Store (前端) | Rust 状态机 (后端) | Rust QueueManager | **Rust QueueManager** |
| **进程控制** | Win32/kill 信号 | 无 (单线程) | kill + cancel channel | **suspend/resume/kill** |
| **持久化** | IndexedDB | SQLite | SQLite (sqlx) | **SQLite (sqlx)** |
| **进度解析** | --progress-template JSON | 自定义解析 | 正则 + JSON | **--progress-template JSON** |
| **并发控制** | 前端计数器 | 无 | 后端 max_concurrent | **后端 max_concurrent** |
| **错误恢复** | 基础重试 | 完整韧性策略 | 无 | **分级重试 + 格式回退** |

### 1.3 与 ContentForge 现有架构的契合度

ContentForge 已确定采用「混合精简方案」：

```
Desktop (Next.js + Tauri) → Rust 编排层 → Python Sidecar (处理层)
                                    ↓
                              yt-dlp / FFmpeg (externalBin)
```

ytdownload 模块恰好处于 Rust 编排层与外部二进制工具的交界点，是验证整个混合架构可行性的最佳切入点。

---

## 2. 参考项目架构分析

### 2.1 yt-dlp-gui (imsyy) — Tauri + Vue 3

**项目定位**: 功能最完整的 yt-dlp GUI 之一，Tauri v2 + Vue 3 技术栈与 ContentForge 最接近。

**架构分层**:

```
┌─────────────────────────────────────────┐
│  Frontend (Vue 3 + Pinia + Naive UI)    │
│  ├── stores/download.ts  — 任务队列管理  │
│  ├── stores/setting.ts   — 配置持久化   │
│  └── App.vue             — 托盘/深链接  │
├─────────────────────────────────────────┤
│  Tauri IPC Layer                        │
│  ├── events: download-progress          │
│  ├── events: download-log               │
│  ├── events: download-complete          │
│  └── events: download-error             │
├─────────────────────────────────────────┤
│  Rust Backend (src-tauri/src/)          │
│  ├── commands/download.rs — 下载控制    │
│  ├── commands/mod.rs      — 共享状态    │
│  ├── parser.rs            — 输出解析    │
│  ├── process.rs           — 进程控制    │
│  └── utils.rs             — 工具函数    │
├─────────────────────────────────────────┤
│  External Binaries                      │
│  ├── yt-dlp (bundled via externalBin)   │
│  └── FFmpeg (post-processing)           │
└─────────────────────────────────────────┘
```

**核心设计亮点**:

1. **--progress-template JSON 进度输出**: 使用 yt-dlp 官方推荐的 `--progress-template` 参数输出结构化 JSON，避免解析易变的 stdout 文本格式。解析器含完整单元测试。
2. **跨平台进程控制**: Windows 使用 Win32 API (`NtSuspendProcess`/`NtResumeProcess`)，Unix 使用 `SIGSTOP`/`SIGCONT`，实现真正的暂停/恢复功能。
3. **输出文件路径可靠获取**: 使用 `--print-to-file after_move:filepath` 将最终文件路径写入临时文件，避免 Windows stdout GBK 编码乱码问题。
4. **前端队列管理**: Pinia Store 维护任务列表，IndexedDB 持久化，应用重启后自动恢复并标记中断任务。

**代码规模**: Rust 后端约 3,000 行，Vue 前端约 5,000 行。

---

### 2.2 yt-dlp-gui-v2 (imsyy) — Rust + egui

**项目定位**: 同作者的 Rust 原生重写，追求零依赖、单二进制分发。

**架构特点**:

```
┌─────────────────────────────────────────┐
│  UI Layer (egui + eframe)               │
│  ├── 即时模式 GUI，无前端框架            │
│  └── 单线程 + 异步任务                   │
├─────────────────────────────────────────┤
│  Core Layer                             │
│  ├── state.rs (12,168 行) — 巨型状态机   │
│  ├── download_worker.rs — 下载工作线程   │
│  ├── download_resilience.rs — 错误恢复   │
│  └── queue_status.rs — 队列状态          │
├─────────────────────────────────────────┤
│  External                               │
│  ├── yt-dlp (用户自备)                   │
│  └── symphonia (Rust 音频播放)           │
└─────────────────────────────────────────┘
```

**核心设计亮点**:

1. **完整的错误韧性系统**: `DownloadResiliencePolicy` 定义了错误分类 (`DownloadErrorKind`) 和恢复决策矩阵：
   - `NetworkError` → 指数退避重试
   - `FormatNotAvailable` → 自动降级到次优格式
   - `RateLimited` → 增加延迟 + 切换 User-Agent
   - `GeoBlocked` → 标记失败并提示用户
2. **下载工作线程**: 每个下载任务运行在独立 Tokio 任务中，通过 `mpsc` 通道与主状态机通信。
3. **音乐播放器集成**: 使用 `symphonia` 库在应用内直接播放下载的音频，无需外部播放器。

**与 ContentForge 的关联度**: 较低。egui 技术栈与 ContentForge 的 Next.js + Tauri 差异较大，但其**错误恢复策略**和**下载工作线程模式**值得借鉴。

---

### 2.3 Open Video Downloader (jely2002)

**项目定位**: 早期 Electron + youtube-dl-gui 项目，已归档但架构有参考价值。

**架构特点**:

```
┌─────────────────────────────────────────┐
│  Frontend (Electron + vanilla JS)       │
├─────────────────────────────────────────┤
│  Node.js Backend                        │
│  ├── 直接调用 youtube-dl/yt-dlp 二进制   │
│  └── 使用 Node.js stream 解析输出        │
├─────────────────────────────────────────┤
│  youtube-dl / yt-dlp                    │
└─────────────────────────────────────────┘
```

**关键教训**:

1. **Electron 打包体积过大**: 最终产物 ~150MB+，启动慢，这是 ContentForge 选择 Tauri 的核心原因之一。
2. **Node.js 子进程管理脆弱**: 进程僵死、僵尸进程问题频发，Rust 的 `tokio::process` 更可靠。
3. **youtube-dl 到 yt-dlp 的迁移痛苦**: 硬编码的 youtube-dl 参数在新版中不兼容，抽象层设计不足。

---

### 2.4 Flux Downloader (eoNaho)

**项目定位**: 现代化 yt-dlp GUI，Tauri + React 技术栈。

**调研结论** (基于网络搜索):

- 使用 Tauri v2 + React + TypeScript
- 支持多平台 (Windows/macOS/Linux)
- 强调 UI 美观和用户体验
- 队列管理和并发下载
- 支持下载后自动转码

**借鉴点**: UI/UX 设计理念，但技术实现细节未深入调研。

---

### 2.5 vYtDL-desktop (自有项目)

**项目定位**: ContentForge 的前身/姊妹项目，技术栈完全一致。

**现有架构**:

```
┌─────────────────────────────────────────┐
│  Next.js 16 + React 19 + Tailwind v4    │
│  ├── Zustand Store (downloadStore)      │
│  ├── api-client.ts (IPC/HTTP 抽象)      │
│  └── i18n 支持 (多语言)                  │
├─────────────────────────────────────────┤
│  Tauri v2 Rust Backend                  │
│  ├── commands.rs    — IPC 命令定义       │
│  ├── queue.rs       — 队列管理器         │
│  ├── downloader.rs  — yt-dlp 包装器      │
│  ├── database.rs    — SQLite (sqlx)      │
│  └── lib.rs         — 应用初始化         │
├─────────────────────────────────────────┤
│  External                               │
│  ├── yt-dlp (externalBin / PATH)         │
│  └── FFmpeg (音频提取)                   │
└─────────────────────────────────────────┘
```

**现有功能**:

| 功能 | 状态 | 说明 |
|------|:----:|------|
| 单视频下载 | ✅ | 支持质量/格式选择 |
| 批量下载 | ✅ | 文本框输入 + 文件导入 |
| 播放列表下载 | ✅ | 自动解析条目 |
| 字幕下载 | ✅ | 多语言支持 |
| 时间裁剪 | ✅ | --download-sections |
| 队列管理 | ✅ | max_concurrent, FIFO |
| 进度推送 | ✅ | Tauri Event |
| 下载恢复 | ✅ | 启动时恢复未完成下载 |
| SQLite 持久化 | ✅ | sqlx async |
| 音频提取 | ✅ | FFmpeg 后处理 |
| VTT 分析 | ✅ | 字幕文本分析 |
| AI 摘要 | 🚧 | 占位实现 |
| 暂停/恢复 | ❌ | 仅支持取消 |
| 代理配置 | ❌ | 未实现 |
| Cookie 支持 | ❌ | 未实现 |
| SponsorBlock | ❌ | 未实现 |
| 格式回退 | ❌ | 未实现 |
| 错误重试 | ❌ | 未实现 |

---

## 3. 核心功能拆解与对比

### 3.1 下载控制

| 功能 | yt-dlp-gui | vYtDL-desktop | 推荐方案 |
|------|:----------:|:-------------:|:--------:|
| 启动下载 | `tokio::process::Command` | `tokio::process::Command` | ✅ 相同 |
| 暂停/恢复 | Win32 API / SIGSTOP | ❌ 不支持 | **引入 suspend/resume** |
| 取消下载 | `kill_process` + 删除文件 | `cancel_rx` + `child.kill()` | ✅ 相同 |
| 进程状态跟踪 | `Arc<Mutex<HashMap>>` | `HashMap<String, JoinHandle>` | **结合两者** |
| 输出文件获取 | `--print-to-file` | 正则解析 stdout | **采用 --print-to-file** |

### 3.2 进度解析

| 方案 | 实现 | 优点 | 缺点 |
|------|:----:|:----:|:----:|
| **--progress-template JSON** | yt-dlp-gui | 官方推荐，结构化，稳定 | 需 yt-dlp 较新版本 |
| 正则解析 stdout | vYtDL-desktop | 兼容旧版本 | 格式易变，脆弱 |
| 混合方案 | — | 先用 JSON，fallback 到正则 | 实现复杂 |

**推荐**: 采用 `--progress-template JSON` 为主，保留正则作为 fallback。

### 3.3 队列管理

| 维度 | yt-dlp-gui (前端) | vYtDL-desktop (后端) | 推荐 |
|------|:-----------------:|:--------------------:|:----:|
| 队列位置 | 前端计算 | SQLite `queue_position` | **后端持久化** |
| 并发控制 | Pinia `maxConcurrentDownloads` | `QueueManager` `max_concurrent` | **后端控制** |
| 状态持久化 | IndexedDB | SQLite | **SQLite** |
| 应用恢复 | 前端标记中断 | 后端重置 `downloading`→`pending` | **后端恢复** |

**关键结论**: 队列管理必须放在后端。前端仅做展示和触发，不维护队列状态。

### 3.4 错误处理

| 策略 | yt-dlp-gui | yt-dlp-gui-v2 | vYtDL-desktop | 推荐 |
|------|:----------:|:-------------:|:-------------:|:----:|
| 错误分类 | 无 | `DownloadErrorKind` 枚举 | 无 | **引入分类** |
| 自动重试 | 无 | 指数退避 (3次) | 无 | **3次指数退避** |
| 格式回退 | 无 | 自动降级 | 无 | **实现回退** |
| 网络恢复 | 无 | 延迟 + UA切换 | 无 | **实现恢复** |

---

## 4. 可借鉴的设计模式

### 4.1 Rust 后端模式

#### 模式 A: 共享状态管理 (来自 yt-dlp-gui)

```rust
// commands/mod.rs
pub type DownloadState = Arc<Mutex<HashMap<String, DownloadProcessInfo>>>;

pub struct DownloadProcessInfo {
    pub pid: u32,
    pub cancelled: bool,
    pub output_files: Vec<String>,
    pub download_dir: String,
    pub filepath_file: Option<String>,
    pub clip_duration: Option<f64>,
}

// 在 Tauri 启动时注册为 State
pub fn setup(app: &mut App) {
    app.manage(DownloadState::default());
}
```

**ContentForge 适配**: 与 vYtDL-desktop 的 `QueueManager` 结合，将 `DownloadState` 作为 `QueueManager` 的内部状态。

#### 模式 B: 异步输出读取 (来自 yt-dlp-gui)

```rust
/// 逐字节读取，同时处理 \n 和 \r（ffmpeg 进度使用 \r）
fn spawn_output_reader<R: AsyncRead + Unpin + Send + 'static>(
    app: AppHandle,
    task_id: String,
    processes: Arc<Mutex<HashMap<String, DownloadProcessInfo>>>,
    reader: R,
) {
    tokio::spawn(async move {
        let mut buf_reader = tokio::io::BufReader::new(reader);
        let mut line_buf = Vec::with_capacity(1024);
        let mut byte_buf = [0u8; 1];

        loop {
            match buf_reader.read(&mut byte_buf).await {
                Ok(0) => { /* EOF 处理 */ break; }
                Ok(_) => {
                    if byte_buf[0] == b'\n' || byte_buf[0] == b'\r' {
                        let line = String::from_utf8_lossy(&line_buf);
                        process_output_line(&app, &task_id, &processes, &line);
                        line_buf.clear();
                    } else if line_buf.len() < MAX_LINE_LEN {
                        line_buf.push(byte_buf[0]);
                    }
                }
                Err(_) => break,
            }
        }
    });
}
```

**ContentForge 适配**: 直接复用，但将 `process_output_line` 中的事件发射改为支持 Tauri v2 Channel（见下文）。

#### 模式 C: 跨平台进程控制 (来自 yt-dlp-gui)

```rust
// process.rs — Windows
#[cfg(target_os = "windows")]
pub fn suspend_process(pid: u32) -> Result<(), String> {
    use windows_sys::Win32::System::Threading::NtSuspendProcess;
    unsafe {
        let handle = OpenProcess(PROCESS_SUSPEND_RESUME, FALSE, pid);
        if handle.is_null() { return Err("...".into()); }
        let status = NtSuspendProcess(handle);
        CloseHandle(handle);
        if status != 0 { return Err("...".into()); }
    }
    Ok(())
}

// process.rs — Unix
#[cfg(not(target_os = "windows"))]
pub fn suspend_process(pid: u32) -> Result<(), String> {
    unsafe {
        if libc::kill(pid as i32, libc::SIGSTOP) != 0 {
            return Err("...".into());
        }
    }
    Ok(())
}
```

**ContentForge 适配**: 直接引入 `process.rs` 模块，为下载任务提供暂停/恢复能力。

#### 模式 D: 进度解析器 (来自 yt-dlp-gui)

```rust
// parser.rs
pub fn parse_progress_json(line: &str) -> Option<ProgressInfo> {
    let json_str = line.strip_prefix("PROGRESS_JSON:")?;
    let v: serde_json::Value = serde_json::from_str(json_str).ok()?;

    let percent_str = v["percent"].as_str().unwrap_or("0%");
    let percent: f64 = percent_str.trim().trim_end_matches('%').parse().unwrap_or(0.0);

    Some(ProgressInfo {
        percent,
        speed: clean_field(v["speed"].as_str()),
        eta: clean_field(v["eta"].as_str()),
        downloaded: clean_field(v["downloaded"].as_str()),
        total: clean_field(v["total"].as_str()),
    })
}
```

**ContentForge 适配**: 直接复用，添加更多单元测试覆盖边界情况。

---

### 4.2 前端模式

#### 模式 E: 统一 API 抽象 (ContentForge 已有)

ContentForge 的 `api-client.ts` 已提供优秀的 IPC/HTTP 统一抽象：

```typescript
// 已存在于 ContentForge
export async function apiInvoke<T>(command: string, args?: unknown): Promise<T>;
export function apiListen(event: string, handler: (payload: unknown) => void): () => void;
```

**ytdownload 扩展**: 添加下载专用的事件类型：

```typescript
// desktop/src/lib/download-events.ts
export interface DownloadProgressPayload {
  id: string;
  percent: number;
  speed: string;
  eta: string;
  downloaded: string;
  total: string;
}

export interface DownloadLogPayload {
  id: string;
  level: "info" | "error" | "warn";
  message: string;
}

export interface DownloadCompletePayload {
  id: string;
  outputFile: string;
  title: string;
}
```

#### 模式 F: Zustand Store 设计 (参考 vYtDL-desktop + ContentForge assetStore)

```typescript
// desktop/src/store/downloadStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface DownloadTask {
  id: string;
  url: string;
  title?: string;
  status: "pending" | "downloading" | "paused" | "completed" | "failed" | "cancelled";
  percent: number;
  speed: string;
  eta: string;
  outputFile?: string;
  error?: string;
  logs: string[];
  createdAt: number;
}

interface DownloadStoreState {
  tasks: DownloadTask[];
  isLoading: boolean;
  error: string | null;
}

interface DownloadStoreActions {
  addTask: (url: string, options: DownloadOptions) => Promise<string>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  retryTask: (id: string) => Promise<void>;
  removeTask: (id: string) => void;
  clearFinished: () => void;
  
  // 事件处理（内部使用）
  onProgress: (payload: DownloadProgressPayload) => void;
  onLog: (payload: DownloadLogPayload) => void;
  onComplete: (payload: DownloadCompletePayload) => void;
  onError: (payload: { id: string; error: string }) => void;
}
```

---

### 4.3 Tauri v2 Channel 流式推送 (关键技术升级)

Tauri v2 引入了 `Channel` 类型，支持从 Rust 到前端的**流式数据推送**，比 Event 更适合高频进度更新：

```rust
// Rust 端
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
struct DownloadEvent {
    id: String,
    kind: String,  // "progress", "log", "complete", "error"
    payload: serde_json::Value,
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    db: State<'_, Database>,
    queue: State<'_, QueueManager>,
    request: StartDownloadRequest,
    on_event: Channel<DownloadEvent>,  // ← Channel 参数
) -> Result<ApiResponse<String>, String> {
    // ... 创建下载记录 ...
    
    // 将 Channel 传递给下载器，用于流式推送
    queue.enqueue_with_channel(download_id.clone(), options, yt_dlp_path, on_event).await;
    
    Ok(ApiResponse::ok(download_id))
}
```

```typescript
// 前端端
import { Channel } from "@tauri-apps/api/core";

const channel = new Channel<DownloadEvent>();
channel.onmessage = (event) => {
  switch (event.kind) {
    case "progress": downloadStore.onProgress(event.payload); break;
    case "log": downloadStore.onLog(event.payload); break;
    case "complete": downloadStore.onComplete(event.payload); break;
    case "error": downloadStore.onError(event.payload); break;
  }
};

await apiInvoke("start_download", { 
  url, 
  options,
  onEvent: channel  // 将 Channel 传递给 Rust
});
```

**优势**:
- 每个下载任务有独立的 Channel，避免事件命名冲突
- 支持背压（backpressure），前端处理不过来时自动节流
- 类型安全，编译期检查事件格式

---

## 5. ContentForge 适配建议

### 5.1 模块边界划分

```
contentforge/desktop/src-tauri/src/
├── main.rs                    # 应用入口
├── lib.rs                     # 模块导出
├── commands.rs                # Tauri IPC 命令（聚合）
├── download/                  # 【新增】下载模块
│   ├── mod.rs                 # 模块导出
│   ├── commands.rs            # 下载相关 IPC 命令
│   ├── queue.rs               # 队列管理器（从 vYtDL 迁移+增强）
│   ├── worker.rs              # 下载工作线程
│   ├── downloader.rs          # yt-dlp 包装器（从 vYtDL 迁移+增强）
│   ├── parser.rs              # 输出解析器（从 yt-dlp-gui 引入）
│   ├── process.rs             # 进程控制（从 yt-dlp-gui 引入）
│   ├── resilience.rs          # 【新增】错误恢复策略
│   └── events.rs              # 事件类型定义
├── database.rs                # SQLite 数据库（从 vYtDL 迁移）
├── models.rs                  # 【新增】共享数据模型
└── sidecar/                   # Python Sidecar 通信
    └── manager.rs             # Sidecar 进程管理
```

### 5.2 与现有系统的集成

#### 与 Asset Store 集成

下载完成的视频应自动注册为 ContentForge 的 `ContentAsset`：

```rust
// download/worker.rs
async fn on_download_complete(
    db: &Database,
    asset_store: &AssetStore,  // ContentForge 资产存储
    output: DownloadOutput,
) -> Result<(), String> {
    // 1. 创建 ContentAsset 记录
    let asset = ContentAsset {
        id: uuid::Uuid::new_v4().to_string(),
        type_: AssetType::Video,
        title: output.title.clone(),
        source: AssetSource {
            platform: AssetPlatform::Youtube,
            url: output.url.clone(),
            ..Default::default()
        },
        file_path: Some(output.filename.clone()),
        status: AssetStatus::Ingested,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        ..Default::default()
    };
    
    // 2. 保存到数据库
    db.create_asset(&asset).await?;
    
    // 3. 通知前端资产更新
    asset_store.invalidate_cache();
    
    Ok(())
}
```

#### 与 Python Sidecar 集成

下载完成后，可选触发 Python 后处理：

```rust
// download/worker.rs
async fn post_process(
    sidecar: &SidecarManager,
    asset_id: &str,
    file_path: &str,
    options: PostProcessOptions,
) -> Result<(), String> {
    if options.extract_audio {
        sidecar.send_command(SidecarCommand::ExtractAudio {
            asset_id: asset_id.to_string(),
            input_path: file_path.to_string(),
            output_format: options.audio_format,
        }).await?;
    }
    
    if options.transcribe {
        sidecar.send_command(SidecarCommand::Transcribe {
            asset_id: asset_id.to_string(),
            video_path: file_path.to_string(),
            language: options.transcribe_lang,
        }).await?;
    }
    
    Ok(())
}
```

### 5.3 配置与设置

扩展现有 `Settings` 结构，添加下载相关配置：

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadSettings {
    // 基础设置
    pub yt_dlp_path: Option<String>,
    pub default_output_dir: Option<String>,
    pub default_quality: String,        // "best", "1080", "720", etc.
    pub default_format: String,         // "mp4", "webm", "mkv"
    
    // 队列设置
    pub max_concurrent_downloads: i64,  // 1-10
    pub max_retries: i64,               // 0-5
    
    // 字幕设置
    pub default_sub_langs: Vec<String>, // ["en", "zh"]
    pub write_auto_subs: bool,
    pub embed_subs: bool,
    
    // 网络设置
    pub proxy: Option<String>,
    pub cookie_browser: Option<String>, // "chrome", "firefox", etc.
    pub cookie_file: Option<String>,
    
    // 后处理设置
    pub extract_audio: bool,
    pub audio_format: String,           // "mp3", "m4a", "wav"
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,
    pub sponsorblock_remove: bool,
    
    // 高级设置
    pub concurrent_fragments: i64,      // 分片并发数
    pub limit_rate: Option<String>,     // 限速
}
```

### 5.4 前端组件设计

```
desktop/src/components/download/
├── download-panel.tsx         # 下载面板（侧边栏/弹窗）
├── download-form.tsx          # 下载表单（URL 输入 + 选项）
├── download-list.tsx          # 下载任务列表
├── download-item.tsx          # 单个下载任务卡片
├── download-progress.tsx      # 进度条组件
├── download-log-viewer.tsx    # 日志查看器
└── download-settings.tsx      # 下载设置面板
```

---

## 6. 风险与注意事项

### 6.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:----:|:----:|:---------|
| yt-dlp 版本兼容性 | 中 | 高 | 锁定版本，定期更新，抽象 yt-dlp 调用层 |
| YouTube 反爬策略变化 | 高 | 高 | 支持 Cookie/PO Token，监控 yt-dlp 更新 |
| Windows 编码问题 | 中 | 中 | 使用 `--print-to-file`，避免依赖 stdout 解析 |
| Tauri v2 Channel 稳定性 | 低 | 中 | 保留 Event fallback，渐进式迁移 |
| 跨平台进程控制差异 | 中 | 低 | 充分测试 Windows/macOS/Linux |

### 6.2 法律与合规风险

| 风险 | 说明 | 缓解措施 |
|------|------|:---------|
| YouTube ToS 违反 | YouTube 服务条款禁止未经授权下载 | 仅支持用户已授权的内容，明确免责声明 |
| 版权内容分发 | 下载的版权内容不得二次分发 | 仅限本地使用，不集成云同步 |
| 地区限制内容 | 某些内容在特定地区受限 | 支持代理配置，但由用户自行负责 |

### 6.3 已知陷阱

1. **npm proxy 环境变量污染**: npm/pnpm 设置的 `npm_config_proxy` 会干扰 Python urllib 的代理检测，导致 yt-dlp 直连超时。必须在启动 yt-dlp 前清理所有非标准 `*_proxy` 环境变量（vYtDL-desktop 已处理）。
2. **Tauri v2 Tokio 死锁**: 在 Tauri v2 的 Tokio runtime 中直接使用 `tokio::process::Command::output()` 可能导致死锁，必须使用 `tokio::task::spawn_blocking` 包装（vYtDL-desktop 已处理）。
3. **yt-dlp `n` challenge**: YouTube 的 `n` 参数挑战需要 JS 运行时（Deno/Node），必须在 bundled 或 PATH 中提供。
4. **播放列表条目过多**: 大型播放列表（1000+ 视频）可能导致内存问题，应支持分页/限制条目数。

---

## 7. 分阶段实施计划

### 7.1 总体时间线

```
Week 1-2: 基础设施搭建
Week 3-4: 核心下载功能
Week 5-6: 队列管理与错误恢复
Week 7-8: 前端集成与优化
```

### 7.2 第一阶段：基础设施（Week 1-2）

**目标**: 搭建 Rust 下载模块框架，实现基本的 yt-dlp 调用能力。

| 任务 | 输出文件 | 验收标准 |
|------|:---------|:---------|
| 创建下载模块目录结构 | `src/download/` 下所有文件 | `cargo check` 通过 |
| 引入进程控制模块 | `src/download/process.rs` | Windows/macOS/Linux 均可编译 |
| 引入进度解析模块 | `src/download/parser.rs` | 单元测试全部通过 |
| 实现 yt-dlp 路径查找 | `src/download/downloader.rs` | 支持 bundled/PATH/自定义路径 |
| 实现基础下载命令 | `src/download/commands.rs` | 可启动下载并接收 stdout |
| 配置 Tauri externalBin | `tauri.conf.json` | yt-dlp 自动捆绑 |
| 前端事件类型定义 | `src/lib/download-events.ts` | TypeScript 编译通过 |

**关键代码参考**:
- 进程控制: `yt-dlp-gui/src-tauri/src/process.rs`
- 进度解析: `yt-dlp-gui/src-tauri/src/parser.rs`
- yt-dlp 查找: `vYtDL-desktop/src-tauri/src/downloader.rs:555-632`

### 7.3 第二阶段：核心下载功能（Week 3-4）

**目标**: 实现完整的单视频下载流程，包括进度推送、日志、完成通知。

| 任务 | 输出文件 | 验收标准 |
|------|:---------|:---------|
| 实现 Channel 流式推送 | `src/download/events.rs` | 前端实时接收进度 |
| 实现下载工作线程 | `src/download/worker.rs` | 支持并发下载 |
| 实现视频信息获取 | `src/download/commands.rs` | 可获取标题/缩略图/格式 |
| 实现格式选择 | 前端组件 | 显示可用格式列表 |
| 实现字幕下载 | `src/download/downloader.rs` | 支持多语言字幕 |
| 实现时间裁剪 | `src/download/downloader.rs` | --download-sections 正常工作 |
| 前端下载表单 | `components/download/download-form.tsx` | 可提交下载任务 |
| 前端进度展示 | `components/download/download-progress.tsx` | 实时显示进度 |

**关键代码参考**:
- Channel 使用: Tauri v2 官方文档
- 工作线程: `yt-dlp-gui/src-tauri/src/commands/download.rs:140-222`
- 视频信息: `vYtDL-desktop/src-tauri/src/downloader.rs:374-409`

### 7.4 第三阶段：队列管理与错误恢复（Week 5-6）

**目标**: 实现生产级的队列管理、错误处理和恢复机制。

| 任务 | 输出文件 | 验收标准 |
|------|:---------|:---------|
| 实现队列管理器 | `src/download/queue.rs` | FIFO, max_concurrent, 持久化 |
| 实现暂停/恢复 | `src/download/process.rs` + commands | 可暂停和恢复下载 |
| 实现错误分类 | `src/download/resilience.rs` | 区分网络/格式/权限错误 |
| 实现自动重试 | `src/download/worker.rs` | 3次指数退避 |
| 实现格式回退 | `src/download/downloader.rs` | 主格式失败自动降级 |
| 实现下载恢复 | `src/download/queue.rs` | 重启后恢复未完成下载 |
| 前端队列 UI | `components/download/download-list.tsx` | 显示队列位置/状态 |

**关键代码参考**:
- 队列管理: `vYtDL-desktop/src-tauri/src/queue.rs`
- 错误恢复: `yt-dlp-gui-v2/src/app/download_resilience.rs`
- 下载恢复: `vYtDL-desktop/src-tauri/src/lib.rs` (启动时恢复逻辑)

### 7.5 第四阶段：前端集成与优化（Week 7-8）

**目标**: 完善前端体验，与 ContentForge 现有系统深度集成。

| 任务 | 输出文件 | 验收标准 |
|------|:---------|:---------|
| 实现 Zustand Download Store | `src/store/downloadStore.ts` | 状态管理完整 |
| 实现下载面板组件 | `components/download/download-panel.tsx` | 可嵌入主界面 |
| 集成 Asset Store | `src/store/assetStore.ts` | 下载完成自动注册资产 |
| 实现下载设置页面 | `app/settings/download/page.tsx` | 可配置所有选项 |
| 实现批量下载 | `components/download/batch-download.tsx` | 支持多 URL |
| 实现播放列表下载 | `components/download/playlist-download.tsx` | 可选择条目 |
| 性能优化 | 全局 | 100个任务不卡顿 |
| 跨平台测试 | CI/CD | Windows/macOS/Linux 通过 |

---

## 8. 附录：关键代码参考

### 8.1 yt-dlp 推荐参数模板

```rust
fn build_download_args(params: &DownloadParams) -> Vec<String> {
    vec![
        "--newline".to_string(),
        "--ignore-config".to_string(),
        "--color".to_string(), "never".to_string(),
        "--progress-template".to_string(),
        r#"download:PROGRESS_JSON:{"percent":"%(progress._percent_str|0%)s","speed":"%(progress._speed_str|)s","eta":"%(progress._eta_str|)s","downloaded":"%(progress._downloaded_bytes_str|)s","total":"%(progress._total_bytes_str|)s"}"#.to_string(),
        "--print-to-file".to_string(),
        "after_move:filepath".to_string(),
        filepath_file.clone(),
    ]
}
```

### 8.2 推荐的 Cargo.toml 依赖

```toml
[dependencies]
tauri = { version = "2", features = [] }
tokio = { version = "1", features = ["process", "rt-multi-thread", "sync", "time"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio", "chrono"] }
chrono = { version = "0.4", features = ["serde"] }
regex = "1"
uuid = { version = "1", features = ["v4"] }
dirs = "5"
shellexpand = "3"
glob = "0.3"

[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.52", features = ["Win32_System_Threading", "Win32_Foundation", "Win32_Security"] }
```

### 8.3 推荐的 Next.js 依赖

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.10",
    "@tauri-apps/plugin-dialog": "^2.7",
    "zustand": "^5.0",
    "lucide-react": "^0.511"
  }
}
```

### 8.4 文件引用索引

| 文件 | 路径 | 核心内容 |
|------|------|:---------|
| yt-dlp-gui 下载命令 | `yt-dlp-gui/src-tauri/src/commands/download.rs` | 完整的下载控制逻辑 |
| yt-dlp-gui 解析器 | `yt-dlp-gui/src-tauri/src/parser.rs` | 进度解析 + 单元测试 |
| yt-dlp-gui 进程控制 | `yt-dlp-gui/src-tauri/src/process.rs` | 跨平台 suspend/resume/kill |
| yt-dlp-gui 前端 Store | `yt-dlp-gui/src/stores/download.ts` | Pinia 队列管理 |
| vYtDL 队列管理 | `vYtDL-desktop/src-tauri/src/queue.rs` | Rust QueueManager |
| vYtDL 下载器 | `vYtDL-desktop/src-tauri/src/downloader.rs` | yt-dlp 包装器 |
| vYtDL 数据库 | `vYtDL-desktop/src-tauri/src/database.rs` | SQLite + sqlx |
| vYtDL IPC 命令 | `vYtDL-desktop/src-tauri/src/commands.rs` | Tauri 命令定义 |
| ContentForge API 客户端 | `contentforge/desktop/src/lib/api-client.ts` | IPC/HTTP 抽象 |
| ContentForge Asset Store | `contentforge/desktop/src/store/assetStore.ts` | Zustand 资产管理 |
| ContentForge 架构决策 | `contentforge/docs/architecture/decision.md` | 混合精简方案 |

---

> **文档版本**: v1.0  
> **最后更新**: 2026-07-12  
> **作者**: AI Agent (基于多项目调研)  
> **状态**: 待评审
