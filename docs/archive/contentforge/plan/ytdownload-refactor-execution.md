# ContentForge ytdownload 重构 — 清晰执行方案

> **日期**: 2026-07-12  
> **目标**: 从现有 Python 子进程调用重构为 Rust Tauri 原生下载模块  
> **周期**: 8 周（4 阶段 × 2 周）  
> **技术栈**: Tauri v2 + Next.js + Rust + yt-dlp Sidecar

---

## 📋 执行摘要

### 一句话结论

> **Rust Tauri 直接控制 yt-dlp 子进程，下载核心不再经过 Python，后处理（转录/分析）仍委托 Python Sidecar。**

### 核心改进

| 指标 | 当前（PythonBridge） | 重构后（Rust Tauri） | 改善 |
|------|:--------------------:|:--------------------:|:----:|
| 启动下载延迟 | ~500ms（spawn Python） | ~50ms（Rust 直接） | **10x** |
| 进度推送频率 | ~1s（JSON 序列化） | ~100ms（Tauri Channel） | **10x** |
| 暂停/恢复 | ❌ 不支持 | ✅ Win32/SIGSTOP | **新增** |
| 打包体积 | ~85-175MB（含 Python） | ~45-65MB（无 Python） | **-50%** |
| 并发下载 | 受 GIL 限制 | Tokio 原生并发 | **无上限** |

---

## 🏗️ 新架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    Desktop (Next.js + Tauri v2)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Download    │  │ Download    │  │ Download Settings       │ │
│  │ Form        │  │ List        │  │ Panel                   │ │
│  │ (URL输入)    │  │ (进度/队列)  │  │ (质量/格式/字幕)         │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘ │
│         └─────────────────┴─────────────────┘                   │
│                        │                                        │
│              ┌─────────▼──────────┐                            │
│              │  Zustand Store     │                            │
│              │  downloadStore.ts  │                            │
│              └─────────┬──────────┘                            │
│                        │ Tauri IPC / Channel                   │
└────────────────────────┼────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    Rust Tauri Backend                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  download/ 模块                                            │  │
│  │  ├── commands.rs    — IPC 命令 (start/pause/resume/cancel)│  │
│  │  ├── queue.rs       — 队列管理器 (FIFO, max_concurrent)   │  │
│  │  ├── worker.rs      — 下载工作线程 (Tokio task)           │  │
│  │  ├── downloader.rs  — yt-dlp 包装器 (子进程调用)          │  │
│  │  ├── parser.rs      — 进度解析器 (JSON template)          │  │
│  │  ├── process.rs     — 进程控制 (suspend/resume/kill)      │  │
│  │  ├── resilience.rs  — 错误恢复 (重试/回退)                │  │
│  │  └── events.rs      — 事件类型 (Channel 流式推送)         │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  database.rs  — SQLite (sqlx) 持久化                      │  │
│  │  sidecar/     — Python Sidecar 通信（后处理）              │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    External Binaries (Tauri externalBin)         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ yt-dlp      │  │ FFmpeg      │  │ Python Sidecar          │ │
│  │ (下载核心)   │  │ (音频提取)   │  │ (转录/分析/转换)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 从三个 GUI 项目借鉴的核心设计

### 借鉴 1: yt-dlp-gui (imsyy) — 进度解析 + 进程控制

```rust
// 核心借鉴：--progress-template JSON + 跨平台 suspend/resume

// 1. 进度解析（避免脆弱的 stdout 正则）
let args = vec![
    "--progress-template",
    r#"download:PROGRESS_JSON:{"percent":"%(progress._percent_str|0%)s","speed":"%(progress._speed_str|)s","eta":"%(progress._eta_str|)s"}"#,
];

// 2. 跨平台进程控制
#[cfg(target_os = "windows")]
pub fn suspend_process(pid: u32) { /* NtSuspendProcess */ }

#[cfg(not(target_os = "windows"))]
pub fn suspend_process(pid: u32) { /* SIGSTOP */ }
```

