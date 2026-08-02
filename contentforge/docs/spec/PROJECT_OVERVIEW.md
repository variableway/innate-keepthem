# ContentForge 项目概览 SPEC

> 版本: 0.1.0  
> 最后更新: 2025-07-24  
> 适用范围: ContentForge 全项目架构

---

## 1. 项目定位

ContentForge 是一款跨平台内容获取→处理→发布工具链，支持从任意社交媒体（Twitter/X、YouTube、RSS、网页）采集内容，通过 AI 处理（摘要、改写、翻译、分析）转化为适合任意平台发布的内容格式。

### 1.1 核心价值主张

| 能力 | 描述 |
|------|------|
| **采集** | 支持 15+ 平台，通过 agent-reach CLI 统一封装 |
| **处理** | AI 驱动的摘要、翻译、改写、分析、小红书文案转换 |
| **流水线** | DAG 执行引擎，支持预设模板和自定义流程 |
| **发布** | 多格式导出（Markdown、HTML、JSON、小红书格式） |
| **Chat** | 内置 AI 对话界面，支持 Agent 路由与工具调用 |

### 1.2 目标用户

- 内容创作者（需要跨平台分发内容）
- 知识工作者（需要将视频/文章转化为笔记）
- 社交媒体运营（需要批量处理多源内容）

---

## 2. 架构总览

ContentForge 采用 **Hybrid Architecture（混合架构）**，结合多种技术栈以发挥各自优势：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ContentForge 架构                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Desktop    │  │     CLI      │  │    Web UI    │  │  Extension   │     │
│  │  (Tauri v2)  │  │   (Go/Cobra) │  │  (Next.js)   │  │  (Chrome)    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │                  │           │
│         └──────────────────┴──────────────────┴──────────────────┘           │
│                                    │                                         │
│                         ┌──────────┴──────────┐                             │
│                         │   API 抽象层         │                             │
│                         │  (Tauri IPC / HTTP)  │                             │
│                         └──────────┬──────────┘                             │
│                                    │                                         │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐  │
│  │                                 ▼                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐    │  │
│  │  │                    Python Core Engine                        │    │  │
│  │  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌──────┐ │    │  │
│  │  │  │Ingestion│ │Processing│ │ Pipeline │ │   AI    │ │Chat  │ │    │  │
│  │  │  │  Domain │ │  Domain  │ │ Engine   │ │ Engine  │ │Engine│ │    │  │
│  │  │  └─────────┘ └──────────┘ └──────────┘ └─────────┘ └──────┘ │    │  │
│  │  └─────────────────────────────────────────────────────────────┘    │  │
│  │                              Rust Backend (Tauri)                    │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐   │  │
│  │  │Downloader│ │  Queue  │ │Database │ │  VTT    │ │ Audio Extract│   │  │
│  │  │ (yt-dlp) │ │ Manager │ │(SQLite) │ │ Analysis│ │              │   │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 技术栈矩阵

| 层级 | 技术选型 | 版本 | 职责 |
|------|----------|------|------|
| **CLI** | Go + Cobra | 1.24+ | 命令行交互、批量脚本 |
| **Desktop Shell** | Tauri v2 (Rust) | 2.10+ | 桌面封装、系统级 API |
| **Frontend** | Next.js + React 19 + Tailwind CSS | 15.x | UI 渲染、状态管理 |
| **Core Engine** | Python 3.13 | 3.10+ | AI 处理、采集、流水线 |
| **Database** | SQLite (via sqlx) | - | 本地数据持久化 |
| **AI Provider** | OpenAI / Claude / Ollama | - | LLM 推理 |
| **Video** | yt-dlp + FFmpeg | - | 视频下载与处理 |

### 2.2 模块边界

| 模块 | 代码路径 | 语言 | 运行环境 |
|------|----------|------|----------|
| CLI | `cli/` | Go | 本地终端 |
| Python Core | `core/python/` | Python | venv 子进程 |
| Desktop Frontend | `desktop/src/` | TypeScript | Tauri WebView |
| Rust Backend | `desktop/src-tauri/src/` | Rust | Tauri Runtime |
| Chrome Extension | `extension/` | JavaScript | 浏览器 |
| Web Server | `web/` | TypeScript | Node.js (可选) |

---

## 3. 数据流架构

### 3.1 核心数据实体

```
ContentUnit（内容单元）— 贯穿全生命周期的核心实体
├── id: UUID
├── source: SourceInfo（平台、URL、作者、互动数据）
├── type: ContentType（video/article/tweet/thread/audio/image/note）
├── title, description, extracted_text
├── summary, key_points, sentiment, topics
├── translated_text, rewritten_text
├── status: ContentStatus（生命周期状态）
├── tags, raw_metadata
└── created_at, updated_at
```

### 3.2 生命周期状态机

```
ingested → processing → processed → editing → ready → published
    ↑          ↓           ↓
    └─────── failed ←──────┘
```

### 3.3 端到端数据流

```
[URL Input] → [Ingestion Layer] → [ContentUnit] → [Processing Layer]
                                                  ↓
[Publish Output] ← [Format Renderer] ← [Pipeline Engine] ← [AI Engine]
```

