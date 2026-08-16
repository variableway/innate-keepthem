# ContentForge — 架构总览

> 文档版本: v1.0  
> 更新日期: 2026-08-03  
> 架构风格: Hybrid（混合架构）

---

## 一、架构全景图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              ContentForge 系统架构                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Desktop    │  │     CLI      │  │    Web UI    │  │    Chrome Extension      │  │
│  │  (Tauri v2)  │  │   (Go/Cobra) │  │  (Next.js)   │  │    (Manifest V3)         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                  │                  │                       │                │
│         └──────────────────┴──────────────────┴───────────────────────┘                │
│                                    │                                                  │
│                         ┌──────────┴──────────┐                                      │
│                         │   API 抽象层           │                                      │
│                         │  (Tauri IPC / HTTP)  │                                      │
│                         └──────────┬──────────┘                                      │
│                                    │                                                  │
│  ┌─────────────────────────────────┼────────────────────────────────────────────────┐ │
│  │                                 ▼                                                │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐    │ │
│  │  │                    Python Core Engine（Python 3.10+）                      │    │ │
│  │  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐ │    │ │
│  │  │  │Ingestion│ │Processing│ │ Pipeline │ │   AI    │ │  Chat   │ │Plugin│ │    │ │
│  │  │  │  Domain │ │  Domain  │ │ Engine   │ │ Engine  │ │ Engine  │ │System│ │    │ │
│  │  │  └─────────┘ └──────────┘ └──────────┘ └─────────┘ └─────────┘ └──────┘ │    │ │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │ │
│  │                                                                                  │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐    │ │
│  │  │                    Rust Backend（Tauri v2 Runtime）                        │    │ │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│    │ │
│  │  │  │Downloader│ │  Queue  │ │Database │ │  VTT    │ │ Audio   │ │ Skill  ││    │ │
│  │  │  │(yt-dlp)  │ │ Manager │ │(SQLite) │ │ Analysis│ │ Extract │ │Registry││    │ │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘│    │ │
│  │  └─────────────────────────────────────────────────────────────────────────┘    │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│  │                         External Services（可选）                                  │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────────────────┐  │  │
│  │  │ OpenAI  │  │ Claude  │  │ Ollama  │  │ Jina    │  │ agent-reach / yt-dlp  │  │  │
│  │  │   API   │  │   API   │  │  Local  │  │ Reader  │  │      CLI tools        │  │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └───────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、技术栈矩阵

| 层级 | 技术选型 | 版本 | 职责 | 代码量 |
|------|----------|------|------|--------|
| **CLI** | Go + Cobra | 1.24+ | 命令行交互、批量脚本 | ~2K 行 |
| **Desktop Shell** | Tauri v2 (Rust) | 2.10+ | 桌面封装、系统级 API、数据库 | ~4K 行 |
| **Frontend** | Next.js + React 19 + Tailwind CSS | 15.x | UI 渲染、状态管理 | ~3K 行 |
| **Core Engine** | Python 3.13 | 3.10+ | AI 处理、采集、流水线、Agent | ~9.5K 行 |
| **Database** | SQLite (via sqlx) | - | 本地数据持久化 | Schema 8 张表 |
| **Video** | yt-dlp + FFmpeg | - | 视频下载与处理 | 封装层 |

---

## 三、模块边界与通信

