# yt-dlp-tauri (Chlience/yt-dlp-tauri) 深度调研报告

> **调研目标**：分析 yt-dlp-tauri 的工具链管理、Cookie 认证、设置面板、中英双语、操作日志等核心设计，提取可借鉴的模式，为 ContentForge Desktop 提供架构参考。
>
> **项目地址**：https://github.com/Chlience/yt-dlp-tauri
> **技术栈**：Tauri 2 + Rust + Vanilla TypeScript + Vite
> **调研日期**：2026-07-06

---

## 1. 项目架构分析

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Vanilla TS)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  main.ts    │  │ App.tsx     │  │  toolchain.ts       │  │
│  │  (入口)      │  │ (UI 逻辑)    │  │  (工具链状态聚合)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ update-check│  │ release-notes│  │  thumbnail.ts       │  │
│  │ (GitHub API)│  │ (更新说明)   │  │  (缩略图候选)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Tauri IPC Bridge                        │
│              invoke() / listen() 命令与事件通道               │
├─────────────────────────────────────────────────────────────┤
│                      Rust Backend (lib.rs)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 工具链管理   │  │ 下载引擎     │  │  Cookie 处理         │  │
│  │ (install/   │  │ (yt-dlp     │  │  (Netscape/Header)   │  │
│  │  update/    │  │  subprocess)│  │                     │  │
│  │  verify)    │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 状态持久化   │  │ 操作日志     │  │  GitHub Release     │  │
│  │ (文件系统)   │  │ (app.log)   │  │  (更新检查)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 技术选型决策

| 层级 | 选择 | 说明 |
|------|------|------|
| Desktop Runtime | Tauri 2 | 轻量、安全、跨平台 |
| Backend | Rust | 高性能、类型安全、工具链管理 |
| Frontend | Vanilla TypeScript + Vite | 无框架依赖，构建产物极小 |
| UI Style | Fixed-size product-style | 固定窗口（1180×740），不可缩放 |
| HTTP Client | reqwest (blocking) | Rust 侧下载工具链，带重试机制 |
| Installer | Windows NSIS / macOS DMG | Tauri 原生打包 |

**关键洞察**：选择 Vanilla TS 而非 React/Vue，是因为该应用 UI 逻辑相对简单（单页面、状态有限），避免了框架运行时开销，打包体积更小。这对 ContentForge 有参考价值——如果 Desktop 端某些模块功能单一，可考虑降低框架复杂度。

---

## 2. 核心功能拆解

### 2.1 工具链管理方案（重点提取）

这是 yt-dlp-tauri 最具借鉴价值的设计。其核心思想是：**应用自管理外部二进制工具的生命周期，而非依赖系统环境或用户手动安装**。

#### 2.1.1 Manifest 驱动的设计

```json
// src-tauri/tools-manifest.json（节选）
{
  "schemaVersion": 2,
  "retrievedAtUtc": "2026-07-06T07:25:54.471Z",
  "targets": [
    {
      "target": "win-x64",
      "tools": [
        {
          "name": "yt-dlp",
          "path": "Tools/win-x64/yt-dlp/yt-dlp.exe",
          "sourceUrl": "https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe",
          "version": "2026.07.04",
          "sha256": "52fe3c26dcf71fbdc85b528589020bb0b8e383155cfa81b64dd447bbe35e24b8",
          "kind": "file"
        },
        {
          "name": "ffmpeg",
          "path": "Tools/win-x64/ffmpeg/bin/ffmpeg.exe",
          "sourceUrl": "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/.../ffmpeg-....zip",
          "version": "N-125157-gefa8b20987-20260622",
          "sha256": "7fc6c326d1b77022edbd8a539336da00a78da43a165bacdf0050cd7ae3d326f3",
          "kind": "zip",
          "archivePathSuffix": "bin/ffmpeg.exe"
        }
      ]
    }
  ]
}
```

**Manifest 设计要点**：

| 字段 | 用途 |
|------|------|
| `schemaVersion` | 版本兼容性检查（当前 v2） |
| `target` | 平台标识（`win-x64`/`macos-x64`/`macos-arm64`） |
| `kind` | `file`（直接下载）或 `zip`（解压提取） |
| `archivePathSuffix` | ZIP 内文件的相对路径，用于精准提取 |
| `sha256` | 下载后完整性校验 |
| `licenseNotes` | 合规声明 |

#### 2.1.2 工具发现与定位策略（Rust 侧）