---

## 4. 通信机制

### 4.1 Go-Python 桥接

CLI 通过 `PythonBridge` 调用 Python 核心模块：

```go
// 内部实现：生成内联 Python 脚本，通过子进程 JSON stdin/stdout 通信
pb.CallWithOutput(
    "contentforge.ingestion.agent_reach",  // 模块路径
    "AgentReachIngestor",                  // 类名
    map[string]interface{}{"_method": "fetch", "url": url},  // 参数
    &result,
)
```

### 4.2 Desktop 前后端通信

| 模式 | 协议 | 用途 |
|------|------|------|
| IPC | Tauri `invoke()` | 同步命令（请求-响应） |
| Event | Tauri `emit()`/`listen()` | 实时推送（下载进度、流式消息） |
| WebSocket | `ws://` | Web 模式下的流式通信 |

### 4.3 API 抽象层

`api-client.ts` 提供统一接口，自动适配运行环境：

```typescript
apiInvoke<T>(command: string, args?: unknown): Promise<T>   // 同步调用
apiListen(event: string, handler: (payload) => void): () => void  // 事件订阅
```

---

## 5. 配置体系

### 5.1 配置文件位置

```
~/.config/contentforge/config.yaml   # 主配置（YAML）
~/.contentforge/                     # 状态目录（下载、数据库）
```

### 5.2 配置结构

```yaml
version: "1"
ai_provider:
  name: openai
  api_key: sk-xxx
  default_model: gpt-4o-mini
ai_providers:  # 多 Provider 配置
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

### 5.3 环境变量覆盖

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

---

## 6. 预设流水线

| 预设 ID | 输入 | 输出 | 核心步骤 |
|---------|------|------|----------|
| `twitter_to_xiaohongshu` | Twitter URL | 小红书文案 | 采集 → 翻译 → 摘要 → 小红书转换 → 分析 |
| `youtube_to_notes` | YouTube URL | 结构化笔记 | 采集(字幕) → 翻译 → 摘要 → 分析 → 改写 |
| `rss_to_digest` | RSS Feed | 摘要报告 | 采集 → 过滤 → 摘要 → 分析 |
| `web_to_summary` | 网页 URL | Markdown | 采集 → 摘要 → 分析 → 翻译 |
| `ai_processing` | 已有内容 | 多格式 | 分析 → 摘要 → 改写 → 小红书 → 翻译 |

---

## 7. Agent 体系

### 7.1 内置 Agent 角色

| Agent ID | 名称 | 能力 | 自动切换 |
|----------|------|------|----------|
| `general` | 通用助手 | general, search | 否 |
| `content_analyst` | 内容分析师 | analyze, search | 是 |
| `summarizer` | 摘要专家 | summarize, search | 是 |
| `rewriter` | 改写专家 | rewrite, translate, search | 是 |
| `publisher` | 发布助手 | publish, search | 是 |
| `pipeline_runner` | 流水线执行器 | pipeline, search | 是 |

### 7.2 意图路由规则

AgentStore 通过正则表达式模式匹配用户输入，自动路由到最合适的 Agent：

```typescript
// 示例："分析这个视频" → content_analyst
// 示例："总结这篇文章" → summarizer
// 示例："转成小红书格式" → rewriter
// 示例："运行 twitter_to_xiaohongshu 流水线" → pipeline_runner
```

---

## 8. 项目目录结构

```
contentforge/
├── cli/                          # Go CLI
│   ├── cmd/                      # Cobra 子命令
│   │   ├── root.go               # 根命令定义
│   │   ├── scrape.go             # 采集命令
│   │   ├── process.go            # 处理命令
│   │   ├── publish.go            # 发布命令
│   │   └── pipeline.go           # 流水线命令
│   ├── internal/
│   │   ├── models/               # Go 数据模型
│   │   └── python_bridge.go      # Go-Python 桥接
│   ├── main.go
│   └── go.mod
│
├── core/                         # Python 核心引擎
│   ├── python/contentforge/
│   │   ├── models.py             # 核心数据模型
│   │   ├── config.py             # 配置管理
│   │   ├── ingestion/            # 采集域
│   │   │   ├── agent_reach.py    # agent-reach CLI 封装
│   │   │   ├── web_scraper.py    # Jina Reader 封装
│   │   │   ├── transcriber.py    # 视频转录
│   │   │   └── health_check.py   # 平台健康检查
│   │   ├── processing/           # 处理域
│   │   │   ├── ai_engine.py      # AI Engine 抽象层
│   │   │   ├── summarizer.py     # 摘要生成
│   │   │   ├── analyzer.py       # 内容分析
│   │   │   ├── translator.py     # 翻译
│   │   │   └── xiaohongshu_converter.py  # 小红书转换
│   │   ├── pipeline/             # 流水线域
│   │   │   ├── engine.py         # DAG 执行引擎
│   │   │   ├── presets.py        # 预设流水线
│   │   │   └── runner.py         # 生命周期管理
│   │   ├── ai/                   # AI 对话域
│   │   │   ├── chat_engine.py    # 对话引擎
│   │   │   ├── agent.py          # Agent 定义
│   │   │   ├── agent_router.py   # Agent 路由
│   │   │   ├── agent_registry.py # Agent 注册表
│   │   │   ├── tools.py          # 工具定义
│   │   │   ├── context.py        # 上下文管理
│   │   │   └── session.py        # 会话管理
│   │   └── cli/                  # Python CLI 桥接
│   │       └── bridge.py
│   └── scripts/
│       ├── presets/              # 预设 JSON 文件
│       └── cf-env.sh             # 环境变量脚本
│
├── desktop/                      # Tauri Desktop 应用
│   ├── src/
│   │   ├── app/                  # Next.js 页面路由
│   │   │   ├── page.tsx          # 首页
│   │   │   ├── settings/         # 设置页面
│   │   │   ├── download/         # 下载管理
│   │   │   └── workflows/        # 流水线页面
│   │   ├── components/           # React 组件
│   │   │   ├── layout/           # 布局组件
│   │   │   ├── download/         # 下载相关组件
│   │   │   └── forms/            # 表单组件
│   │   ├── store/                # Zustand Stores
│   │   │   ├── chatStore.ts      # 聊天状态
│   │   │   ├── agentStore.ts     # Agent 状态
│   │   │   ├── assetStore.ts     # 资产状态
│   │   │   └── downloadStore.ts  # 下载状态
│   │   ├── lib/
│   │   │   ├── api-client.ts     # API 抽象层
│   │   │   └── ws-client.ts      # WebSocket 客户端
│   │   └── types/                # TypeScript 类型定义
│   └── src-tauri/
│       ├── src/                  # Rust 后端源码
│       │   ├── lib.rs            # 应用入口
│       │   ├── commands.rs       # Tauri IPC 命令
│       │   ├── downloader.rs     # yt-dlp 下载器
│       │   ├── queue.rs          # 下载队列管理
│       │   ├── db/               # 数据库模块
│       │   ├── vtt_analysis.rs   # VTT 字幕分析
│       │   └── audio_extractor.rs# 音频提取
│       └── Cargo.toml
│
├── extension/                    # Chrome 扩展
│   ├── content/                  # Content Script
│   └── popup/                    # Popup UI
│
├── web/                          # Web UI (可选部署)
│   └── src/
│       ├── controllers/
│       ├── middleware/
│       └── routes/
│
└── docs/                         # 项目文档
    ├── spec/                     # 模块 SPEC 文档
    ├── architecture/             # 架构决策记录
    ├── api/                      # API 文档
    └── guides/                   # 用户指南