**为什么借鉴**：官方推荐的结构化进度输出，稳定可靠；进程控制是用户高频需求。

---

### 借鉴 2: Flux Downloader (eoNaho) — UI/UX + 状态管理

```typescript
// 核心借鉴：Zustand Store + 暗色主题 + 无边框窗口

// Download Store 设计
interface DownloadStore {
  tasks: DownloadTask[];
  addTask: (url: string, opts: DownloadOptions) => Promise<string>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  // 事件处理（内部）
  onProgress: (p: ProgressPayload) => void;
  onComplete: (p: CompletePayload) => void;
}
```

**为什么借鉴**：Flux 的 Dashboard 设计现代、交互流畅，与 ContentForge 的 Next.js + Tailwind 技术栈一致。

---

### 借鉴 3: yt-dlp-tauri (Chlience) — 工具链自动管理

```json
// 核心借鉴：Manifest 驱动的工具链自管理

// tools-manifest.json
{
  "tools": {
    "yt-dlp": {
      "version": "2026.06.30",
      "platforms": {
        "darwin-x86_64": {
          "url": "https://github.com/yt-dlp/yt-dlp/releases/download/...",
          "sha256": "abc123..."
        }
      }
    }
  }
}
```

**为什么借鉴**：解决 yt-dlp 版本管理痛点，自动更新、SHA-256 校验、安全可信。

---

## 🗂️ 文件结构（新增/修改）

```
contentforge/
├── desktop/
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs              # 入口（注册 download 模块）
│   │   │   ├── lib.rs               # 模块导出
│   │   │   ├── commands.rs          # IPC 命令聚合
│   │   │   ├── database.rs          # SQLite（从 vYtDL 迁移）
│   │   │   ├── models.rs            # 共享数据模型
│   │   │   ├── download/            # 【新增】下载模块
│   │   │   │   ├── mod.rs
│   │   │   │   ├── commands.rs      # IPC: start/pause/resume/cancel
│   │   │   │   ├── queue.rs         # 队列管理器
│   │   │   │   ├── worker.rs        # 下载工作线程
│   │   │   │   ├── downloader.rs    # yt-dlp 包装器
│   │   │   │   ├── parser.rs        # 进度解析器
│   │   │   │   ├── process.rs       # 进程控制
│   │   │   │   ├── resilience.rs    # 错误恢复
│   │   │   │   └── events.rs        # 事件类型
│   │   │   └── sidecar/             # Python Sidecar 通信
│   │   │       └── manager.rs
│   │   ├── Cargo.toml               # 新增依赖
│   │   └── tauri.conf.json          # 配置 externalBin
│   ├── src/
│   │   ├── store/
│   │   │   ├── downloadStore.ts     # 【新增】下载状态管理
│   │   │   └── assetStore.ts        # 下载完成自动注册资产
│   │   ├── components/download/     # 【新增】下载组件
│   │   │   ├── download-form.tsx    # URL 输入 + 选项
│   │   │   ├── download-list.tsx    # 任务列表
│   │   │   ├── download-item.tsx    # 单个任务卡片
│   │   │   ├── download-progress.tsx # 进度条
│   │   │   └── download-settings.tsx # 设置面板
│   │   ├── lib/
│   │   │   └── download-events.ts   # 【新增】下载事件类型
│   │   └── app/
│   │       └── download/
│   │           └── page.tsx         # 下载页面
│   └── package.json
│
├── cli/                             # Go CLI（不变，后续扩展）
│
└── core/python/                     # Python 核心（不变，作为 Sidecar）
    └── contentforge/
        └── ...
```

---

## 📅 8 周实施计划

### Phase 1: 基础设施（Week 1-2）

**目标**: 搭建 Rust 下载模块框架，实现基本的 yt-dlp 调用