```rust
// lib.rs: locate_tools() —— 多级回退的优雅设计
fn locate_tools(app: &AppHandle) -> Result<ToolPaths, String> {
    let target = current_tool_target()?;  // 如 "win-x64"
    let names = tool_names_for_target(&target)?;  // 平台二进制名映射
    
    let mut roots = Vec::new();
    
    // 优先级 1: 用户数据目录（可写，用于安装/更新）
    if let Ok(root) = writable_tools_root(&target) {
        roots.push(root);  // %LOCALAPPDATA%/yt-dlp-tauri/Tools/win-x64
    }
    
    // 优先级 2: Tauri 资源目录（打包时嵌入）
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join(TOOLS_DIRECTORY).join(&target));
    }
    
    // 优先级 3: 可执行文件同级目录
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.join(TOOLS_DIRECTORY).join(&target));
        }
    }
    
    // 优先级 4: 编译时 manifest 目录（开发模式）
    roots.push(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(TOOLS_DIRECTORY).join(&target));
    
    // 优先级 5: 当前工作目录（开发模式兼容）
    if let Ok(current_dir) = env::current_dir() {
        roots.push(current_dir.join("src-tauri").join(TOOLS_DIRECTORY).join(&target));
        roots.push(current_dir.join(TOOLS_DIRECTORY).join(&target));
    }
    
    // 选择第一个存在 yt-dlp 的目录
    let root = roots.into_iter()
        .find(|root| root.join("yt-dlp").join(names.yt_dlp).exists())
        .unwrap_or_else(|| writable_tools_root(&target).unwrap_or_else(|_| ...));
    
    Ok(ToolPaths { yt_dlp: ..., ffmpeg: ..., ... })
}
```

**设计精髓**：
1. **多级回退**：从用户数据 → 资源目录 → 可执行目录 → 开发目录，覆盖安装/开发/调试全场景
2. **平台抽象**：`tool_names_for_target()` 统一处理 Windows(`.exe`) 与 Unix(无后缀) 差异
3. **环境变量覆盖**：`YT_DLP_TOOL_TARGET` 允许强制指定目标平台，便于测试

#### 2.1.3 工具安装与更新流程

```
用户点击 "Install/Update Tools"
    ↓
Rust: install_manifest_tools()
    ├── 读取当前 target 的 manifest
    ├── 按 kind 分组：file 直接下载，zip 合并同 sourceUrl 的组
    ├── 逐个/逐组下载（带进度事件）
    │   ├── download_source_to_file() —— 流式下载 + Content-Length 进度
    │   ├── 3 次自动重试（408/429/5xx 触发重试）
    │   └── 下载完成 → SHA-256 校验
    ├── ZIP 组解压（PowerShell Expand-Archive / unzip）
    ├── 按 archivePathSuffix 提取指定文件
    ├── 标记可执行权限（Unix chmod 755）
    └── 保存 active manifest 到用户数据目录
    ↓
前端监听 tool-install-progress 事件更新 UI
    ↓
安装完成 → probe_manifest_tools() 验证 → 更新按钮状态
```

**关键代码片段——带重试的流式下载**：

```rust
fn download_source_to_file(
    app: &AppHandle,
    source_url: &str,
    destination: &Path,
    status: &str,
    tool_name: &str,
) -> Result<(), String> {
    let client = build_tool_download_client(tool_name)?;
    
    for attempt in 1..=TOOL_DOWNLOAD_MAX_ATTEMPTS {
        match download_source_to_file_once(...) {
            Ok(()) => return Ok(()),
            Err(error) if should_retry_tool_download(&error, attempt) => {
                remove_partial_download(destination);
                //  emit retry progress...
            }
            Err(error) => return Err(error.message),
        }
    }
    Err(format!("Failed to download {tool_name}"))
}

fn build_tool_download_client(tool_name: &str) -> Result<reqwest::blocking::Client, String> {
    install_rustls_crypto_provider();
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(30 * 60))  // 30 分钟大文件超时
        .user_agent(format!("yt-dlp-tauri/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(...)
}
```

#### 2.1.4 工具状态机与前端聚合

Rust 侧返回每个工具的详细状态：

```rust
struct ToolStatus {
    name: String,
    relative_path: String,
    full_path: String,
    availability: String,  // "available" | "missing" | "cannot_execute" | "outdated"
    version: Option<String>,
    expected_version: Option<String>,
    error: Option<String>,
}
```

前端 `toolchain.ts` 聚合为可操作的摘要：