```

---

## 9. 开发与部署

### 9.1 环境要求

| 组件 | 最低版本 | 安装方式 |
|------|----------|----------|
| macOS | 13+ | - |
| Python | 3.10+ | Homebrew / pyenv |
| Go | 1.24+ | Homebrew |
| Rust | 1.77+ | rustup |
| Node.js | 20+ | nvm / Homebrew |
| FFmpeg | 6.0+ | Homebrew |
| yt-dlp | 最新 | pip / Homebrew |

### 9.2 快速启动

```bash
# 1. 运行环境设置
bash setup-macos.sh

# 2. 加载环境变量
source contentforge/core/scripts/cf-env.sh

# 3. 验证 CLI
contentforge --help

# 4. 启动 Desktop
cd desktop && pnpm dev

# 5. 启动 Tauri
cd desktop && pnpm tauri dev
```

### 9.3 构建命令

```bash
# CLI 构建
cd cli && go build -o contentforge

# Desktop 构建
cd desktop && pnpm tauri build

# Web 构建
cd desktop && pnpm build
```

---

## 10. 扩展点

| 扩展类型 | 方式 | 文档 |
|----------|------|------|
| 自定义 Pipeline Step | 继承 `StepHandler` 基类 | [PYTHON_CORE_SPEC](PYTHON_CORE_SPEC.md) |
| 自定义 Agent | 定义 `AgentRole` 配置 | [FRONTEND_SPEC](FRONTEND_SPEC.md) |
| 自定义 Skill | Markdown + YAML Frontmatter | [PYTHON_CORE_SPEC](PYTHON_CORE_SPEC.md) |
| 新增 AI Provider | 继承 `AIProvider` 基类 | [PYTHON_CORE_SPEC](PYTHON_CORE_SPEC.md) |
| 新增发布格式 | 扩展 `renderContent()` | [CLI_SPEC](CLI_SPEC.md) |

---

## 11. 相关文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| CLI SPEC | [CLI_SPEC.md](CLI_SPEC.md) | Go CLI 命令、标志、Go-Python 桥接 |
| Python Core SPEC | [PYTHON_CORE_SPEC.md](PYTHON_CORE_SPEC.md) | AI Engine、Pipeline、采集、处理域 |
| Rust Backend SPEC | [RUST_BACKEND_SPEC.md](RUST_BACKEND_SPEC.md) | Tauri IPC、下载器、队列、数据库 |
| Frontend SPEC | [FRONTEND_SPEC.md](FRONTEND_SPEC.md) | Next.js 组件、Store、API 客户端、类型 |
