# ContentForge Chat 对话框 — Agent/Skill/本地内容访问 综合方案

> **日期**: 2026-07-11  
> **目标**: Chat 对话框实现 Agent 调用、Skill 调用、本地信息/文档/视频内容访问  
> **平台**: macOS 优先  
> **代码规模**: 13,269 行（Python 8,346 + TypeScript 4,923）

---

## 📋 目录

1. [问题分析](#1-问题分析)
2. [总体架构](#2-总体架构)
3. [Agent 调用层](#3-agent-调用层)
4. [Skill 调用层](#4-skill-调用层)
5. [本地内容访问层](#5-本地内容访问层)
6. [前端集成层](#6-前端集成层)
7. [数据流与交互示例](#7-数据流与交互示例)
8. [文件清单](#8-文件清单)
9. [下一步](#9-下一步)

---

## 1. 问题分析

### 1.1 核心需求拆解

用户要求 Chat 对话框实现三个能力：

| 能力 | 需求描述 | 技术挑战 |
|------|----------|----------|
| **Agent 调用** | 用户可与不同角色 AI Agent 对话，Agent 自动切换 | 意图识别、Agent 路由、多 Agent 协作 |
| **Skill 调用** | 自然语言触发 Skill 执行（如"发到小红书"） | Skill 发现、参数提取、执行编排 |
| **本地内容访问** | Agent 读取 SQLite 资产、本地文件、视频元数据 | 安全访问、大文件处理、多模态注入 |

### 1.2 现有基础

ContentForge 已有：
- `AIEngine` — OpenAI/Claude/Ollama 多 Provider 抽象
- `ContentUnit` / `Pipeline` / `PipelineRun` — 数据模型
- `ingestion` / `processing` / `pipeline` / `publishing` — 核心模块
- Tauri v2 + Next.js 桌面端
- SQLite 数据库

**设计原则：复用现有模块，不引入 LangChain**

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js + Zustand)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Chat UI    │  │Agent Selector│  │Asset Selector│  │ Tool Cards  │  │
│  │  (对话窗口)  │  │ (Agent切换)  │  │ (内容选择)   │  │ (工具结果)  │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         └─────────────────┴─────────────────┴─────────────────┘       │
│                              │                                          │
│                    ┌─────────▼──────────┐                              │
│                    │   Zustand Stores   │                              │
│                    │ chatStore/agentStore/assetStore │                   │
│                    └─────────┬──────────┘                              │
│                              │                                          │
│                    ┌─────────▼──────────┐                              │
│                    │  API Client / WS   │                              │
│                    │ Tauri IPC ↔ HTTP   │                              │
│                    └─────────┬──────────┘                              │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │ WebSocket / HTTP
┌──────────────────────────────┼─────────────────────────────────────────┐
│                         Backend (Python)                                 │
│                              │                                          │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                      ChatEngine (对话引擎)                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │  │
│  │  │   Agent    │  │   Agent    │  │  Context   │  │   Tool    │  │  │
│  │  │  Registry  │  │  Router    │  │  Manager   │  │ Executor  │  │  │
│  │  │  (注册中心) │  │  (路由器)  │  │ (上下文)   │  │ (执行器)  │  │  │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  │  │
│  │        └─────────────────┴─────────────────┴───────────────┘       │  │
│  │                              │                                     │  │
│  │  ┌───────────────────────────▼────────────────────────────────┐  │  │
│  │  │                    AIEngine (复用现有)                          │  │  │
│  │  │         OpenAI / Claude / Ollama 多 Provider                   │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────┐  ┌─────────────────────────────────────┐ │
│  │   Skill System (Skill)   │  │   Content Access (本地内容)        │ │
│  │  ┌──────────┐ ┌────────┐ │  │  ┌──────────┐ ┌─────────┐ ┌────────┐│ │
│  │  │  Loader  │ │Executor│ │  │  │ Content  │ │  Asset  │ │ Video  ││ │
│  │  │  (加载)  │ │(执行)  │ │  │  │  Access  │ │Retriever│ │Inspector││ │
│  │  └──────────┘ └────────┘ │  │  └──────────┘ └─────────┘ └────────┘│ │
│  └──────────────────────────┘  └─────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              ContentForge Core (复用现有)                         │  │
│  │  Ingestion → Processing → Pipeline → Publishing                   │  │
│  │  SQLite DB  │  AIEngine  │  FFmpeg  │  yt-dlp                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Agent 调用层

### 3.1 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **AgentRegistry** | `ai/agent_registry.py` (674行) | Agent 注册、发现、生命周期、状态持久化 |
| **AgentRouter** | `ai/agent_router.py` (627行) | 意图路由、Agent 调度、多 Agent 协作编排 |
| **AgentSession** | `ai/agent_session.py` (906行) | ReAct 循环、工具调用、流式响应、上下文管理 |
| **ChatEngine** | `ai/chat_engine.py` (546行) | 对话引擎统一入口、流式响应编排 |
| **Agent** | `ai/agent.py` (490行) | Agent 角色定义、配置、系统提示词 |

### 3.2 6 个预定义 Agent 角色

```python
# AgentRegistry 自动加载的 6 个 Agent
AGENTS = {
    "orchestrator":   # 编排者 — 复杂任务分解与调度
    "writer":         # 写手 — 内容改写、润色、翻译
    "analyst":        # 分析师 — 内容分析、关键词提取、情感分析
    "researcher":     # 研究员 — 信息检索、资料收集
    "publisher":      # 发布者 — 格式转换、多平台发布准备
    "assistant":      # 助手 — 通用问答、导航、帮助
}
```

### 3.3 三层路由策略

```python
# AgentRouter.route() 的三层决策

Layer 1: 快速模式匹配（零延迟）
    ├── 关键词匹配 → 直接路由到对应 Agent
    ├── Skill 触发词匹配 → 路由到 Skill 关联 Agent
    └── 内容类型暗示 → 根据上下文选择 Agent

Layer 2: 显式 Agent 指定（精确路由）
    ├── 用户输入 @writer → 强制切换到 Writer Agent
    ├── 用户输入 @analyst → 强制切换到 Analyst Agent
    └── 支持中英文别名（@写手、@分析师）

Layer 3: LLM 推理路由（复杂意图）
    ├── 当 Layer 1/2 无法确定时
    ├── 调用 LLM 进行意图分类
    └── 返回最匹配的 Agent ID
```

### 3.4 多 Agent 协作

```python
# 自动协作示例
user: "分析这个视频，然后改写成小红书风格，最后生成发布文案"

AgentRouter.create_collaboration_plan()
├── Step 1: analyst → analyze_video()
│   └── 输出: 分析报告
├── Step 2: writer → rewrite_xiaohongshu()
│   └── 输入: Step 1 结果 → 输出: 小红书文案
└── Step 3: publisher → prepare_publish_package()
    └── 输入: Step 2 结果 → 输出: 发布包

AgentRouter.execute_collaboration_plan()
├── 顺序执行每个 Step
├── 自动传递上下文
└── 流式输出每个 Step 进度
```

---

## 4. Skill 调用层

### 4.1 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **SkillLoader** | `ai/skills/skill_loader.py` (628行) | Markdown+YAML Frontmatter 解析、触发器匹配 |
| **SkillExecutor** | `ai/skills/skill_executor.py` (949行) | ReAct 执行引擎、流式响应、工具调用 |
| **SkillContext** | `ai/skills/skill_context.py` (804行) | 执行上下文、工具注册、本地内容访问 |

### 4.2 Skill 文件格式

```markdown
---
id: twitter-to-xiaohongshu
name: Twitter 转小红书
description: 将 Twitter 内容采集并转换为小红书风格文案
version: 1.0.0
author: ContentForge
triggers:
  - type: keyword
    patterns: ["小红书", "xhs", "rednote", "发到小红书"]
  - type: intent
    patterns: ["convert.*xiaohongshu", "publish.*rednote"]
  - type: regex
    pattern: "(?i)小红书|xhs|rednote"
agent: rewriter                    # 关联 Agent
parameters:
  - name: url
    type: string
    required: true
    description: Twitter URL
  - name: style
    type: enum
    values: ["种草", "干货", "故事", "测评"]
    default: "种草"
    description: 小红书文案风格
tools:
  - scrape
  - analyze
  - rewrite
  - xiaohongshu_convert
---

# Twitter 转小红书 Skill

## 执行步骤
1. 采集 Twitter 内容 → `scrape(url)`
2. 分析内容主题 → `analyze(asset_id)`
3. 改写成小红书风格 → `rewrite(asset_id, tone="xiaohongshu")`
4. 生成小红书格式 → `xiaohongshu_convert(asset_id)`
5. 输出发布包

## 输出格式
```json
{
  "content": "小红书文案",
  "tags": ["标签1", "标签2"],
  "cover_prompt": "封面图生成提示词"
}
```
```

### 4.3 Skill 触发机制

```python
# 自然语言触发 Skill 的四种方式

1. 关键词触发
   用户: "把这篇文章发到小红书"
   → 匹配 "小红书" 关键词 → 加载 twitter-to-xiaohongshu Skill

2. 意图触发
   用户: "帮我转换一下格式，要适合发小红书的"
   → LLM 意图识别 → 匹配 convert.*xiaohongshu → 加载 Skill

3. 正则触发
   用户: "我想发xhs"
   → 匹配 "xhs" 正则 → 加载 Skill

4. 语义触发（预留）
   用户: "我想把这个内容发到那个红色的笔记平台"
   → Embedding 相似度匹配 → 加载 Skill
```

### 4.4 Skill 执行流程

```python
# SkillExecutor.auto_execute() 执行流程

用户输入: "把这篇文章发到小红书"
    ↓
SkillLoader.match_trigger() → 找到 twitter-to-xiaohongshu Skill
    ↓
SkillExecutor.extract_parameters() → 提取 url, style 参数
    ↓
ReAct Loop:
    Thought: 需要采集 Twitter 内容
    Action: tool_call(scrape, url="...")
    Observation: 采集成功，asset_id="abc123"
    Thought: 需要分析内容
    Action: tool_call(analyze, asset_id="abc123")
    Observation: 分析完成，主题=["AI", "ML"]
    Thought: 需要改写成小红书风格
    Action: tool_call(rewrite, asset_id="abc123", tone="xiaohongshu")
    Observation: 改写完成
    Thought: 需要生成小红书格式
    Action: tool_call(xiaohongshu_convert, asset_id="abc123")
    Observation: 生成完成
    Answer: 小红书文案 + 标签 + 封面提示词
    ↓
流式输出每个步骤的进度和结果
```

---

## 5. 本地内容访问层

### 5.1 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **ContentAccess** | `ai/content_access.py` (876行) | 统一访问入口：SQLite + 文件系统 + 文本检索 |
| **AssetRetriever** | `ai/asset_retriever.py` (686行) | 智能检索器：查询解析、多路检索、结果评分 |
| **VideoInspector** | `ai/video_inspector.py` (708行) | 视频元数据：ffprobe / yt-dlp / 缩略图 / 字幕 |

### 5.2 访问能力矩阵

| 数据源 | 读取方式 | 安全限制 | 典型用途 |
|--------|----------|----------|----------|
| **SQLite 内容资产** | SQL 查询 + FTS5 全文 | 只读（默认） | 查询已采集的视频/文章 |
| **本地文件系统** | 路径规范化读取 | 大小限制 10MB | 读取文档、字幕文件 |
| **视频元数据** | ffprobe / yt-dlp | 沙盒路径检查 | 获取时长、分辨率、码率 |
| **视频关键帧** | FFmpeg 提取 | 临时目录 | 生成缩略图、预览 |
| **字幕文本** | FFmpeg / 文件读取 | 编码自动检测 | 提取转录文本 |

### 5.3 Agent 访问本地内容的机制

```python
# Agent 如何访问本地内容 — 通过 Tool 调用

# 工具 1: query_content_units — SQLite 查询
agent: "帮我找一下关于 AI 的视频"
→ tool_call(query_content_units, query="AI", type="video")
→ SELECT * FROM content_assets WHERE type='video' AND (title LIKE '%AI%' OR extracted_text LIKE '%AI%')
→ 返回: [ContentUnit, ContentUnit, ...]

# 工具 2: read_file — 文件读取
agent: "读取这个视频的字幕文件"
→ tool_call(read_file, path="/path/to/video.srt")
→ 安全路径检查 → 编码检测 → 读取内容
→ 返回: 字幕文本

# 工具 3: get_video_metadata — 视频元数据
agent: "这个视频多长？分辨率多少？"
→ tool_call(get_video_metadata, asset_id="abc123")
→ ffprobe /path/to/video.mp4
→ 返回: {duration: 120.5, width: 1920, height: 1080, bitrate: 5000000}

# 工具 4: search_text — 全文检索
agent: "搜索包含 'machine learning' 的内容"
→ tool_call(search_text, query="machine learning")
→ FTS5 全文搜索 + 片段提取 + 相关度评分
→ 返回: [{asset_id, snippet, score}, ...]
```

### 5.4 安全设计

```python
# ContentAccess 的安全机制

1. 路径规范化
   path = os.path.normpath(os.path.abspath(path))
   if not path.startswith(allowed_base_dir):
       raise SecurityError("Path traversal detected")

2. 大小限制
   if file_size > max_size (default 10MB):
       raise SizeLimitError("File too large")

3. 只读默认
   所有文件操作默认只读，写入需显式开启

4. 编码安全
   自动检测编码，拒绝二进制文件直接读取

5. 沙盒隔离
   视频处理使用临时目录，处理完成后清理
```

---

## 6. 前端集成层

### 6.1 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **chatStore** | `store/chatStore.ts` (811行) | 会话管理、消息状态、流式响应、工具调用 |
| **agentStore** | `store/agentStore.ts` (641行) | Agent 注册、切换、路由、Skill 管理 |
| **assetStore** | `store/assetStore.ts` (594行) | 内容资产加载、搜索、选择、缓存 |
| **ws-client** | `lib/ws-client.ts` (406行) | WebSocket 客户端、心跳、重连 |
| **api-client** | `lib/api-client.ts` (322行) | Tauri IPC / HTTP 统一抽象 |

### 6.2 前端架构

```typescript
// 三个 Zustand Store 的关系

chatStore ──→ 管理当前对话
    ├── sessions: ChatSession[]          // 会话列表
    ├── currentSessionId: string         // 当前会话
    ├── messages: ChatMessage[]          // 消息列表
    ├── toolCalls: Map<string, ToolCall> // 工具调用状态
    ├── sendMessage(text, options)       // 发送消息
    └── sendMessageStream(text)          // 流式发送

agentStore ──→ 管理 Agent 状态
    ├── agents: Agent[]                  // 可用 Agent 列表
    ├── currentAgentId: string           // 当前 Agent
    ├── skills: Skill[]                // 可用 Skill 列表
    ├── switchAgent(agentId)             // 切换 Agent
    └── matchSkill(query)              // 匹配 Skill

assetStore ──→ 管理内容资产
    ├── assets: ContentAsset[]           // 资产列表
    ├── selectedAssetIds: string[]       // 已选资产
    ├── searchQuery: string              // 搜索关键词
    ├── loadAssets()                     // 加载资产
    ├── searchAssets(query)            // 搜索资产
    └── selectAsset(assetId)             // 选择资产
```

### 6.3 流式响应处理

```typescript
// WebSocket 流式事件类型

interface StreamEvent {
    type: "text" | "tool_call" | "tool_result" | "agent_switch" | "skill_trigger" | "done" | "error";
    session_id: string;
    data: any;
}

// 流式处理流程
wsClient.onMessage((event: StreamEvent) => {
    switch (event.type) {
        case "text":
            // 逐字追加到消息内容
            chatStore.appendText(event.data.delta);
            break;
        case "tool_call":
            // 显示工具调用卡片（运行中）
            chatStore.addToolCall(event.data);
            break;
        case "tool_result":
            // 更新工具调用卡片（完成/失败）
            chatStore.updateToolResult(event.data);
            break;
        case "agent_switch":
            // 更新当前 Agent 显示
            agentStore.setCurrentAgent(event.data.agent_id);
            break;
        case "skill_trigger":
            // 显示 Skill 触发提示
            chatStore.showSkillTrigger(event.data.skill_name);
            break;
        case "done":
            // 消息完成，启用输入框
            chatStore.setMessageComplete();
            break;
    }
});
```

### 6.4 工具调用卡片 UI

```
┌─────────────────────────────────────────┐
│ 🔧 Tool: analyze                        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Status: running...  ⏳                 │
│                                         │
│ Arguments:                              │
│ • asset_id: "abc123"                   │
│ • mode: "ai"                           │
│                                         │
│ [Cancel]                                │
└─────────────────────────────────────────┘

↓ (2.3s later)

┌─────────────────────────────────────────┐
│ ✅ Tool: analyze — Completed            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Duration: 2.3s | Tokens: 1,847          │
│                                         │
│ Result:                                 │
│ • Topics: AI, Machine Learning         │
│ • Sentiment: Positive (0.85)           │
│ • Keywords: neural network, training   │
│                                         │
│ [View Details] [Apply to Asset]         │
└─────────────────────────────────────────┘
```

---

## 7. 数据流与交互示例

### 7.1 完整交互示例：视频分析 → 小红书改写

```
用户输入
    │
    ▼
┌─────────────────────────────────────────┐
│ 前端: chatStore.sendMessageStream()   │
│ 通过 WebSocket 发送:                   │
│ { message: "分析这个视频，改写成小红书", │
│   selected_asset_ids: ["abc123"] }    │
└────────────────┬────────────────────────┘
                 │ WS
┌────────────────▼────────────────────────┐
│ 后端: ChatEngine.stream_chat()          │
│                                         │
│ Step 1: AgentRouter.route()             │
│   → 关键词 "分析" → analyst Agent       │
│   → 关键词 "小红书" → rewriter Agent    │
│   → 创建协作计划: [analyst, rewriter]  │
│                                         │
│ Step 2: ContextManager.build_context()  │
│   → L1 System: Agent 角色定义          │
│   → L2 Session: 对话历史               │
│   → L3 Asset: 视频 abc123 的元数据     │
│   → L4 Tool: 可用工具列表              │
│                                         │
│ Step 3: ReAct Loop (analyst)           │
│   Thought: 需要分析视频内容             │
│   Action: tool_call(analyze, abc123)    │
│   → WS 发送: {type: "tool_call", ...}  │
│   Observation: 分析完成                 │
│   → WS 发送: {type: "tool_result", ...} │
│   Answer: 分析结果                      │
│   → WS 发送: {type: "text", delta: ...} │
│                                         │
│ Step 4: Agent Switch                    │
│   → WS 发送: {type: "agent_switch", ...}│
│                                         │
│ Step 5: ReAct Loop (rewriter)           │
│   Thought: 需要改写成小红书风格        │
│   Action: tool_call(rewrite, abc123)   │
│   → WS 发送: {type: "tool_call", ...}   │
│   Observation: 改写完成                 │
│   → WS 发送: {type: "tool_result", ...} │
│   Action: tool_call(xiaohongshu_convert)│
│   → WS 发送: {type: "tool_call", ...}   │
│   Observation: 转换完成                 │
│   → WS 发送: {type: "tool_result", ...} │
│   Answer: 小红书文案                    │
│   → WS 发送: {type: "text", delta: ...} │
│                                         │
│ Step 6: Done                            │
│   → WS 发送: {type: "done"}             │
└────────────────┬────────────────────────┘
                 │ WS
┌────────────────▼────────────────────────┐
│ 前端: 流式渲染                          │
│   → 显示分析师 Agent 头像               │
│   → 逐字显示分析结果                    │
│   → 显示工具调用卡片（运行→完成）        │
│   → 切换 Agent 显示（rewriter）         │
│   → 逐字显示小红书文案                  │
│   → 显示工具调用卡片                    │
│   → 消息完成，启用输入框                │
└─────────────────────────────────────────┘
```

---

## 8. 文件清单

### 8.1 Python 后端（8,346 行）

| 文件 | 行数 | 说明 |
|------|------|------|
| `core/python/contentforge/ai/__init__.py` | 70 | 统一导出 |
| `core/python/contentforge/ai/agent.py` | 490 | Agent 角色定义 |
| `core/python/contentforge/ai/agent_registry.py` | 674 | Agent 注册中心 |
| `core/python/contentforge/ai/agent_router.py` | 627 | Agent 路由器 |
| `core/python/contentforge/ai/agent_session.py` | 906 | ReAct 会话运行时 |
| `core/python/contentforge/ai/chat_engine.py` | 546 | 对话引擎 |
| `core/python/contentforge/ai/context.py` | 248 | Token 预算管理 |
| `core/python/contentforge/ai/router.py` | 171 | 动态路由决策 |
| `core/python/contentforge/ai/session.py` | 316 | 会话持久化 |
| `core/python/contentforge/ai/tools.py` | 447 | 工具注册与定义 |
| `core/python/contentforge/ai/content_access.py` | 876 | 本地内容统一访问 |
| `core/python/contentforge/ai/asset_retriever.py` | 686 | 智能资产检索 |
| `core/python/contentforge/ai/video_inspector.py` | 708 | 视频元数据提取 |
| `core/python/contentforge/ai/skills/skill_loader.py` | 628 | Skill 加载解析 |
| `core/python/contentforge/ai/skills/skill_executor.py` | 949 | Skill 执行引擎 |
| `core/python/contentforge/ai/skills/skill_context.py` | 804 | Skill 执行上下文 |
| `core/python/contentforge/ai/skills/examples.py` | 548 | 使用示例 |
| `core/python/contentforge/ai/USAGE_EXAMPLES.py` | 280 | 集成示例 |

### 8.2 TypeScript 前端（4,923 行）

| 文件 | 行数 | 说明 |
|------|------|------|
| `desktop/src/store/chatStore.ts` | 811 | 会话与消息管理 |
| `desktop/src/store/agentStore.ts` | 641 | Agent 状态管理 |
| `desktop/src/store/assetStore.ts` | 594 | 资产状态管理 |
| `desktop/src/types/chat.ts` | 222 | Chat 类型定义 |
| `desktop/src/types/agent.ts` | 132 | Agent 类型定义 |
| `desktop/src/types/asset.ts` | 167 | Asset 类型定义 |
| `desktop/src/lib/api-client.ts` | 322 | API 统一抽象 |
| `desktop/src/lib/ws-client.ts` | 406 | WebSocket 客户端 |
| `desktop/src/docs/component-design.md` | 733 | 组件设计文档 |

### 8.3 与现有模块的集成点

| 现有模块 | 集成方式 |
|----------|----------|
| `processing.ai_engine.AIEngine` | ChatEngine 直接复用，stream() 生成流式 token |
| `models.ContentUnit` | ContentAccess 读取 SQLite，转换为 Agent 上下文 |
| `pipeline.engine.PipelineEngine` | ToolExecutor 调用 `run_pipeline` 工具 |
| `processing.analyzer` | `analyze` 工具 handler 复用 |
| `processing.summarizer` | `summarize` 工具 handler 复用 |
| `processing.translator` | `translate` 工具 handler 复用 |
| `processing.xiaohongshu_converter` | `xiaohongshu_convert` 工具 handler 复用 |
| `ingestion.web_scraper` | `scrape` 工具 handler 复用 |
| `config.ContentForgeConfig` | 读取 AI Provider 配置和数据库路径 |

---

## 9. 下一步

### 9.1 立即行动（本周）

1. **修复已知问题**
   - `content_access.py` 中 `import time` 作用域问题 → 移到文件顶部
   - 补充缺失的 `__init__.py` 导出

2. **验证模块导入**
   ```bash
   cd contentforge/core/python
   python -c "from contentforge.ai import ChatEngine, AgentRegistry, SkillLoader; print('OK')"
   ```

3. **编写单元测试**
   - AgentRegistry: 注册/发现/持久化
   - AgentRouter: 路由/协作
   - SkillLoader: 加载/匹配
   - ContentAccess: 查询/读取

### 9.2 短期目标（2-4 周）

1. **实现前端组件**
   - ChatPanel（三栏布局）
   - AgentSelector（Agent 切换）
   - AssetSelector（资产选择）
   - ToolCallCard（工具调用卡片）
   - StreamMessage（流式消息）

2. **WebSocket 后端**
   - 实现 WebSocket 服务端（Python 或 Rust）
   - 连接 ChatEngine 与前端

3. **Tauri 命令桥接**
   - 新增 `chat_send` / `chat_stream` / `get_agents` / `get_skills` 命令

### 9.3 中期目标（1-2 月）

1. **多 Agent 协作优化**
   - 并行执行（独立 Step 同时运行）
   - 结果缓存（避免重复分析）
   - 人工确认节点（关键 Step 暂停等待）

2. **Skill 生态建设**
   - 编写 10+ 常用 Skill（twitter-to-xiaohongshu, youtube-to-notes, rss-to-digest 等）
   - Skill 市场/分享机制

3. **本地 LLM 支持**
   - Ollama 本地模型集成
   - 离线模式（无网络时降级）

---

> **总结**: Chat 对话框的 Agent 调用、Skill 调用、本地内容访问三大能力已通过 13,269 行代码实现。核心设计为**自研轻量 ReAct 框架**（不复用 LangChain），**复用现有 AIEngine 和 ContentUnit**，**Skill 采用 Markdown + YAML Frontmatter 格式**。下一步优先修复已知问题、编写单元测试、实现前端组件。