```typescript
export function summarizeTools(tools: ToolStatus[], mode: ToolSummaryMode): ToolSummary {
  const hasMissing = tools.some((t) => t.availability === "missing");
  const hasAttention = tools.some((t) => t.availability === "outdated" || t.availability === "cannot_execute");
  const ready = tools.length > 0 && tools.every((t) => t.availability === "available");

  if (ready) {
    return { ready: true, action: null, settingsKey: "settings.toolsAvailable", ... };
  }
  if (hasMissing) {
    return { ready: false, action: "install", ... };  // 显示 "Install tools"
  }
  if (hasAttention && mode === "remote") {
    return { ready: false, action: "update", ... };   // 显示 "Update tools"
  }
  if (hasAttention) {
    return { ready: false, action: "reinstall", ... }; // 显示 "Reinstall tools"
  }
}
```

**按钮动态映射**：
- `action: "install"` → 主按钮显示 "Install tools"
- `action: "update"` → 主按钮显示 "Update tools"
- `action: "reinstall"` → 主按钮显示 "Reinstall tools"
- `action: null` → 隐藏安装按钮，只保留 "Verify" 和 "Check updates"

#### 2.1.5 远程 Manifest 更新检查

```
用户点击 "Check tool updates"
    ↓
Rust: fetch_latest_tool_manifest(github_access_mode)
    ├── 请求 GitHub API: /repos/Chlience/yt-dlp-tauri/releases/latest
    ├── 从 release assets 中找到 tools-manifest.json 的下载 URL
    ├── 下载最新的 manifest
    └── 返回 { status: "available", manifestJson: "..." }
    ↓
前端: check_tools_with_manifest(manifestJson)
    ├── 用远程 manifest 探测本地工具
    └── 对比 SHA-256 → 发现 outdated
    ↓
用户点击 "Update tools" → install_tools_from_manifest(manifestJson)
    └── 使用远程 manifest 安装 → 保存为 active manifest
```

**GitHub 访问路由**：支持 `Direct` 和 `gh-proxy` 两种模式，解决国内访问 GitHub 的问题。

#### 2.1.6 开发辅助脚本

```powershell
# scripts/download-tools.ps1 —— 开发环境一键恢复工具链
# 功能：根据 manifest 下载 win-x64 工具到 src-tauri/Tools/win-x64/
# 与 Rust 侧安装逻辑保持一致（同样的 URL 和 SHA-256）
```

---

### 2.2 Cookie 认证方案

#### 2.2.1 双模式支持

| 模式 | 格式 | 示例 |
|------|------|------|
| Netscape cookies.txt | 标准文本文件 | `# Netscape HTTP Cookie File`... |
| 浏览器 Cookie Header | 单行字符串 | `Cookie: a=b; c=d` 或 `a=b; c=d` |

#### 2.2.2 Rust 侧处理逻辑

```rust
// PreparedCookiesFile: RAII 临时文件管理
struct PreparedCookiesFile {
    path: PathBuf,
    temporary: bool,  // Header 模式会创建临时文件
}

impl Drop for PreparedCookiesFile {
    fn drop(&mut self) {
        if self.temporary {
            let _ = fs::remove_file(&self.path);  // 自动清理
        }
    }
}

fn prepared_cookies_file_for_url(url: &str) -> Result<Option<PreparedCookiesFile>, String> {
    // 1. 检查用户选择的 Cookie 文件
    // 2. 如果是 Header 格式 → 写入临时 Netscape 文件
    // 3. 返回路径供 yt-dlp --cookies 使用
}

// yt-dlp 调用时注入 Cookie 参数
fn yt_dlp_cookie_args(cookies_path: Option<&Path>) -> Vec<String> {
    match cookies_path {
        Some(path) => vec!["--cookies".to_string(), path.display().to_string()],
        None => vec![],
    }
}
```

#### 2.2.3 前端交互

- 首页提供 "Choose Cookie file" 按钮（Tauri dialog 文件选择器）
- 显示当前选择的文件名（悬停显示完整路径）
- 切换/清除 Cookie 后自动清空已解析的元数据，防止账号状态混淆

---

### 2.3 设置面板设计

#### 2.3.1 设置项结构

```
Settings Drawer (右侧滑出)
├── Output folder
│   ├── 当前路径显示
│   ├── 文本输入框
│   └── Browse / Save / Reset 按钮
├── GitHub site
│   └── Direct / gh-proxy 切换
├── Toolchain
│   ├── 工具根路径显示
│   ├── 工具列表（带状态点 + 版本号）
│   ├── 安装状态文本
│   └── Verify / Check updates / Install / Reinstall 按钮
├── Activity
│   └── 最近操作事件列表
└── Footer
    ├── Version 号
    ├── Check updates / Open release / Release notes / Project home
    └── 更新状态文本
```

