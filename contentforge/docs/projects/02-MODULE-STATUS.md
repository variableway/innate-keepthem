# ContentForge — 模块功能状态

> 文档版本: v1.0  
> 更新日期: 2026-08-03  
> 统计: 已完成功能 ████░░░░░░ (~40%) | 进行中 ███░░░░░░░ (~30%) | 规划中 ░░░░░░░░░░ (~30%)

---

## 一、模块总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                         ContentForge 模块地图                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │   前端层      │  │   Rust 后端   │  │ Python 核心  │  │ 外部服务  │ │
│  │  (3K 行)     │  │  (4K 行)     │  │  (9.5K 行)  │  │          │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │
│         │                 │                 │               │       │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐          │       │
│  │ ✅ UI 布局   │  │ ✅ 数据库    │  │ ✅ 数据模型  │          │       │
│  │ ✅ 导航      │  │ ✅ 下载器    │  │ ✅ Agent 定义│          │       │
│  │ ✅ Store 框架│  │ ✅ 队列      │  │ ✅ 配置管理  │          │       │
│  │ 🔄 Chat UI  │  │ ✅ IPC 命令  │  │ ✅ AI Engine │          │       │
│  │ 🔄 Agent UI │  │ 🔄 资产 CRUD │  │ 🔄 Skill 系统│          │       │
│  │ 📋 流水线 UI│  │ 🔄 聊天集成  │  │ 📋 Pipeline  │          │       │
│  │ 📋 插件面板 │  │ 📋 视频处理  │  │ 📋 Plugin    │          │       │
│  └─────────────┘  └─────────────┘  └─────────────┘          │       │
│                                                              │       │
└──────────────────────────────────────────────────────────────────────┘