| 天数 | 任务 | 输出 | 验收标准 |
|------|------|------|---------|
| D1-2 | 创建 `src/download/` 目录结构 | 所有 `.rs` 文件骨架 | `cargo check` 通过 |
| D3-4 | 实现 `process.rs`（跨平台进程控制） | suspend/resume/kill | Windows/macOS/Linux 编译通过 |
| D5-6 | 实现 `parser.rs`（进度解析） | JSON template 解析 | 单元测试通过 |
| D7-8 | 实现 `downloader.rs`（yt-dlp 包装） | 路径查找 + 参数构建 | 可启动下载并接收 stdout |
| D9-10 | 配置 Tauri `externalBin` | `tauri.conf.json` | yt-dlp 自动捆绑到安装包 |

**关键代码参考**:
- `yt-dlp-gui/src-tauri/src/process.rs` — 进程控制
- `yt-dlp-gui/src-tauri/src/parser.rs` — 进度解析

---

### Phase 2: 核心下载（Week 3-4）

**目标**: 实现完整的单视频下载流程，包括进度推送、日志、完成通知

| 天数 | 任务 | 输出 | 验收标准 |
|------|------|------|---------|
| D11-12 | 实现 Tauri v2 Channel 流式推送 | `events.rs` + `commands.rs` | 前端实时接收进度 |
| D13-14 | 实现 `worker.rs`（下载工作线程） | Tokio task 并发 | 支持同时下载 3 个视频 |
| D15-16 | 实现视频信息获取 | `--dump-json` 解析 | 显示标题/缩略图/格式 |
| D17-18 | 前端下载表单 | `download-form.tsx` | 可提交下载任务 |
| D19-20 | 前端进度展示 | `download-progress.tsx` | 实时进度条 + 速度/ETA |

**关键技术**: Tauri v2 Channel（替代 Event，支持背压）

```rust
#[tauri::command]
pub async fn start_download(
    request: StartDownloadRequest,
    on_event: Channel<DownloadEvent>,  // ← 流式推送
) -> Result<String, String> {
    // ... 启动下载，通过 on_event 推送进度
}
```

---

### Phase 3: 队列与恢复（Week 5-6）

**目标**: 生产级队列管理、错误处理和恢复机制

| 天数 | 任务 | 输出 | 验收标准 |
|------|------|------|---------|
| D21-22 | 实现 `queue.rs`（队列管理器） | FIFO + max_concurrent + SQLite | 队列位置持久化 |
| D23-24 | 实现暂停/恢复 | `process.rs` + commands | 可暂停和恢复下载 |
| D25-26 | 实现错误恢复 | `resilience.rs` | 3次指数退避 + 格式回退 |
| D27-28 | 实现下载恢复 | `lib.rs` 启动逻辑 | 重启后恢复未完成下载 |

**关键设计**: 错误分类与恢复策略

```rust
enum DownloadErrorKind {
    NetworkError,      // → 指数退避重试
    FormatNotAvailable, // → 自动降级到次优格式
    RateLimited,       // → 增加延迟 + 切换 UA
    GeoBlocked,        // → 标记失败并提示用户
}
```

---

### Phase 4: 前端集成（Week 7-8）

**目标**: 完善前端体验，与 ContentForge 现有系统深度集成

| 天数 | 任务 | 输出 | 验收标准 |
|------|------|------|---------|
| D29-30 | Zustand Download Store | `downloadStore.ts` | 状态管理完整 |
| D31-32 | 下载列表 UI | `download-list.tsx` | 显示队列/状态/操作 |
| D33-34 | 集成 Asset Store | `assetStore.ts` 修改 | 下载完成自动注册资产 |
| D35-36 | 批量/播放列表下载 | `batch-download.tsx` | 支持多 URL |
| D37-38 | 设置面板 | `download-settings.tsx` | 可配置所有选项 |
| D39-40 | 跨平台测试 + 优化 | CI/CD | Windows/macOS/Linux 通过 |