#### 2.3.2 状态持久化（Rust 侧文件系统）

```
%LOCALAPPDATA%/yt-dlp-tauri/
├── state/
│   ├── download-directory.txt    # 用户自定义下载目录
│   └── cookies-file.txt          # 用户选择的 Cookie 文件路径
├── logs/
│   └── app.log                   # 操作日志
└── Tools/
    └── win-x64/                  # 安装的工具链
        ├── yt-dlp/
        ├── ffmpeg/bin/
        └── deno/
```

---

### 2.4 中英双语（i18n）方案

#### 2.4.1 极简实现

不使用 i18n 库，直接在 `main.ts` 内嵌翻译表：

```typescript
const translations = {
  en: { "app.title": "yt-dlp-tauri", "action.download": "Download", ... },
  zh: { "app.title": "yt-dlp-tauri", "action.download": "下载", ... },
} as const;

type TranslationKey = keyof (typeof translations)["en"];

function t(key: TranslationKey, values: Record<string, string | number> = {}) {
  let text = translations[state.language][key] || translations.en[key] || key;
  for (const [name, value] of Object.entries(values)) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return stripTerminalSentencePunctuation(text);
}
```

#### 2.4.2 DOM 绑定

```html
<!-- data-i18n 属性标记 -->
<button data-i18n="action.download">Download</button>
<input data-i18n-placeholder="url.placeholder" />
<img data-i18n-alt="preview.thumbnailAlt" />
```

```typescript
// applyTranslations() 遍历所有标记元素更新文本
document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
  const key = el.dataset.i18n as TranslationKey;
  if (key) el.textContent = t(key);
});
```

#### 2.4.3 语言切换

- 存储：`localStorage.setItem("yt-dlp-tauri-language", "zh")`
- 默认：`navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"`
- 切换后即时生效，无需刷新

---

### 2.5 操作日志

#### 2.5.1 日志系统

```rust
// 追加日志到文件
fn append_log(category: &str, message: &str) {
    // 写入 %LOCALAPPDATA%/yt-dlp-tauri/logs/app.log
    // 格式: [TIMESTAMP] [CATEGORY] message
}
```

#### 2.5.2 前端事件列表

- Settings → Activity 区域显示最近事件
- 事件类型：booted / toolsAvailable / parsed / saved / downloadCompleted / downloadFailed / cookiesUpdated 等
- 纯文本列表，无复杂过滤/搜索

---

## 3. 可借鉴的设计模式（代码层面）

### 3.1 工具链管理：Manifest + SHA-256 + 多级回退

**适用场景**：ContentForge 需要管理 Python 运行时、FFmpeg、yt-dlp 等外部依赖。

**可复用模式**：

```rust
// 1. 定义工具清单 JSON（版本化、平台化、带校验）
// 2. Rust 侧实现 locate_tools() 多级发现
// 3. 下载 → 校验 → 安装 → 标记可执行 的标准流程
// 4. 前端状态聚合：summarizeTools() 模式
```

**ContentForge 适配建议**：
- Python 解释器可作为 "tool" 纳入 manifest 管理
- 不同平台（Win/Mac/Linux）分别定义 sourceUrl
- 使用 SHA-256 校验防止下载损坏或中间人攻击

### 3.2 进程管理：PID 跟踪 + 取消令牌

```rust
#[derive(Clone, Default)]
struct DownloadProcessState {
    active_pid: Arc<Mutex<Option<u32>>>,
    cancel_requested: Arc<Mutex<bool>>,
}

// 启动时记录 PID
set_active_process(&process_state, pid)?;

// 取消时设置标志 + kill 进程树
fn cancel_download(process_state: State<'_, DownloadProcessState>) -> Result<(), String> {
    let pid = *process_state.active_pid.lock().map_err(lock_error)?;
    *process_state.cancel_requested.lock().map_err(lock_error)? = true;
    kill_process_tree(pid)
}
```

**借鉴点**：通过 Tauri State 共享进程状态，实现跨命令的取消能力。

### 3.3 进度报告：前缀解析 + 事件发射

```rust
// yt-dlp 自定义进度模板
"--progress-template", "yt-dlp-tauri-progress:%(progress.status)s|%(progress._percent_str)s|..."

// stdout 逐行解析
if let Some(progress) = parse_progress_line(&line) {
    emit_progress(&app, progress);
}

// 前端监听
listen<DownloadProgress>("download-progress", (event) => {
    updateDownloadProgress(event.payload);
});
```

