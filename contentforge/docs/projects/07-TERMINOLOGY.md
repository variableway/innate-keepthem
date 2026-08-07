# ContentForge — 术语表

> 文档版本: v1.0  
> 更新日期: 2026-08-03

---

## A

### Agent（智能体）
执行特定任务的 AI 角色。ContentForge 内置 6 个 Agent：通用助手、内容分析师、摘要专家、改写专家、发布助手、流水线执行器。每个 Agent 有独立的能力集、系统提示词和工具集。

### Agent Router（Agent 路由器）
负责分析用户意图并自动路由到最合适的 Agent。支持关键词匹配、Capability 评分、LLM 推理三种路由策略。

### API 抽象层
`api-client.ts` 提供的统一接口，自动适配 Tauri IPC（桌面模式）和 HTTP/WebSocket（Web 模式），使同一代码库支持两种运行环境。

### Asset（资产）
同 ContentUnit。在数据库表和 Rust 后端中称为 Asset，在 Python Core 中称为 ContentUnit。

## C

### Capability（能力）
Agent 的能力标识，如 `analyze`、`summarize`、`rewrite`、`translate`、`publish`、`pipeline`、`search`、`general`。Agent 通过声明 Capability 来表明自己能执行的任务类型。

### Chat Session（聊天会话）
用户与 Agent 的对话上下文。一个会话可以关联多个资产（ContentUnit），Agent 可以感知这些关联内容。

### ContentForge
项目名称。一个 AI-Native 的内容工作流平台，从社交媒体信息采集到内容加工、再到多平台发布，全流程自动化。

### ContentUnit（内容单元）
贯穿 ContentForge 全生命周期的核心数据实体。包含来源信息、类型、标题、提取文本、摘要、翻译、分析结果等字段。状态机：`ingested` → `processing` → `processed` → `editing` → `ready` → `published`。

## D

### DAG（有向无环图）
Pipeline 的执行结构。Pipeline 中的步骤以 DAG 形式组织，支持并行执行和依赖关系。

### Desktop App
ContentForge 的桌面应用程序，基于 Tauri v2 + Next.js + React 构建。提供 Chat 对话、资产管理、下载管理、设置等界面。

## E

### Event（事件）
Tauri 的实时通信机制。Rust 后端通过 `emit()` 发送事件，前端通过 `listen()` 订阅事件。用于下载进度、流式消息、工具调用状态等实时更新。

## F

### FetchResult
Plugin 采集内容后返回的结果，包含是否成功、ContentUnit 对象、错误信息和原始响应。

### FTS5
SQLite 的全文检索扩展。ContentForge 使用 FTS5 虚拟表实现对资产内容的全文搜索，无结果时自动回退到 LIKE 模糊匹配。

## I

### Ingestion（采集）
从外部来源（YouTube、Twitter、RSS、网页等）获取内容并转换为 ContentUnit 的过程。

### IPC（进程间通信）
Tauri 的前后端通信机制。前端通过 `invoke()` 调用 Rust 后端的命令，通过事件系统实现实时推送。

## L

### Local First（本地优先）
ContentForge 的设计哲学。所有数据存储在本地 SQLite，支持离线工作，AI Provider 可配置为本地 Ollama，用户内容永远属于用户自己。

## M

### Markdown + YAML Frontmatter
Skill 文件的定义格式。YAML Frontmatter 包含元数据（名称、触发器、参数等），Markdown Body 包含 Prompt 模板和使用说明。

## P

### Pipeline（流水线）
可编排的内容处理工作流，由一系列 Step 组成的 DAG。支持预设模板和自定义流程。

### PipelineRun
一次 Pipeline 执行实例，记录执行状态、步骤结果、输入输出资产、日志和错误信息。

### Plugin（插件）
扩展平台采集能力的模块。每个 Plugin 对应一个社交媒体平台或内容源，统一实现 `ContentPlugin` 接口。

### Plugin Manager
插件管理器，统一管理所有内容采集插件。负责插件注册、URL 路由、健康检查和统一采集入口。

### Processing（处理）
对 ContentUnit 进行 AI 处理的过程，包括摘要、翻译、分析、改写、小红书转换等。

### Python Core Engine
ContentForge 的 Python 核心引擎，负责内容采集、AI 处理、流水线编排和 Agent 对话。作为 Tauri 后端的子进程或独立 Sidecar 运行。

### PythonBridge
Go CLI 与 Python Core 之间的通信桥梁。通过启动 Python 子进程，以内联脚本方式动态调用 Python 模块。

## R

### ReAct（Reasoning + Acting）
一种 Agent 推理模式。Agent 在 Thought（思考）→ Action（行动）→ Observation（观察）的循环中解决问题，直到得出答案。

### Rebuild Plan
Rust 后端重构计划。将 `commands.rs`、`downloader.rs` 等单体文件拆分为模块化的子目录结构。

## S

### Shared Context（共享上下文）
ContentForge 的核心设计哲学。所有 Agent、Skill、工具和用户对话共享同一套内容上下文，实现资产关联和多 Agent 协作。