### 3.1 模块职责

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端层 (Frontend)                        │
│  Next.js App Router + React 19 + Tailwind CSS + Zustand         │
│  ─────────────────────────────────────────────────────────────  │
│  • 页面路由: / /settings /download /assets /workflows           │
│  • 状态管理: chatStore / agentStore / assetStore / downloadStore │
│  • API 抽象: api-client.ts (IPC / HTTP 自适应)                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Tauri IPC / HTTP API
┌─────────────────────────────▼───────────────────────────────────┐
│                         Rust 后端层                              │
│  Tauri v2 Runtime + tokio + sqlx                                │
│  ─────────────────────────────────────────────────────────────  │
│  • IPC Commands: 31 个命令（Chat/Agent/Asset/Download/Video/AI） │
│  • 数据库: SQLite（sessions/messages/assets/downloads/vtt/settings）│
│  • 下载器: yt-dlp 封装 + 并发队列管理                             │
│  • 启动恢复: 自动恢复未完成下载                                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │ PythonBridge / Sidecar HTTP
┌─────────────────────────────▼───────────────────────────────────┐
│                      Python Core Engine                          │
│  自研轻量 Agent 框架 + ReAct 模式                                 │
│  ─────────────────────────────────────────────────────────────  │
│  • AI 模块: Agent 定义/路由/注册表/会话/工具调用                   │
│  • 采集模块: agent-reach / web_scraper / transcriber             │
│  • 处理模块: AI Engine / summarizer / translator / analyzer      │
│  • 流水线: DAG 执行引擎 + 预设流水线                              │
│  • Skill 系统: Loader / Executor / Context（Markdown+YAML）       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 通信机制

#### A. Desktop 前后端通信

| 模式 | 协议 | 用途 | 示例 |
|------|------|------|------|
| IPC Invoke | Tauri `invoke()` | 同步请求-响应 | `start_download()`, `chat_send()` |
| IPC Event | Tauri `emit()`/`listen()` | 实时推送 | `download:progress:{id}`, `message.delta` |
| WebSocket | `ws://` | Web 模式流式通信 | 流式聊天消息 |

#### B. Go-Python 桥接

```go
// CLI 通过 PythonBridge 调用 Python 核心
pb.CallWithOutput(
    "contentforge.ingestion.agent_reach",
    "AgentReachIngestor",
    map[string]interface{}{"_method": "fetch", "url": url},
    &result,
)
```

实现方式：生成内联 Python 脚本，通过子进程 JSON stdin/stdout 通信。

#### C. Rust-Python 通信

Rust 后端直接调用 Python 进程或通过 HTTP Sidecar 调用 Python FastAPI 服务。

### 3.3 数据流

```
[URL Input / File Drop]
         ↓
[Ingestion Layer] ──→ ContentUnit（SQLite 持久化）
         ↓
[Processing Layer] ──→ AI 处理（摘要/翻译/分析/改写）
         ↓
[Pipeline Engine] ──→ 编排多步处理
         ↓
[Format Renderer] ──→ Markdown / HTML / 小红书 / Slides / JSON
         ↓
[Publish Output]
```

---

## 四、数据库 Schema

### 4.1 核心表

```sql
-- 会话表
CREATE TABLE sessions (
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

-- 消息表
CREATE TABLE messages (
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

-- 资产表（核心）
CREATE TABLE assets (
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

-- 下载记录表
CREATE TABLE downloads (
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
    options TEXT,                 -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VTT 分析报告表
CREATE TABLE vtt_reports (
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

-- 设置表
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent 切换历史
CREATE TABLE agent_switches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    reason TEXT,
    triggered_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 流水线执行记录
CREATE TABLE pipeline_runs (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    steps TEXT,
    input_unit_ids TEXT DEFAULT '[]',
    output_unit_ids TEXT DEFAULT '[]',
    logs TEXT,
    error TEXT
);
```

### 4.2 索引

```sql
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_sessions_status ON sessions(status);
```

---

## 五、配置体系

### 5.1 配置文件

```yaml
# ~/.config/contentforge/config.yaml
version: "1"
ai_provider:
  name: openai
  api_key: sk-xxx
  default_model: gpt-4o-mini
ai_providers:
  - name: claude
    api_key: sk-ant-xxx
    default_model: claude-3-5-sonnet-20241022
  - name: ollama
    base_url: http://localhost:11434
    default_model: llama3.1
platform:
  agent_reach_binary: agent-reach
  ytdlp_binary: yt-dlp
  ffmpeg_path: /usr/local/bin/ffmpeg
proxy:
  http: http://localhost:7890
  https: http://localhost:7890
publish_profiles:
  - id: xiaohongshu
    platform: xiaohongshu
    max_length: 1000
    auto_publish: false
```