**借鉴点**：通过子进程 stdout 自定义格式 + 前缀匹配，实现零轮询的实时进度。

### 3.4 Cookie 管理：RAII 临时文件

```rust
impl Drop for PreparedCookiesFile {
    fn drop(&mut self) {
        if self.temporary { let _ = fs::remove_file(&self.path); }
    }
}
```

**借鉴点**：Header 格式的 Cookie 转换为临时 Netscape 文件，通过 RAII 确保清理。

### 3.5 错误处理：结构化错误 + 用户友好消息

```rust
fn process_failure_message(
    description: &str,
    exit_code: Option<i32>,
    stderr: &[u8],
    stdout: &[u8],
) -> String {
    // 优先提取 yt-dlp ERROR: 行
    // 组合为：description + exit code + stderr 摘要
}
```

**借鉴点**：将技术错误（exit code、stderr）转换为用户可理解的错误消息。

---

## 4. 与 ContentForge 的适配建议

### 4.1 直接可借鉴的模块

| yt-dlp-tauri 模块 | ContentForge 适配场景 | 优先级 |
|-------------------|----------------------|--------|
| `tools-manifest.json` + Rust 安装器 | Python 运行时、FFmpeg、yt-dlp 的自动管理 | ⭐⭐⭐ 高 |
| `locate_tools()` 多级发现 | 外部二进制发现（Python、FFmpeg） | ⭐⭐⭐ 高 |
| Cookie 文件选择 + 传递 | 社交媒体账号认证（YouTube、Bilibili 等） | ⭐⭐⭐ 高 |
| 下载进度解析 + 事件发射 | 视频下载/转码进度实时展示 | ⭐⭐⭐ 高 |
| 操作日志系统 | 用户操作审计、问题排查 | ⭐⭐ 中 |
| 中英双语实现 | ContentForge 多语言支持 | ⭐⭐ 中 |
| GitHub Release 更新检查 | 应用自动更新 | ⭐⭐ 中 |

### 4.2 ContentForge 差异化需求

| 差异点 | yt-dlp-tauri | ContentForge |
|--------|-------------|--------------|
| 核心引擎 | yt-dlp 子进程 | Go CLI + Python 子进程 |
| 架构复杂度 | 单页面、功能聚焦 | 多模块（采集、转录、AI、发布） |
| 前端框架 | Vanilla TS | Next.js + React 19 |
| 状态管理 | 内嵌对象 | Zustand |
| 队列系统 | 单下载 | 多任务并发队列 |
| 数据持久化 | 文件系统 | SQLite |

### 4.3 具体适配方案

#### A. Python 运行时管理（替代当前 venv 方案）

```json
// ContentForge tools-manifest.json（构想）
{
  "schemaVersion": 1,
  "targets": [
    {
      "target": "win-x64",
      "tools": [
        {
          "name": "python",
          "path": "Tools/win-x64/python/python.exe",
          "sourceUrl": "https://.../python-3.11.9-embed-amd64.zip",
          "sha256": "...",
          "kind": "zip"
        },
        {
          "name": "ffmpeg",
          "path": "Tools/win-x64/ffmpeg/bin/ffmpeg.exe",
          "sourceUrl": "...",
          "sha256": "...",
          "kind": "zip"
        },
        {
          "name": "contentforge-cli",
          "path": "Tools/win-x64/contentforge/contentforge.exe",
          "sourceUrl": "https://github.com/.../releases/download/...",
          "sha256": "...",
          "kind": "file"
        }
      ]
    }
  ]
}
```

**优势**：
- 用户无需手动安装 Python、FFmpeg
- 版本锁定，避免 "在我机器上能跑"
- 自动更新机制

#### B. Tauri 后端架构（ContentForge Desktop）

```rust
// src-tauri/src/lib.rs 模块划分建议
mod commands {
    mod download;      // 视频下载（复用 yt-dlp-tauri 模式）
    mod transcribe;    // 字幕提取（调用 Go CLI）
    mod ai;            // AI 处理（调用 Python 子进程）
    mod toolchain;     // 工具链管理（直接复用）
    mod settings;      // 设置持久化
    mod cookie;        // Cookie 管理（直接复用）
}

mod core {
    mod process;       // 子进程管理（PID 跟踪、取消）
    mod progress;      // 进度解析、事件发射
    mod manifest;      // 工具清单读取、校验
    mod log;           // 操作日志
}
```

