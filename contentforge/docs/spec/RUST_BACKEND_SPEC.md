# ContentForge Rust Backend 模块 SPEC

> 版本: 0.1.0  
> 模块路径: `desktop/src-tauri/src/`  
> 语言: Rust 1.77+  
> 框架: Tauri v2.10.3

---

## 1. 模块定位

Rust Backend 是 ContentForge Desktop 的 Tauri 后端层，负责：
- 提供 Tauri IPC Commands 供前端调用
- 管理 SQLite 数据库（会话、消息、资产、下载记录）
- 执行 yt-dlp 视频下载与队列管理
- 处理 VTT 字幕分析与音频提取
- 管理 AI Agent 运行环境
- 启动时自动恢复未完成的下载任务

### 1.1 设计原则

- **State Managed**: 通过 Tauri `manage()` 注入共享状态（Database, QueueManager）
- **Async-First**: 使用 `tokio` 处理 I/O 密集型操作
- **Event-Driven**: 通过 Tauri Event 向前端推送实时进度
- **Graceful Degradation**: 数据库初始化失败时回退到内存数据库

---

## 2. 应用入口（lib.rs）

### 2.1 启动流程

```
1. 初始化 Tauri Builder
   ├── 注册插件: shell, dialog, fs, store, log
   └── setup() 回调:
       ├── 提取 bundled yt-dlp（首次运行）
       ├── 初始化数据库（三级回退）
       │   ├── app_data_dir → SQLite
       │   ├── cwd/contentforge-dev.db → SQLite
       │   └── :memory: → 内存 SQLite
       ├── 初始化 QueueManager
       │   ├── 读取 max_concurrent 设置（默认 3）
       │   └── 恢复未完成的下载任务
       └── 注册所有 IPC Commands
```

### 2.2 Bundled yt-dlp 提取

```rust
async fn extract_bundled_yt_dlp(app: &tauri::App) -> Option<PathBuf>
```

- 从 Tauri Resource 目录提取平台对应的 yt-dlp 二进制
- 支持平台: macOS (Intel/Apple Silicon), Linux, Windows (x86/arm64)
- 使用 marker 文件避免重复提取
- Unix 系统设置可执行权限 (`0o755`)

### 2.3 数据库初始化回退策略

| 优先级 | 路径 | 说明 |
|--------|------|------|
| 1 | `app_data_dir/contentforge.db` | 标准应用数据目录 |
| 2 | `cwd/contentforge-dev.db` | 开发回退 |
| 3 | `:memory:` | 内存数据库（数据不持久化） |

---

## 3. 数据库模块（db/）

### 3.1 数据库连接

```rust
pub struct Database {
    pub(crate) pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new_with_path(db_path: &Path) -> Result<Self, sqlx::Error>
    pub async fn new(app: &tauri::AppHandle) -> Result<Self, sqlx::Error>
    pub async fn new_in_memory() -> Result<Self, sqlx::Error>
    pub async fn init(&self) -> Result<(), sqlx::Error>
}
```

### 3.2 Schema 定义

#### sessions 表

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    agent_id TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'active',
    linked_task_id TEXT,
    linked_asset_ids TEXT DEFAULT '[]',
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### messages 表

```sql
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,           -- user | assistant | system | tool
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'completed',
    model TEXT,
    tokens_used TEXT,
    tool_calls TEXT,              -- JSON 数组
    tool_results TEXT,            -- JSON 数组
    selected_asset_ids TEXT,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

#### assets 表

```sql
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    asset_type TEXT NOT NULL,     -- video | article | tweet | ...
    status TEXT NOT NULL DEFAULT 'ingested',
    platform TEXT,
    url TEXT,
    file_path TEXT,
    thumbnail_url TEXT,
    description TEXT,
    extracted_text TEXT,
    summary TEXT,
    transcript TEXT,
    translated_text TEXT,
    rewritten_text TEXT,
    duration_sec REAL,
    analysis TEXT,                -- JSON
    tags TEXT DEFAULT '[]',
    pipeline_id TEXT,
    author TEXT,
    published_at TEXT,
    engagement TEXT,              -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### downloads 表