图例: ✅ 已完成 | 🔄 进行中/部分完成 | 📋 规划中
```

---

## 二、前端层（Frontend）

**代码路径**: `contentforge/desktop/src/`  
**技术栈**: Next.js 15 + React 19 + Tailwind CSS + Zustand  
**总行数**: ~3,200 行

### 2.1 已完成 ✅

| 功能 | 文件 | 说明 |
|------|------|------|
| 应用布局框架 | `components/layout/app-shell.tsx` | AppShell + Sidebar + MainContent 布局 |
| 导航体系 | `lib/navigation.ts` | 导航配置定义 |
| 侧边栏 | `components/layout/app-sidebar.tsx` | 导航菜单、Logo、用户区 |
| 主题提供者 | `components/theme-provider.tsx` | 明暗主题切换 |
| API 抽象层 | `lib/api-client.ts` | IPC/HTTP/WebSocket 自适应调用 |
| WebSocket 客户端 | `lib/ws-client.ts` | 自动重连、事件订阅 |
| 类型定义 | `types/*.ts` | chat / agent / asset / download 类型 |
| 工具函数 | `lib/utils.ts` | 通用工具 |
| i18n 框架 | `i18n/index.tsx` | 国际化基础（预留） |

### 2.2 进行中 🔄

| 功能 | 文件 | 状态 | 说明 |
|------|------|------|------|
| Chat Store | `store/chatStore.ts` | 🔄 框架完成 | 会话管理、消息操作、流式处理骨架完成，待联调 |
| Agent Store | `store/agentStore.ts` | 🔄 框架完成 | Agent 注册、意图路由、Skill 列表骨架完成 |
| Asset Store | `store/assetStore.ts` | 🔄 框架完成 | 资产 CRUD 骨架完成 |
| Download Store | `store/downloadStore.ts` | 🔄 框架完成 | 下载状态管理骨架完成 |
| 下载管理页面 | `app/download/page.tsx` | 🔄 基础可用 | 下载列表、进度显示可用 |
| 设置页面 | `app/settings/page.tsx` | 🔄 基础可用 | AI Provider、代理、路径设置 |
| 资产页面 | `app/assets/page.tsx` | 🔄 框架搭建 | 资产列表页骨架 |

### 2.3 规划中 📋

| 功能 | 优先级 | 说明 |
|------|--------|------|
| Chat 对话框 UI | 🔴 P0 | 消息列表、流式渲染、工具调用卡片、Agent 切换器 |
| Agent 面板 | 🔴 P0 | Agent 列表、能力展示、快捷操作 |
| Asset 选择器 | 🔴 P0 | Chat 中关联资产的 UI |
| 流水线页面 | 🟡 P1 | 预设流水线执行、自定义流水线编辑 |
| 采集页面 | 🟡 P1 | URL 输入、批量导入、Plugin 选择 |
| 内容处理页面 | 🟡 P1 | AI 处理操作面板 |
| 仪表盘/首页 | 🟡 P1 | 快捷入口、最近活动、统计概览 |
| Plugin 管理面板 | 🟢 P2 | Plugin 安装、配置、启用/禁用 |
| Skill 编辑器 | 🟢 P2 | 可视化 Skill 编辑 |
| 发布/导出页面 | 🟢 P2 | 多格式导出、发布 Profile 管理 |
| 移动端适配 | 🟢 P2 | 响应式布局优化 |

---

## 三、Rust 后端（Backend）

**代码路径**: `contentforge/desktop/src-tauri/src/`  
**技术栈**: Rust 1.77+ + Tauri v2.10 + tokio + sqlx  
**总行数**: ~4,000 行

### 3.1 已完成 ✅

| 功能 | 文件 | 说明 |
|------|------|------|
| 应用入口 | `lib.rs` | 初始化流程：yt-dlp 提取 → 数据库 → 队列 → IPC 注册 |
| 数据库连接 | `db/mod.rs` | 三级回退策略：app_data → cwd → in-memory |
| 数据库 Schema | `db/*.rs` | 8 张表：sessions/messages/assets/downloads/vtt/settings/agent_switches/pipeline_runs |
| IPC 命令框架 | `commands/mod.rs` | ApiResponse<T> 统一响应格式 |
| 下载命令 | `commands/download.rs` | start/cancel/get/delete/retry/open_folder |
| 视频命令 | `commands/video.rs` | get_info/get_formats/get_playlist_info |
| AI/VTT 命令 | `commands/ai.rs` | summarize/extract_audio/analyze_vtt/get_report |
| 设置命令 | `commands/settings.rs` | get/update 设置 |
| yt-dlp 下载器 | `downloader.rs` | 完整封装：参数构建、进度解析、取消、多路查找 |
| 下载队列 | `queue.rs` | FIFO 队列、并发控制（默认3）、取消、自动恢复 |
| VTT 分析 | `vtt_analysis.rs` | 字幕解析、分析报告 |
| 音频提取 | `audio_extractor.rs` | FFmpeg 音频提取 |
| 启动恢复 | `lib.rs` | 自动恢复未完成的下载任务 |
| bundled yt-dlp | `lib.rs` | 首次运行时从资源提取 yt-dlp 二进制 |
| Agent CLI 检测 | `commands/ai.rs` | detect_agent_cli 命令 |

### 3.2 进行中 🔄

| 功能 | 文件 | 状态 | 说明 |
|------|------|------|------|
| Chat 命令 | `commands/chat.rs` | 🔄 框架完成 | 13 个命令定义完成，待与 Python 引擎联调 |
| Agent 命令 | `commands/agent.rs` | 🔄 框架完成 | 5 个命令定义完成 |
| Asset 命令 | `commands/asset.rs` | 🔄 框架完成 | 7 个命令定义完成 |
| 会话 CRUD | `db/sessions.rs` | ✅ 完整 | 创建/查询/更新/删除/归档/置顶 |
| 消息 CRUD | `db/messages.rs` | ✅ 完整 | 分页查询/插入/删除 |
| 资产 CRUD | `db/assets.rs` | 🔄 基础 | 查询/插入/更新/删除骨架 |
| 下载记录 CRUD | `db/downloads.rs` | ✅ 完整 | 完整的下载记录管理 |
| Agent 切换历史 | `db/agent_switches.rs` | ✅ 完整 | 记录 Agent 切换事件 |
| Pipeline 运行记录 | `db/pipeline_runs.rs` | 🔄 基础 | 表结构完成，操作待完善 |

### 3.3 规划中 📋

| 功能 | 优先级 | 说明 |
|------|--------|------|
| Agent 运行环境 | `agent_runner.rs` | 🔴 P0 | 调用 Python Agent 引擎执行对话 |
| 资产处理管道 | `asset_processor.rs` | 🔴 P0 | 资产导入后的自动处理 |
| Rust 端流水线 | `pipeline.rs` | 🟡 P1 | 与 Python Pipeline 引擎对接 |
| 流式事件系统 | - | 🔴 P0 | message.delta / tool.call.* 等事件 |
| WebSocket 支持 | - | 🟡 P1 | Web 模式下的实时通信 |
| 文件系统监控 | - | 🟢 P2 | 监听下载目录变化 |
| 系统托盘 | - | 🟢 P2 | macOS 菜单栏/系统托盘 |
| 全局快捷键 | - | 🟢 P2 | 快捷键唤起应用 |
| 通知系统 | - | 🟢 P2 | 下载完成/处理完成通知 |

---

## 四、Python 核心引擎（Core Engine）

**代码路径**: `contentforge/core/python/contentforge/`  
**技术栈**: Python 3.10+  
**总行数**: ~9,500 行

### 4.1 数据模型层（models.py）

**状态**: ✅ **已完成**

| 功能 | 说明 |
|------|------|
| ContentType 枚举 | video/article/tweet/thread/audio/image/note |
| ContentStatus 枚举 | ingested/processing/processed/editing/ready/published/failed |
| PipelineStatus 枚举 | pending/running/completed/failed/cancelled/partial |
| SourceInfo | 来源平台/URL/作者/互动数据 |
| ContentUnit | 核心内容单元，完整数据类 |
| PipelineStep / Pipeline / PipelineRun | 流水线定义和执行 |
| PublishProfile | 发布 Profile 配置 |
| to_dict / from_dict / to_json | 完整序列化支持 |

### 4.2 配置管理（config.py）

**状态**: ✅ **已完成**

| 功能 | 说明 |
|------|------|
| AIProviderConfig | 多 Provider 配置 |
| PlatformBackendConfig | 平台后端工具路径 |
| ContentForgeConfig | 完整配置聚合 |
| ConfigManager | YAML 加载 + 环境变量覆盖 |
| 环境变量映射 | CF_* 前缀完整映射 |
| get_config / reload_config | 全局便捷函数 |

### 4.3 AI 模块（ai/）

**状态**: 🔄 **部分完成（~60%）**

| 子模块 | 状态 | 代码量 | 已完成 | 未完成 |
|--------|------|--------|--------|--------|
| `agent.py` | ✅ | ~300行 | AgentRole/AgentCapability/AgentRegistry/意图路由 | - |
| `agent_registry.py` | ✅ | ~400行 | 单例注册表/SQLite 持久化/SkillRegistry | - |
| `agent_router.py` | ✅ | ~350行 | 路由决策/多 Agent 协作/自动编排 | - |
| `agent_session.py` | ✅ | ~600行 | ReAct 会话/工具调用/流式输出/内置工具 | - |
| `chat_engine.py` | 🔄 | ~200行 | 对话引擎框架，待与 Rust 联调 | 流式集成 |
| `content_access.py` | ✅ | ~500行 | SQLite 查询/文件读取/FTS5 检索/安全策略 | - |
| `asset_retriever.py` | ✅ | ~400行 | 智能检索/评分/关系图谱/推荐 | - |
| `video_inspector.py` | ✅ | ~400行 | ffprobe 元数据/缩略图/关键帧/字幕 | - |
| `context.py` | ✅ | ~200行 | TokenBudget/上下文层级/截断策略 | - |
| `session.py` | ✅ | ~250行 | 会话管理/消息历史/资产关联 | - |
| `router.py` | 🔄 | ~150行 | 动态路由框架 | 与前端联调 |
| `tools.py` | ✅ | ~200行 | 工具定义注册 | 更多工具 |
| `skills/` | 🔄 | ~600行 | Loader/Executor/Context 框架完成 | 更多 Skill 模板 |

### 4.4 采集模块（ingestion/）

**状态**: 🔄 **部分完成（~50%）**

| 子模块 | 状态 | 说明 |
|--------|------|------|
| `agent_reach.py` | 🔄 | agent-reach CLI 封装框架，待集成测试 |
| `web_scraper.py` | 🔄 | Jina Reader 封装框架 |
| `transcriber.py` | ✅ | 视频字幕提取（yt-dlp + youtube-transcript-api） |
| `health_check.py` | ✅ | 平台健康检查 |

**规划中采集源**:

| 平台 | 状态 | 优先级 |
|------|------|--------|
| YouTube | ✅ | 通过 yt-dlp 已实现 |
| Twitter/X | 📋 | 🔴 P0 — agent-reach 集成 |
| RSS Feed | 📋 | 🟡 P1 — feedparser |
| 网页 | 📋 | 🟡 P1 — Jina Reader / crawl4ai |
| 播客 | 📋 | 🟢 P2 |
| Reddit | 📋 | 🟢 P2 |
| Hacker News | 📋 | 🟢 P2 |

### 4.5 处理模块（processing/）

**状态**: 🔄 **部分完成（~60%）**

| 子模块 | 状态 | 说明 |
|--------|------|------|
| `ai_engine.py` | ✅ | 多 Provider 抽象（OpenAI/Claude/Ollama） |
| `summarizer.py` | ✅ | 结构化摘要生成 |
| `analyzer.py` | ✅ | 内容分析（主题/情感/关键词） |
| `translator.py` | ✅ | 多语言翻译 |
| `xiaohongshu_converter.py` | ✅ | 小红书风格文案转换 |

### 4.6 流水线模块（pipeline/）

**状态**: 🔄 **框架完成（~40%）**

| 子模块 | 状态 | 说明 |
|--------|------|------|
| `engine.py` | 🔄 | DAG 执行引擎框架，待完善错误恢复 |
| `presets.py` | 🔄 | 预设流水线定义，待丰富模板 |
| `runner.py` | 🔄 | 运行器框架，待完善生命周期管理 |

**预设流水线状态**:

| Pipeline | 状态 | 说明 |
|----------|------|------|
| `twitter_to_xiaohongshu` | 📋 | 规划中 |
| `youtube_to_notes` | 📋 | 规划中 |
| `rss_to_digest` | 📋 | 规划中 |
| `web_to_summary` | 📋 | 规划中 |
| `ai_processing` | 📋 | 规划中 |

### 4.7 CLI 桥接（cli/）

**状态**: 🔄 **框架完成（~50%）**

| 子模块 | 状态 | 说明 |
|--------|------|------|
| `bridge.py` | ✅ | PythonBridge 实现（Go-Python 通信） |
| `scrape.py` | 🔄 | 采集命令框架 |
| `process.py` | 🔄 | 处理命令框架 |
| `publish.py` | 🔄 | 发布命令框架 |
| `pipeline.py` | 🔄 | 流水线命令框架 |

---

## 五、浏览器扩展（Extension）

**代码路径**: `contentforge/extension/`  
**状态**: 📋 **规划中**

| 功能 | 状态 | 说明 |
|------|------|------|
| Manifest V3 配置 | 📋 | 扩展基础配置 |
| Content Script | 📋 | 页面 URL 提取 |
| Popup UI | 📋 | 快速采集浮窗 |
| 与 Desktop 通信 | 📋 | 通过 Native Messaging |

---

## 六、Go CLI

**代码路径**: `contentforge/cli/`（规划中）或复用 `vYtDL/`  
**状态**: 📋 **规划中**

| 功能 | 状态 | 说明 |
|------|------|------|
| Cobra 命令框架 | 📋 | 根命令/子命令结构 |
| scrape 命令 | 📋 | URL 采集 |
| process 命令 | 📋 | AI 处理 |
| publish 命令 | 📋 | 内容发布 |
| pipeline 命令 | 📋 | 流水线管理 |
| PythonBridge | 📋 | Go-Python 通信桥接 |

---

## 七、外部仓库整合

**代码路径**: `contentforge/external-repos/`  
**状态**: 🔄 **分析完成，待整合**

| 仓库 | 整合价值 | 状态 | 计划整合内容 |
|------|---------|------|-------------|
| skill-studio | 🔴 高 | 📋 | Skill 版本管理、45+ 平台检测 |
| frameflow | 🔴 高 | 📋 | FFmpeg 封装、场景检测、时间线模型 |
| capsummarize | 🔴 高 | 📋 | 34 种 AI Prompt 模板、VTT 解析器 |
| youtube-rag-system | 🔴 高 | 📋 | 5层 fallback 转录、RAG Pipeline |
| OpenMontage | 🔴 高 | 📋 | Remotion 渲染、质量门控、预算控制 |
| skill-zoo | 🟡 中 | 📋 | IPC 组织模式参考 |
| Video-Note-Extractor | 🟢 低 | 📋 | Prompt 模板参考 |

---

## 八、汇总表

### 8.1 按模块统计

| 模块 | 总功能点 | 已完成 | 进行中 | 规划中 | 完成率 |
|------|---------|--------|--------|--------|--------|
| 前端 (Frontend) | 18 | 9 | 5 | 4 | 50% |
| Rust 后端 | 22 | 13 | 6 | 3 | 59% |
| Python 核心 | 35 | 18 | 10 | 7 | 51% |
| 浏览器扩展 | 4 | 0 | 0 | 4 | 0% |
| Go CLI | 6 | 0 | 0 | 6 | 0% |
| 外部整合 | 7 | 0 | 0 | 7 | 0% |
| **总计** | **92** | **40** | **21** | **31** | **43%** |

### 8.2 关键未完成项（按优先级）

#### 🔴 P0 — 阻塞项

1. **Chat UI 完整实现** — 消息列表、流式渲染、工具调用卡片
2. **Agent 运行环境联调** — Rust `agent_runner.rs` ↔ Python `chat_engine.py`
3. **流式事件系统** — `message.delta` / `tool.call.*` 端到端贯通
4. **Twitter Plugin 实现** — agent-reach 集成，完成第一个非 YouTube 采集源
5. **资产 CRUD 完整实现** — Rust 后端 + 前端联调

#### 🟡 P1 — 重要项

6. **流水线引擎完善** — 错误恢复、预设模板丰富化
7. **RSS/Web Plugin** — 扩展采集源覆盖
8. **Plugin 管理面板** — 安装/配置/启用禁用
9. **视频分析深度集成** — 转录 → 摘要 → 笔记 Pipeline
10. **外部仓库整合 Phase 1** — capsummarize Prompt 模板 + youtube-rag-system 转录

#### 🟢 P2 — 增强项

11. Chrome 扩展开发
12. Go CLI 完整实现
13. 系统托盘/全局快捷键
14. 移动端适配
15. 多语言完整支持

---

## 九、相关文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 项目愿景 | [00-PROJECT-VISION.md](00-PROJECT-VISION.md) | 愿景、核心概念 |
| 架构总览 | [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) | 系统架构 |
| Plugin 系统 | [03-PLUGIN-SYSTEM.md](03-PLUGIN-SYSTEM.md) | Plugin 架构设计 |
| Skill 系统 | [04-SKILL-SYSTEM.md](04-SKILL-SYSTEM.md) | Skill 定义与执行 |
| 内容生命周期 | [05-CONTENT-LIFECYCLE.md](05-CONTENT-LIFECYCLE.md) | ContentUnit 生命周期 |
| 路线图 | [06-ROADMAP.md](06-ROADMAP.md) | 开发计划 |
| 术语表 | [07-TERMINOLOGY.md](07-TERMINOLOGY.md) | 术语定义 |