**集成点**: 下载完成 → 自动触发 Python Sidecar 转录/分析

```rust
// worker.rs
async fn on_download_complete(...) {
    // 1. 注册为 ContentAsset
    db.create_asset(&asset).await?;
    
    // 2. 可选：触发 Python Sidecar 后处理
    if options.transcribe {
        sidecar.send_command(SidecarCommand::Transcribe { ... }).await?;
    }
    
    // 3. 通知前端
    on_event.send(DownloadEvent::Complete { ... });
}
```

---

## 🔧 关键技术决策

### 决策 1: 进度推送 — Tauri Channel vs Event

| 方案 | 优点 | 缺点 | 选择 |
|------|:----:|:----:|:----:|
| Tauri Event | 简单、文档多 | 无背压、命名冲突 | ❌ |
| **Tauri Channel** | 背压、类型安全、独立通道 | 较新、文档少 | ✅ |

### 决策 2: 进度解析 — JSON Template vs 正则

| 方案 | 优点 | 缺点 | 选择 |
|------|:----:|:----:|:----:|
| **--progress-template JSON** | 官方推荐、结构化、稳定 | 需 yt-dlp 较新版本 | ✅ 主方案 |
| 正则解析 stdout | 兼容旧版本 | 格式易变、脆弱 | ✅ fallback |

### 决策 3: 队列位置 — 前端 vs 后端

| 方案 | 优点 | 缺点 | 选择 |
|------|:----:|:----:|:----:|
| 前端计算 | 简单 | 刷新丢失、多窗口冲突 | ❌ |
| **后端持久化** | 可靠、恢复支持 | 稍复杂 | ✅ |

---

## ⚠️ 已知陷阱与规避

| 陷阱 | 来源 | 规避方法 |
|------|------|---------|
| npm proxy 污染 Python urllib | vYtDL-desktop | 启动 yt-dlp 前清理 `*_proxy` 环境变量 |
| Tokio 死锁（Tauri v2） | vYtDL-desktop | 使用 `tokio::task::spawn_blocking` 包装 |
| YouTube `n` challenge | yt-dlp 已知问题 | bundled Deno/Node 或 PATH 提供 JS 运行时 |
| Windows stdout GBK 乱码 | yt-dlp-gui | 使用 `--print-to-file` 获取文件路径 |
| 播放列表条目过多 | 已知问题 | 支持分页/限制条目数 |

---

## 📊 与现有系统的集成

```
┌─────────────────────────────────────────────────────────────┐
│                    集成关系图                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ytdownload (Rust) ──→ database.rs ──→ SQLite              │
│       │                                                     │
│       ├── 下载完成 ──→ assetStore.ts ──→ ContentAsset       │
│       │                                                     │
│       ├── 需要转录 ──→ sidecar/manager.rs ──→ Python        │
│       │                                                     │
│       └── 需要分析 ──→ sidecar/manager.rs ──→ Python        │
│                                                             │
│  chatStore.ts ──→ 可查询下载状态/历史                        │
│       ↑                                                     │
│  AI Chat ──→ "帮我下载这个视频" ──→ downloadStore.ts        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 生成的文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| **本执行方案** | `docs/plan/ytdownload-refactor-execution.md` | 本文档 |
| 详细重构计划 | `docs/plan/ytdownload-refactor.md` | 879 行技术报告 |
| Open Video Downloader 调研 | `docs/research/gui-open-video-downloader.md` | 1,033 行 |
| Flux Downloader 调研 | `docs/research/gui-flux-downloader.md` | 完整 UI/UX 分析 |
| yt-dlp-tauri 调研 | `docs/research/gui-yt-dlp-tauri.md` | 工具链管理方案 |

---

> **下一步**: 开始 Phase 1 — 搭建 `src/download/` 目录结构，实现 `process.rs` 和 `parser.rs`。