```sql
CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    progress REAL DEFAULT 0.0,
    speed TEXT,
    eta TEXT,
    output_dir TEXT,
    filename TEXT,
    subtitles TEXT DEFAULT '[]',
    error TEXT,
    queue_position INTEGER DEFAULT 0,
    options TEXT,                 -- JSON: StartDownloadRequest 序列化
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### vtt_reports 表

```sql
CREATE TABLE IF NOT EXISTS vtt_reports (
    id TEXT PRIMARY KEY,
    youtube_url TEXT NOT NULL,
    video_id TEXT,
    title TEXT,
    language TEXT,
    content TEXT NOT NULL DEFAULT '',
    cue_count INTEGER DEFAULT 0,
    duration_sec REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT
);
```

#### 其他表

| 表名 | 用途 |
|------|------|
| `settings` | 键值对设置存储 |
| `agent_switches` | Agent 切换历史记录 |
| `pipeline_runs` | 流水线执行记录 |

### 3.3 索引

```sql
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
```

---

## 4. 下载器模块（downloader.rs）

### 4.1 核心类型

```rust
#[derive(Debug, Clone, Serialize, Default)]
pub struct DownloadOptions {
    pub url: String,
    pub is_playlist: bool,
    pub quality: Option<String>,        // e.g., "720", "1080", "best"
    pub format: Option<String>,         // e.g., "mp4", "mkv"
    pub output_dir: Option<String>,
    pub sub_langs: Option<Vec<String>>,
    pub write_subs: bool,
    pub write_auto_subs: bool,
    pub start_time: Option<String>,     // HH:MM:SS
    pub end_time: Option<String>,       // HH:MM:SS
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub video_id: Option<String>,
    pub title: Option<String>,
    pub percent: f64,                   // 0.0 - 100.0
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub status: String,                 // pending | downloading | completed | failed | cancelled
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadLog {
    pub level: String,                  // info | error | warn
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadOutput {
    pub title: String,
    pub filename: String,
    pub subtitles: Vec<String>,
}
```

### 4.2 Downloader 结构

```rust
pub struct Downloader {
    options: DownloadOptions,
    _download_id: String,
    yt_dlp_path: Option<String>,
}

impl Downloader {
    pub fn new(options: DownloadOptions, download_id: String) -> Self
    pub fn with_yt_dlp_path(mut self, path: Option<String>) -> Self
    
    // 核心下载方法
    pub async fn download<F, G>(
        &self,
        mut on_progress: F,
        mut on_log: G,
        cancel_rx: &mut tokio::sync::mpsc::Receiver<()>,
    ) -> Result<DownloadOutput, String>
    where F: FnMut(DownloadProgress), G: FnMut(DownloadLog)
    
    // 视频信息查询
    pub async fn get_info(&self, url: &str) -> Result<VideoInfo, String>
    pub async fn get_formats(&self, url: &str) -> Result<Vec<FormatInfo>, String>
    pub async fn get_playlist_info(&self, url: &str) -> Result<PlaylistInfo, String>
}
```

### 4.3 yt-dlp 参数构建

| DownloadOptions 字段 | yt-dlp 参数 |
|---------------------|-------------|
| `quality` | `-f bestvideo[height<={quality}]+bestaudio/best[height<={quality}]` |
| `format` | `--merge-output-format {format}` |
| `output_dir` | `-o {output_dir}/%(title)s.%(ext)s` |
| `write_subs` | `--write-subs` |
| `write_auto_subs` | `--write-auto-subs` |
| `sub_langs` | `--sub-langs {langs}` |
| `start_time` / `end_time` | `--download-sections *{start}-{end} --force-keyframes-at-cuts` |
| `!is_playlist` | `--no-playlist` |

### 4.4 进度解析

使用正则表达式解析 yt-dlp 进度输出:

```rust
regex::Regex::new(r"\[download\]\s+([\d.]+)%.*?at\s+(\S+)\s+ETA\s+(\S+)")
```

匹配组:
1. 百分比 (`67.3`)
2. 速度 (`1.5MiB/s`)
3. ETA (`00:02:15`)

### 4.5 yt-dlp 查找策略

查找顺序:
1. `self.yt_dlp_path`（显式指定）
2. `YT_DLP_BIN` 环境变量
3. `VYTLD_BUNDLED_YT_DLP` 环境变量（Tauri 启动时设置）
4. 系统 PATH (`which yt-dlp` / `where yt-dlp`)
5. 常见安装路径（Homebrew、Chocolatey、WinGet、pip）

### 4.6 代理清理

启动 yt-dlp 前自动移除非标准代理环境变量:

```rust
const ALLOWED_PROXY_VARS: &[&str] = &[
    "HTTP_PROXY", "http_proxy",
    "HTTPS_PROXY", "https_proxy",
    "ALL_PROXY", "all_proxy",
    "NO_PROXY", "no_proxy",
    "FTP_PROXY", "ftp_proxy",
];
```

---

## 5. 队列管理器（queue.rs）

### 5.1 架构

```
QueueManager (前端句柄)
    └── mpsc::Sender<QueueCommand>
        └── run_queue() (后台 tokio task)
            ├── pending: VecDeque<PendingDownload>
            ├── active: HashMap<String, JoinHandle>
            └── cancel_txs: HashMap<String, mpsc::Sender<()>>
```

### 5.2 QueueCommand 枚举

```rust
pub enum QueueCommand {
    Enqueue { id, options, yt_dlp_path, app },
    Cancel { id },
    Finished { id },
    SetMaxConcurrent { max: usize },
}
```

### 5.3 QueueManager API

```rust
impl QueueManager {
    pub fn new(db: Database, max_concurrent: usize) -> Self
    pub async fn enqueue(&self, id, options, yt_dlp_path, app)
    pub async fn cancel(&self, id)
    pub async fn notify_finished(&self, id)
    pub async fn set_max_concurrent(&self, max)
}
```

### 5.4 调度逻辑

```rust
async fn try_start_pending(active, pending, cancel_txs, db, max_concurrent, app)
```

- 当 `active.len() < max_concurrent` 时，从 pending 队列取出任务启动
- 更新数据库状态为 `downloading`，清除 queue_position
- 发射 Tauri Event: `download:status:{id}`
- 创建独立的 `tokio::spawn` 任务执行下载
- 每个任务拥有独立的 cancel channel

### 5.5 下载任务生命周期

```
pending → downloading → completed
                  ↘→ failed
                  ↘→ cancelled
```

### 5.6 并发控制

- 默认并发数: 3
- 最大值: 10（通过 `SetMaxConcurrent` 限制）
- 最小值: 1

---

## 6. IPC Commands

### 6.1 Chat Commands

| Command | 参数 | 返回 |
|---------|------|------|
| `get_chat_sessions` | - | `{ sessions: ChatSession[] }` |
| `create_chat_session` | `{ sessionId, agentId, title }` | `{ session: ChatSession }` |
| `get_chat_history` | `{ sessionId, cursor? }` | `{ messages, hasMore, nextCursor? }` |
| `chat_send` | `{ sessionId, message, agentId?, selectedAssetIds?, streaming? }` | `{ messageId, status }` |
| `cancel_chat_stream` | `{ messageId }` | - |
| `archive_chat_session` | `{ sessionId }` | - |
| `pin_chat_session` | `{ sessionId }` | - |
| `update_chat_session_title` | `{ sessionId, title }` | - |
| `delete_chat_session` | `{ sessionId }` | - |
| `chat_retry` | `{ sessionId, messageId, message, selectedAssetIds? }` | - |
| `delete_chat_message` | `{ sessionId, messageId }` | - |
| `confirm_tool_call` | `{ messageId, callId, approved }` | - |

### 6.2 Agent Commands

| Command | 参数 | 返回 |
|---------|------|------|
| `get_agents` | - | `{ agents: AgentRole[] }` |
| `switch_agent` | `{ fromAgentId, toAgentId, triggeredBy, reason? }` | - |
| `get_quick_actions` | - | `{ actions: AgentQuickAction[] }` |
| `get_skills` | - | `{ skills: SkillDefinition[] }` |
| `execute_skill` | `{ skillId, params }` | `SkillExecutionResult` |

### 6.3 Asset Commands

| Command | 参数 | 返回 |
|---------|------|------|
| `search_assets` | `{ query?, type?, status?, tags?, limit?, offset? }` | `{ assets, total }` |
| `get_asset_detail` | `{ assetId }` | `AssetDetail` |
| `delete_asset` | `{ assetId }` | - |
| `update_asset_tags` | `{ assetId, tags }` | - |
| `add_asset_to_session` | `{ assetId, sessionId }` | - |
| `get_asset_groups` | - | `{ groups }` |

### 6.4 Download Commands（来自 vYtDL）

| Command | 参数 | 返回 |
|---------|------|------|
| `start_download` | `StartDownloadRequest` | `{ downloadId }` |
| `cancel_download` | `{ downloadId }` | - |
| `get_downloads` | `{ status?, limit?, offset? }` | `{ downloads }` |
| `get_download_by_id` | `{ downloadId }` | `DownloadRecord` |
| `delete_download` | `{ downloadId }` | - |
| `open_download_folder` | `{ downloadId? }` | - |
| `retry_download` | `{ downloadId }` | - |

### 6.5 Video Commands（来自 vYtDL）

| Command | 参数 | 返回 |
|---------|------|------|
| `get_video_info` | `{ url }` | `VideoInfo` |
| `get_video_formats` | `{ url }` | `{ formats: FormatInfo[] }` |
| `get_playlist_info` | `{ url }` | `PlaylistInfo` |

### 6.6 AI / VTT Commands（来自 vYtDL）

| Command | 参数 | 返回 |
|---------|------|------|
| `summarize_video` | `{ youtubeUrl, language? }` | `{ reportId }` |
| `extract_audio` | `{ youtubeUrl, outputFormat? }` | `{ filePath }` |
| `analyze_vtt` | `{ youtubeUrl, language? }` | `{ reportId }` |
| `get_vtt_report` | `{ reportId }` | `VTTReport` |
| `list_vtt_reports` | `{ limit?, offset? }` | `{ reports }` |
| `delete_vtt_report` | `{ reportId }` | - |
| `agent_chat_send` | `{ sessionId, message, agentId? }` | StreamEvent |
| `detect_agent_cli` | - | `{ detected: bool, path?: string }` |

---

## 7. 事件系统

### 7.1 Download Events

| Event 名称 | Payload | 触发时机 |
|-----------|---------|----------|
| `download:status:{id}` | `"downloading"` | 状态变更 |
| `download:progress:{id}` | `DownloadProgress` | 进度更新 |
| `download:log:{id}` | `DownloadLog` | 日志输出 |
| `download:complete:{id}` | `ApiResponse<DownloadOutput>` | 下载完成 |
| `download:error:{id}` | `ApiResponse<()>` | 下载失败 |

### 7.2 Chat Events

| Event 名称 | Payload | 触发时机 |
|-----------|---------|----------|
| `message.delta` | `{ messageId, delta }` | 流式消息增量 |
| `message.completed` | `{ messageId }` | 消息完成 |
| `message.failed` | `{ messageId, error }` | 消息失败 |
| `tool.call.start` | `ToolCallStartPayload` | 工具调用开始 |
| `tool.call.progress` | `ToolCallProgressPayload` | 工具调用进度 |
| `tool.call.completed` | `ToolCallCompletedPayload` | 工具调用完成 |
| `tool.call.failed` | `{ messageId, callId, error }` | 工具调用失败 |
| `agent.switched` | `AgentSwitchedPayload` | Agent 切换 |

---

## 8. 自动恢复机制

### 8.1 启动恢复流程

```rust
// lib.rs setup()
let incomplete = db.get_incomplete_downloads().await?;
for record in incomplete {
    // 1. 解析保存的 options JSON
    let options = serde_json::from_str::<StartDownloadRequest>(&record.options)
        .map(|req| DownloadOptions { ... })
        .unwrap_or_else(|| DownloadOptions { url: record.url, ... });
    
    // 2. 重置状态为 pending
    db.update_download_status(&record.id, DownloadStatus::Pending).await?;
    
    // 3. 重新入队
    queue_manager.enqueue(record.id, options, None, app_handle.clone()).await;
}
```

### 8.2 恢复状态映射

| 上次状态 | 恢复后状态 |
|----------|-----------|
| `downloading` | `pending`（重置后重新入队） |
| `pending` | `pending`（已在队列中） |

---

## 9. 依赖清单

```toml
[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
log = "0.4"
tauri = { version = "2.10.3", features = [] }
tauri-plugin-log = "2"
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-store = "2"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
regex = "1"
sqlx = { version = "0.7", features = ["runtime-tokio", "sqlite", "chrono", "macros"] }
dirs = "5"
glob = "0.3"
opener = "0.6"
shellexpand = "3"
```

---

## 10. 文件清单

```
desktop/src-tauri/src/
├── main.rs              # 入口（仅调用 lib::run()）
├── lib.rs               # 应用初始化、setup、IPC 注册
│
├── commands/            # IPC Commands 子模块
│   ├── mod.rs           # 命令聚合、ApiResponse 类型
│   ├── chat.rs          # Chat 相关命令
│   ├── agent.rs         # Agent 相关命令
│   ├── asset.rs         # Asset 相关命令
│   ├── settings.rs      # 设置命令
│   ├── download.rs      # 下载命令
│   ├── video.rs         # 视频信息命令
│   └── ai.rs            # AI / VTT 命令
│
├── db/                  # 数据库模块
│   ├── mod.rs           # Database 结构、初始化
│   ├── types.rs         # 数据库类型定义
│   ├── sessions.rs      # 会话 CRUD
│   ├── messages.rs      # 消息 CRUD
│   ├── assets.rs        # 资产 CRUD
│   ├── downloads.rs     # 下载记录 CRUD
│   ├── settings.rs      # 设置 CRUD
│   ├── agent_switches.rs# Agent 切换历史
│   └── pipeline_runs.rs # 流水线执行记录
│
├── downloader.rs        # yt-dlp 下载器封装
├── queue.rs             # 下载队列管理器
├── vtt_analysis.rs      # VTT 字幕分析
├── audio_extractor.rs   # 音频提取
├── agent_cli.rs         # AI Agent CLI 封装
├── agent_runner.rs      # Agent 运行环境
└── pipeline.rs          # Rust 端流水线执行
```