### 5.2 环境变量覆盖

| 环境变量 | 覆盖项 |
|----------|--------|
| `CF_AI_API_KEY` | AI Provider API Key |
| `CF_AI_PROVIDER` | 默认 Provider 名称 |
| `CF_AI_MODEL` | 默认模型 |
| `CF_HTTP_PROXY` / `CF_HTTPS_PROXY` | 代理 |
| `CF_YTDLP_BINARY` | yt-dlp 路径 |
| `CF_FFMPEG_PATH` | FFmpeg 路径 |
| `CF_STATE_DIR` | 状态目录 |
| `CF_LOG_LEVEL` | 日志级别 |
| `CF_SKILL_DIR` | Skill 目录 |

---

## 六、项目目录结构

```
contentforge/
│
├── desktop/                          # Tauri Desktop 应用
│   ├── src/
│   │   ├── app/                      # Next.js 页面路由
│   │   │   ├── page.tsx              # 首页/仪表盘
│   │   │   ├── layout.tsx            # 根布局
│   │   │   ├── settings/page.tsx     # 设置页面
│   │   │   ├── download/page.tsx     # 下载管理
│   │   │   └── assets/page.tsx       # 资产管理
│   │   ├── components/
│   │   │   ├── layout/               # 布局组件（AppShell, Sidebar, Header）
│   │   │   ├── theme-provider.tsx    # 主题提供者
│   │   │   └── ui/                   # UI 组件
│   │   ├── store/
│   │   │   ├── chatStore.ts          # 聊天状态
│   │   │   ├── agentStore.ts         # Agent 状态
│   │   │   ├── assetStore.ts         # 资产状态
│   │   │   └── downloadStore.ts      # 下载状态
│   │   ├── lib/
│   │   │   ├── api-client.ts         # API 抽象层
│   │   │   ├── ws-client.ts          # WebSocket 客户端
│   │   │   ├── navigation.ts         # 导航配置
│   │   │   └── utils.ts              # 工具函数
│   │   ├── types/
│   │   │   ├── chat.ts               # 聊天类型
│   │   │   ├── agent.ts              # Agent 类型
│   │   │   └── asset.ts              # 资产类型
│   │   └── i18n/
│   │       └── index.tsx             # 国际化（预留）
│   └── src-tauri/
│       ├── src/
│       │   ├── main.rs               # 入口
│       │   ├── lib.rs                # 应用初始化
│       │   ├── commands/             # IPC 命令（8 个模块）
│       │   │   ├── mod.rs
│       │   │   ├── chat.rs
│       │   │   ├── agent.rs
│       │   │   ├── asset.rs
│       │   │   ├── settings.rs
│       │   │   ├── download.rs
│       │   │   ├── video.rs
│       │   │   └── ai.rs
│       │   ├── db/                   # 数据库模块（8 个文件）
│       │   │   ├── mod.rs
│       │   │   ├── types.rs
│       │   │   ├── sessions.rs
│       │   │   ├── messages.rs
│       │   │   ├── assets.rs
│       │   │   ├── downloads.rs
│       │   │   ├── settings.rs
│       │   │   ├── agent_switches.rs
│       │   │   └── pipeline_runs.rs
│       │   ├── downloader.rs         # yt-dlp 下载器
│       │   ├── queue.rs              # 下载队列管理
│       │   ├── vtt_analysis.rs       # VTT 字幕分析
│       │   ├── audio_extractor.rs    # 音频提取
│       │   ├── agent_cli.rs          # AI Agent CLI 封装
│       │   ├── agent_runner.rs       # Agent 运行环境
│       │   ├── asset_processor.rs    # 资产处理
│       │   └── pipeline.rs           # 流水线执行
│       └── Cargo.toml
│
├── core/                             # Python 核心引擎
│   └── python/contentforge/
│       ├── __init__.py
│       ├── models.py                 # 核心数据模型
│       ├── config.py                 # 配置管理
│       ├── ai/                       # AI 模块（14 个文件）
│       │   ├── agent.py              # Agent 定义
│       │   ├── agent_registry.py     # Agent 注册表
│       │   ├── agent_router.py       # Agent 路由
│       │   ├── agent_session.py      # ReAct 会话
│       │   ├── chat_engine.py        # 对话引擎
│       │   ├── content_access.py     # 内容访问层
│       │   ├── asset_retriever.py    # 资产检索
│       │   ├── video_inspector.py    # 视频检查
│       │   ├── context.py            # Token 预算管理
│       │   ├── session.py            # 会话管理
│       │   ├── router.py             # 动态路由
│       │   ├── tools.py              # 工具定义
│       │   ├── USAGE_EXAMPLES.py     # 使用示例
│       │   └── skills/               # Skill 系统
│       │       ├── skill_loader.py
│       │       ├── skill_executor.py
│       │       ├── skill_context.py
│       │       └── examples.py
│       ├── cli/                      # CLI 桥接（6 个文件）
│       │   ├── bridge.py
│       │   ├── scrape.py
│       │   ├── process.py
│       │   ├── publish.py
│       │   └── pipeline.py
│       ├── ingestion/                # 采集模块（4 个文件）
│       │   ├── agent_reach.py
│       │   ├── web_scraper.py
│       │   ├── transcriber.py
│       │   └── health_check.py
│       ├── processing/               # 处理模块（5 个文件）
│       │   ├── ai_engine.py
│       │   ├── analyzer.py
│       │   ├── summarizer.py
│       │   ├── translator.py
│       │   └── xiaohongshu_converter.py
│       └── pipeline/                 # 流水线模块（3 个文件）
│           ├── engine.py
│           ├── presets.py
│           └── runner.py
│
├── extension/                        # Chrome 扩展（URL 提取）
│   ├── content/
│   └── popup/
│
├── web/                              # Web UI（可选部署）
│
├── docs/                             # 项目文档
│   ├── projects/                     # 项目级文档（本文档所在目录）
│   ├── spec/                         # 模块 SPEC 文档
│   ├── architecture/                 # 架构决策记录
│   ├── research/                     # 研究报告
│   ├── plan/                         # 执行计划
│   └── external-repos/               # 外部仓库分析
│
└── cli/                              # Go CLI（规划中）
```