### Sidecar
ContentForge 中的独立进程架构。Python Core 可以作为 Tauri Sidecar（伴随进程）运行，通过 HTTP API 与 Rust 后端通信。

### Skill（技能）
可复用的 AI 工作流单元，以 Markdown + YAML Frontmatter 格式定义。包含触发器、参数定义、Prompt 模板和工具依赖。

### Skill Executor
Skill 执行引擎，自研轻量 ReAct 风格 Agent 框架。负责参数提取、Prompt 渲染、LLM 调用和工具执行。

### Skill Loader
Skill 加载器，从文件系统扫描和解析 Skill 文件，构建索引，支持关键词/意图/正则匹配。

### Skill Manifest
Skill 的元数据对象，包含名称、描述、版本、触发器、参数、工具依赖等信息。

### SourceInfo
ContentUnit 的来源信息，包含平台、URL、作者、发布时间和互动数据（likes、replies、reposts、views）。

### SPEC
模块规格说明书。ContentForge 的每个核心模块都有对应的 SPEC 文档，定义接口、数据模型和行为规范。

### Streaming（流式输出）
AI 响应的实时增量输出。前端通过 WebSocket 或 Tauri Event 接收增量 token，实现打字机效果。

## T

### Tauri
Rust 编写的桌面应用框架。ContentForge Desktop 使用 Tauri v2 提供桌面壳层、系统级 API 和前后端通信。

### Tool Calling（工具调用）
Agent 调用外部工具的能力。ContentForge 内置工具包括：查询资产、读取文件、执行 Skill、切换 Agent 等。

### Tool Registry
工具注册表，管理所有可用工具的元数据和执行函数。Agent 通过 Tool Registry 发现和调用工具。

### Trigger（触发器）
Skill 的自动触发条件。支持 keyword（关键词）、intent（意图）、regex（正则）、semantic（语义）四种类型。

## V

### VTT
Web Video Text Tracks 格式，即字幕文件格式。ContentForge 支持解析 YouTube 自动生成的 VTT 字幕和手动上传的字幕。

### vYtDL
ContentForge 的前身项目，一个 Go 编写的 YouTube 下载 CLI 工具。其下载功能和 TUI 设计被继承到 ContentForge 中。

## Y

### yt-dlp
YouTube 下载命令行工具，yt-dlc 的分支。ContentForge 使用 yt-dlp 下载视频和提取字幕，支持 1000+ 视频网站。

### YAML Frontmatter
Markdown 文件顶部的 YAML 元数据块，以 `---` 分隔。ContentForge 的 Skill 文件使用 YAML Frontmatter 定义元数据。

## Z

### Zustand
ContentForge 前端使用的状态管理库。比 Redux 更轻量，比 Context API 更高效。每个功能域有独立的 Store：chatStore、agentStore、assetStore、downloadStore。

---

## 缩写表

| 缩写 | 全称 | 说明 |
|------|------|------|
| API | Application Programming Interface | 应用程序接口 |
| CLI | Command Line Interface | 命令行界面 |
| CRUD | Create, Read, Update, Delete | 增删改查 |
| DAG | Directed Acyclic Graph | 有向无环图 |
| FTS5 | Full Text Search 5 | SQLite 全文检索扩展 |
| IPC | Inter-Process Communication | 进程间通信 |
| LLM | Large Language Model | 大语言模型 |
| MD | Markdown | 标记语言 |
| PRD | Product Requirements Document | 产品需求文档 |
| RAG | Retrieval-Augmented Generation | 检索增强生成 |
| ReAct | Reasoning + Acting | 推理+行动模式 |
| RSS | Really Simple Syndication | 简易信息聚合 |
| SPEC | Specification | 规格说明书 |
| SQL | Structured Query Language | 结构化查询语言 |
| TTS | Text-to-Speech | 文本转语音 |
| UI | User Interface | 用户界面 |
| URL | Uniform Resource Locator | 统一资源定位符 |
| UUID | Universally Unique Identifier | 通用唯一标识符 |
| VTT | Video Text Tracks | 视频文本轨道（字幕格式） |
| WAL | Write-Ahead Logging | 预写式日志 |
| XHS | 小红书 | 中国社交媒体平台 |
| YAML | YAML Ain't Markup Language | YAML 标记语言 |

---

## 相关文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 项目愿景 | [00-PROJECT-VISION.md](00-PROJECT-VISION.md) | 愿景、核心概念 |
| 架构总览 | [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) | 系统架构 |
| 模块状态 | [02-MODULE-STATUS.md](02-MODULE-STATUS.md) | 各模块功能状态 |
| Plugin 系统 | [03-PLUGIN-SYSTEM.md](03-PLUGIN-SYSTEM.md) | Plugin 架构 |
| Skill 系统 | [04-SKILL-SYSTEM.md](04-SKILL-SYSTEM.md) | Skill 设计 |
| 内容生命周期 | [05-CONTENT-LIFECYCLE.md](05-CONTENT-LIFECYCLE.md) | 生命周期 |
| 路线图 | [06-ROADMAP.md](06-ROADMAP.md) | 开发计划 |