#### C. 前端状态同步

```typescript
// 复用 toolchain.ts 的 summarizeTools 模式
// 扩展到 ContentForge 的模块状态

export type ModuleStatus = {
  name: string;
  availability: "available" | "missing" | "outdated" | "error";
  version?: string;
  error?: string;
};

export function summarizeModules(modules: ModuleStatus[]): {
  ready: boolean;
  action: "install" | "update" | null;
} {
  // 类似逻辑...
}
```

---

## 5. 风险与注意事项

### 5.1 许可证合规

- yt-dlp-tauri 采用 **GPL-3.0-only**
- yt-dlp 的 PyInstaller 打包可执行文件包含 GPLv3+ 代码，衍生作品需遵循 GPL
- FFmpeg 使用 GPL build 时同样触发 copyleft
- **建议**：ContentForge 若集成类似工具链，需明确第三方许可证声明（参考 `THIRD-PARTY-NOTICES.md`）

### 5.2 安全风险

| 风险点 | 说明 | 缓解措施 |
|--------|------|----------|
| 远程代码执行 | 下载并执行外部二进制 | SHA-256 校验 + 固定 URL |
| Manifest 篡改 | 攻击者替换 manifest | 签名验证 / 仅信任 GitHub Release |
| Cookie 泄露 | Cookie 文件包含敏感凭证 | 不记录日志、用户数据目录隔离 |
| 中间人攻击 | 下载过程被劫持 | HTTPS + SHA-256 校验 |

### 5.3 技术限制

| 限制 | 说明 |
|------|------|
| 平台覆盖 | 当前仅支持 Windows x64、macOS Intel/ARM，Linux 未覆盖 |
| 窗口固定 | 1180×740 不可缩放，不适合复杂布局 |
| 无队列系统 | 单下载任务，无并发队列 |
| 无数据库 | 纯文件系统持久化，不适合复杂数据关系 |
| Vanilla TS | 无组件化，UI 复杂时维护成本高 |

### 5.4 维护成本

- **Manifest 更新**：每次 yt-dlp/FFmpeg 发版需手动更新 URL + SHA-256
- **yt-dlp-tauri 的解决方案**：GitHub Actions 定时检查上游 release，自动创建更新 PR
- **建议 ContentForge 采用**：同样的自动化 workflow，减少人工维护

---

## 6. 结论

yt-dlp-tauri 是一个**设计精良的轻量级桌面应用**，其工具链管理方案（Manifest 驱动 + SHA-256 校验 + 多级发现 + 自动安装更新）是最大亮点，可直接为 ContentForge Desktop 解决 "Python venv + 外部二进制" 的打包痛点。

**核心借鉴优先级**：

1. **工具链管理 Manifest 方案** → 管理 Python、FFmpeg、Go CLI 等外部依赖
2. **Cookie 认证双模式** → 社交媒体内容采集的账号认证
3. **进程 PID 跟踪 + 取消机制** → 长任务（下载、转录、AI）的可控中断
4. **进度前缀解析 + 事件发射** → 实时进度反馈
5. **操作日志 + 设置持久化** → 用户体验与问题排查

**不推荐直接借鉴**：
- Vanilla TS 前端架构（ContentForge 已选 Next.js + React 19，应保持一致）
- 固定窗口尺寸（ContentForge 功能复杂，需要响应式布局）
- 文件系统状态持久化（ContentForge 已有 SQLite 方案，更成熟）

---

## 附录：关键文件索引

| 文件 | 路径 | 说明 |
|------|------|------|
| 工具清单 | `src-tauri/tools-manifest.json` | 平台工具定义、URL、SHA-256 |
| Rust 主库 | `src-tauri/src/lib.rs` | 工具链管理、下载、Cookie、日志全逻辑 |
| Cargo 配置 | `src-tauri/Cargo.toml` | 依赖：tauri、reqwest、sha2、rustls |
| Tauri 配置 | `src-tauri/tauri.conf.json` | 窗口、打包、资源 |
| 前端入口 | `src/main.ts` | UI 逻辑、i18n、事件绑定 |
| 工具链聚合 | `src/toolchain.ts` | 工具状态摘要、按钮映射 |
| 更新检查 | `src/update-check.ts` | GitHub API、版本比较、gh-proxy |
| 开发脚本 | `scripts/download-tools.ps1` | Windows 开发环境工具恢复 |
| Release CI | `.github/workflows/release.yml` | 多平台打包、manifest 上传 |