---

## 七、扩展点

| 扩展类型 | 方式 | 文档 |
|----------|------|------|
| 自定义 Pipeline Step | 继承 `StepHandler` 基类 | PYTHON_CORE_SPEC |
| 自定义 Agent | 定义 `AgentRole` 配置 | FRONTEND_SPEC |
| 自定义 Skill | Markdown + YAML Frontmatter | PYTHON_CORE_SPEC |
| 新增 AI Provider | 继承 `AIProvider` 基类 | PYTHON_CORE_SPEC |
| 新增 Plugin | 实现 `Plugin` 接口 | 03-PLUGIN-SYSTEM.md |
| 新增发布格式 | 扩展 `renderContent()` | CLI_SPEC |

---

## 八、相关文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 项目愿景 | [00-PROJECT-VISION.md](00-PROJECT-VISION.md) | 愿景、核心概念、设计哲学 |
| 模块状态 | [02-MODULE-STATUS.md](02-MODULE-STATUS.md) | 各模块功能、已完成/未完成 |
| Plugin 系统 | [03-PLUGIN-SYSTEM.md](03-PLUGIN-SYSTEM.md) | Plugin 架构设计 |
| Skill 系统 | [04-SKILL-SYSTEM.md](04-SKILL-SYSTEM.md) | Skill 定义与执行 |
| 内容生命周期 | [05-CONTENT-LIFECYCLE.md](05-CONTENT-LIFECYCLE.md) | ContentUnit 生命周期 |
| 路线图 | [06-ROADMAP.md](06-ROADMAP.md) | 开发计划与里程碑 |
| 术语表 | [07-TERMINOLOGY.md](07-TERMINOLOGY.md) | 术语定义 |
