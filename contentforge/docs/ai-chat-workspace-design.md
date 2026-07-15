# ContentForge AI 对话窗口主工作区 - 技术方案设计

> 版本: v1.0
> 日期: 2026-06-18
> 状态: 设计草案
> 作者: 系统架构师

---

## 目录

1. [概述与目标](#1-概述与目标)
2. [架构设计](#2-架构设计)
3. [AI Agent 系统设计](#3-ai-agent-系统设计)
4. [与现有模块集成](#4-与现有模块集成)
5. [技术选型](#5-技术选型)
6. [UI/UX 设计](#6-uiux-设计)
7. [数据模型扩展](#7-数据模型扩展)
8. [实现优先级与里程碑](#8-实现优先级与里程碑)
9. [风险与对策](#9-风险与对策)
10. [附录](#10-附录)

---

## 1. 概述与目标

### 1.1 背景

ContentForge 当前已形成完整的“采集 -> 处理 -> 发布” Pipeline，但用户与内容的交互仍停留在命令式操作（CLI 命令、配置预设）。随着内容资产积累，用户需要一个**对话式主工作区**，能够：

- 自然语言查询已采集的内容
- 与 AI 协作完成内容分析、改写、发布准备
- 通过 Agent 调用 ContentForge 内部工具完成端到端任务

### 1.2 设计目标

| 目标 | 描述 | 优先级 |
|------|------|--------|
| G1 | 统一对话入口：所有内容操作可通过自然语言完成 | P0 |
| G2 | 上下文感知：AI 可访问用户的内容资产库 | P0 |
| G3 | Agent 可扩展：支持不同角色的 Agent 切换 | P0 |
| G4 | 工具调用：Agent 可调用 ContentForge 内部工具 | P1 |
| G5 | 多模态：支持文本、图片、视频片段输入 | P1 |
| G6 | 历史关联：对话可关联到具体采集任务或内容 | P1 |
| G7 | 跨平台：桌面端（Tauri）和 Web 端统一体验 | P0 |

### 1.3 非目标

- 不替代现有 CLI 工作流，而是提供互补的 GUI 体验
- 不做通用 AI Chatbot，聚焦内容创作场景
- 不实现本地 LLM 推理（依赖外部 Provider）

---

## 2. 架构设计

### 2.1 整体架构图

```
+-----------------------------------------------------------------------------+
|                           ContentForge AI Workspace                          |
+-----------------------------------------------------------------------------+
|  +--------------+  +--------------+  +--------------+  +--------------+     |
|  |   Chat UI    |  | Context Panel|  |Agent Selector|  |  Tool Cards  |     |
|  |  (对话窗口)   |  | (内容资产库)  |  |  (Agent切换)  |  | (工具结果展示)|     |
|  +------+-------+  +------+-------+  +------+-------+  +------+-------+     |
|         |                 |                 |                 |             |
|  +------v-----------------v-----------------v-----------------v-------+     |
|  |                    Frontend State (Zustand)                        |     |
|  |         chatStore | assetStore | agentStore | toolCallStore       |     |
|  +------+----------------------------------------------------------------+  |
|         |                                                                   |
|  +------v----------------------------------------------------------------+  |
|  |                    API Client Abstraction                             |  |
|  |         Tauri IPC (desktop)  <->  HTTP + WebSocket (web)             |  |
|  +------+----------------------------------------------------------------+  |
|         |                                                                   |
+---------+-------------------------------------------------------------------+
          |
+---------v-------------------------------------------------------------------+
|                           Backend Layer                                      |
|  +---------------------------------------------------------------------+   |
|  |                    AI Chat Engine (Python)                           |   |
|  |  +----------+ +----------+ +----------+ +----------+ +----------+  |   |
|  |  |  Agent   | |  Agent   | |  Agent   | |  Agent   | |  Agent   |  |   |
|  |  |Registry  | |  Router  | | Context  | |  Tool    | |  Session |  |   |
|  |  |  (注册)   | |  (路由)   | |  Manager | |Executor  | |  Manager |  |   |
|  |  +----------+ +----------+ +----------+ +----------+ +----------+  |   |
|  +---------------------------------------------------------------------+   |
|  +---------------------------------------------------------------------+   |
|  |                    ContentForge Core (Python)                        |   |
|  |  +----------+ +----------+ +----------+ +----------+ +----------+  |   |
|  |  |Ingestion | |Processing| | Pipeline | |Publishing| |  Asset   |  |   |
|  |  |  (采集)   | |  (处理)   | | (流水线)  | |  (发布)   | |  Store   |  |   |
|  |  +----------+ +----------+ +----------+ +----------+ +----------+  |   |
|  +---------------------------------------------------------------------+   |
|  +---------------------------------------------------------------------+   |
|  |                    Rust Backend (Tauri Desktop)                      |   |
|  |  +----------+ +----------+ +----------+ +----------+              |   |
|  |  |  SQLite  | | Download | |  Queue   | |  Event   |              |   |
|  |  |   DB     | | Manager  | |  Manager | |  Emitter |              |   |
|  |  +----------+ +----------+ +----------+ +----------+              |   |
|  +---------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------+
```

### 2.2 数据流图

```
+----------+     +----------+     +----------+     +----------+     +----------+
|  User    |---->|  Chat    |---->|  Agent   |---->|  Tool    |---->| Content- |
|  Input   |     |  Engine  |     |  Router  |     |Executor  |     | Forge    |
+----------+     +----+-----+     +----+-----+     +----+-----+     |  Core    |
                      |                |                |           +----v-----+
                      v                v                v                v
              +--------------+  +--------------+  +--------------+  +----------+
              |  Streaming   |  |  Context     |  |  Tool Call   |  | Pipeline |
              |  Response    |  |  Retrieval   |  |  Result      |  |  Engine  |
              +--------------+  +--------------+  +--------------+  +----------+
```

**典型交互流程：**

1. 用户输入：“帮我分析这个 YouTube 视频的核心观点，然后改写成小红书风格”
2. Chat Engine 解析意图，路由到 **内容分析 Agent**
3. Agent 检索上下文（已选中的视频资产）
4. Agent 调用 `analyze` 工具 -> 返回分析结果
5. Agent 自动切换/调用 **改写 Agent**
6. 改写 Agent 调用 `xiaohongshu_convert` 工具 -> 返回小红书文案
7. 结果流式展示，用户可继续对话迭代

### 2.3 组件职责

| 组件 | 职责 | 技术栈 |
|------|------|--------|
| Chat UI | 消息渲染、输入处理、流式展示 | React 19 + Tailwind |
| Context Panel | 内容资产浏览、搜索、选择 | React 19 + Zustand |
| Agent Selector | Agent 切换、快捷操作 | React 19 |
| API Client | Tauri IPC / HTTP 统一抽象 | TypeScript |
| Chat Engine | 对话管理、意图识别、Agent 路由 | Python |
| Agent Registry | Agent 注册、发现、生命周期 | Python |
| Context Manager | 上下文检索、注入、Token 预算 | Python |
| Tool Executor | 工具调用、结果格式化 | Python |
| Session Manager | 对话历史、持久化、关联 | Python + SQLite |

---

## 3. AI Agent 系统设计

### 3.1 Agent 架构

```
+-------------------------------------------------------------+
|                      Agent Architecture                      |
+-------------------------------------------------------------+
|                                                             |
|  +-------------+    +-------------+    +-------------+     |
|  |   System    |    |   User      |    |   Tool      |     |
|  |   Prompt    |<---|   Query     |<---|   Results   |     |
|  |  (角色定义)  |    |  (用户输入)  |    |  (工具返回)  |     |
|  +------+------+    +-------------+    +-------------+     |
|         |                                                   |
|  +------v----------------------------------------------+   |
|  |              Agent Core (ReAct Loop)                 |   |
|  |                                                      |   |
|  |   Thought --> Action --> Observation --> Response   |   |
|  |      |          |            |              |        |   |
|  |      +----------+------------+--------------+        |   |
|  |                                                      |   |
|  |   Tools: [scrape, summarize, rewrite, publish, ...]  |   |
|  |   Context: [selected_assets, chat_history, prefs]    |   |
|  +------------------------------------------------------+   |
|                                                             |
+-------------------------------------------------------------+
```

### 3.2 Agent 定义

#### 3.2.1 Agent 角色设计

| Agent ID | 名称 | 职责 | 专属工具 | 系统提示核心 |
|----------|------|------|----------|-------------|
| `content_analyst` | 内容分析师 | 分析内容结构、提取要点、情感分析 | `analyze`, `extract_keywords`, `detect_language` | 你是内容分析专家，擅长从文本/视频中提取结构化洞察 |
| `summarizer` | 摘要专家 | 生成多风格摘要 | `summarize`, `chunk_text` | 你是摘要专家，擅长将长内容转化为精炼的要点 |
| `rewriter` | 改写专家 | 改写风格、翻译、润色 | `rewrite`, `translate`, `xiaohongshu_convert` | 你是文案改写专家，能根据不同平台调性调整内容 |
| `publisher` | 发布助手 | 格式转换、发布准备 | `publish`, `generate_markdown`, `generate_xhs` | 你是发布专家，负责将内容转化为各平台可用格式 |
| `pipeline_runner` | 流水线执行器 | 执行预设 Pipeline | `run_pipeline`, `list_presets` | 你是流水线调度员，负责执行和管理内容处理 Pipeline |
| `general` | 通用助手 | 问答、建议、导航 | `search_assets`, `get_asset_detail` | 你是 ContentForge 助手，帮助用户管理和处理内容 |

#### 3.2.2 Agent 配置 Schema

```python
# contentforge/ai/agent.py
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any
from enum import Enum

class AgentCapability(Enum):
    ANALYZE = "analyze"
    SUMMARIZE = "summarize"
    REWRITE = "rewrite"
    TRANSLATE = "translate"
    PUBLISH = "publish"
    PIPELINE = "pipeline"
    SEARCH = "search"

@dataclass
class AgentConfig:
    id: str
    name: str
    description: str
    system_prompt: str
    capabilities: List[AgentCapability]
    tools: List[str]
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 4000
    context_window: int = 128000
    icon: str = "bot"
    color: str = "#6366f1"
    auto_switch: bool = False
    streaming: bool = True
    requires_context: bool = True

@dataclass
class AgentMessage:
    role: str
    content: str
    tool_calls: Optional[List[Dict]] = None
    tool_results: Optional[List[Dict]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
```

### 3.3 工具注册系统

#### 3.3.1 工具定义 Schema

```python
# contentforge/ai/tools.py
from dataclasses import dataclass
from typing import Callable, Dict, Any, Optional

@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: Dict[str, Any]
    handler: Callable
    requires_confirmation: bool = False
    async_handler: bool = False

CONTENTFORGE_TOOLS = [
    ToolDefinition(
        name="scrape",
        description="从 URL 采集内容",
        parameters={
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "platform": {"type": "string", "enum": ["auto", "twitter", "youtube", "rss", "web"]},
            },
            "required": ["url"]
        },
        handler=ingestion_scrape_handler,
    ),
    ToolDefinition(
        name="analyze",
        description="分析内容并提取主题、关键词、情感",
        parameters={
            "type": "object",
            "properties": {
                "asset_id": {"type": "string"},
                "mode": {"type": "string", "enum": ["quick", "ai", "both"], "default": "ai"},
            },
            "required": ["asset_id"]
        },
        handler=processing_analyze_handler,
    ),
    ToolDefinition(
        name="summarize",
        description="生成内容摘要",
        parameters={
            "type": "object",
            "properties": {
                "asset_id": {"type": "string"},
                "style": {"type": "string", "enum": ["structured", "concise", "detailed", "bullets", "executive"]},
            },
            "required": ["asset_id"]
        },
        handler=processing_summarize_handler,
    ),
    ToolDefinition(
        name="rewrite",
        description="改写内容风格",
        parameters={
            "type": "object",
            "properties": {
                "asset_id": {"type": "string"},
                "tone": {"type": "string", "enum": ["professional", "casual", "humorous", "academic", "marketing"]},
                "style": {"type": "string"},
            },
            "required": ["asset_id", "tone"]
        },
        handler=processing_rewrite_handler,
    ),
    ToolDefinition(
        name="xiaohongshu_convert",
        description="将内容转换为小红书文案格式",
        parameters={
            "type": "object",
            "properties": {
                "asset_id": {"type": "string"},
                "max_length": {"type": "integer", "default": 800},
            },
            "required": ["asset_id"]
        },
        handler=processing_xiaohongshu_handler,
    ),
    ToolDefinition(
        name="translate",
        description="翻译内容",
        parameters={
            "type": "object",
            "properties": {
                "asset_id": {"type": "string"},
                "target_language": {"type": "string", "enum": ["zh", "en", "ja", "ko"]},
            },
            "required": ["asset_id", "target_language"]
        },
        handler=processing_translate_handler,
    ),
    ToolDefinition(
        name="run_pipeline",
        description="执行预设流水线",
        parameters={
            "type": "object",
            "properties": {
                "preset_name": {"type": "string", "enum": ["twitter_to_xiaohongshu", "youtube_to_notes", "rss_to_digest", "web_to_summary"]},
                "input_url": {"type": "string"},
            },
            "required": ["preset_name", "input_url"]
        },
        handler=pipeline_run_handler,
        requires_confirmation=True,
    ),
    ToolDefinition(
        name="search_assets",
        description="搜索内容资产库",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "type": {"type": "string", "enum": ["video", "article", "tweet", "audio"]},
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["query"]
        },
        handler=asset_search_handler,
    ),
    ToolDefinition(
        name="get_asset_detail",
        description="获取内容资产详情",
        parameters={
            "type": "object",
            "properties": {
                "asset_id": {"type": "string"},
            },
            "required": ["asset_id"]
        },
        handler=asset_detail_handler,
    ),
    ToolDefinition(
        name="publish",
        description="导出内容到指定格式",
        parameters={
            "type": "object",
            "properties": {
                "asset_id": {"type": "string"},
                "format": {"type": "string", "enum": ["markdown", "xiaohongshu", "json"]},
                "output_path": {"type": "string"},
            },
            "required": ["asset_id", "format"]
        },
        handler=publishing_export_handler,
    ),
]
```

### 3.4 上下文管理

#### 3.4.1 上下文层级

```
+-------------------------------------------------------------+
|                    Context Hierarchy                         |
+-------------------------------------------------------------+
|                                                             |
|  L1: System Context (系统级)                                 |
|  +-- Agent 角色定义                                          |
|  +-- 可用工具列表                                            |
|  +-- 全局配置（语言、偏好）                                   |
|                                                             |
|  L2: Session Context (会话级)                                |
|  +-- 当前对话历史                                            |
|  +-- 已选中的内容资产                                        |
|  +-- 会话元数据（创建时间、关联任务）                          |
|                                                             |
|  L3: Asset Context (资产级)                                  |
|  +-- 资产元数据（标题、来源、类型）                           |
|  +-- 文本内容（摘要、转录）                                   |
|  +-- 分析结果（主题、情感、关键词）                           |
|                                                             |
|  L4: Tool Context (工具级)                                   |
|  +-- 工具调用历史                                            |
|  +-- 中间结果                                                |
|  +-- 错误信息                                                |
|                                                             |
+-------------------------------------------------------------+
```

#### 3.4.2 Token 预算管理

```python
# contentforge/ai/context.py

class ContextBudget:
    def __init__(self, max_tokens: int = 128000):
        self.max_tokens = max_tokens
        self.reserved = {
            "system": 2000,
            "tools": 3000,
            "response": 4000,
            "buffer": 2000,
        }
        self.available = max_tokens - sum(self.reserved.values())
    
    def allocate_for_assets(self, assets: List[ContentUnit]) -> List[ContentUnit]:
        selected = []
        used_tokens = 0
        
        for asset in assets:
            text = asset.extracted_text or asset.summary or ""
            estimated_tokens = len(text) // 3
            
            if used_tokens + estimated_tokens > self.available:
                if asset.summary:
                    summary_tokens = len(asset.summary) // 3
                    if used_tokens + summary_tokens <= self.available:
                        selected.append(asset)
                        used_tokens += summary_tokens
                break
            
            selected.append(asset)
            used_tokens += estimated_tokens
        
        return selected
```

### 3.5 Agent 路由策略

```python
# contentforge/ai/router.py

class AgentRouter:
    INTENT_PATTERNS = {
        AgentCapability.ANALYZE: [
            r"分析.*内容", r"提取.*要点", r"主题.*是什么",
            r"情感.*如何", r"关键词", r"核心.*观点",
            r"analyze", r"extract.*key", r"sentiment", r"topics"
        ],
        AgentCapability.SUMMARIZE: [
            r"总结", r"摘要", r"概括", r"提炼",
            r"summarize", r"summary", r"tl;dr"
        ],
        AgentCapability.REWRITE: [
            r"改写", r"重写", r"润色", r"调整.*风格",
            r"rewrite", r"rephrase", r"polish", r"change.*tone"
        ],
        AgentCapability.TRANSLATE: [
            r"翻译", r"translate", r"转成.*文"
        ],
        AgentCapability.PUBLISH: [
            r"发布", r"导出", r"生成.*格式", r"小红书",
            r"publish", r"export", r"generate.*format"
        ],
        AgentCapability.PIPELINE: [
            r"运行.*流水线", r"执行.*预设", r"pipeline",
            r"run.*preset", r"batch.*process"
        ],
    }
    
    def route(self, message: str, current_agent: str, selected_assets: List[str]) -> str:
        import re
        
        agent_mentions = {
            "content_analyst": [r"分析师", r"analyst"],
            "summarizer": [r"摘要", r"summarizer"],
            "rewriter": [r"改写", r"rewriter"],
            "publisher": [r"发布", r"publisher"],
        }
        for agent_id, patterns in agent_mentions.items():
            if any(re.search(p, message, re.I) for p in patterns):
                return agent_id
        
        for capability, patterns in self.INTENT_PATTERNS.items():
            if any(re.search(p, message, re.I) for p in patterns):
                return self._capability_to_agent(capability)
        
        return current_agent if current_agent != "mock" else "general"
```

---

## 4. 与现有模块集成

### 4.1 集成点总览

```
+----------------------------------------------------------------+
|                    Integration Points                           |
+----------------------------------------------------------------+
|                                                                 |
|  AI Chat Engine -----+----> contentforge.ingestion (采集)       |
|       |              |         * scrape()                       |
|       |              |         * agent_reach                    |
|       |              |                                          |
|       |              +----> contentforge.processing (处理)      |
|       |              |         * ai_engine (已有)               |
|       |              |         * summarizer                     |
|       |              |         * analyzer                       |
|       |              |         * xiaohongshu_converter          |
|       |              |         * translator                     |
|       |              |                                          |
|       |              +----> contentforge.pipeline (流水线)      |
|       |              |         * PipelineEngine                 |
|       |              |         * Preset Runner                  |
|       |              |                                          |
|       |              +----> contentforge.publishing (发布)      |
|       |              |         * Format exporters               |
|       |              |                                          |
|       |              +----> Rust Backend (Tauri)                |
|       |                       * SQLite DB (assets, sessions)    |
|       |                       * Event Emitter (streaming)       |
|       |                       * File system access              |
|       |                                                       |
|       +-------------------> Frontend (Next.js)                  |
|                             * Zustand Stores                    |
|                             * API Client (IPC/HTTP)             |
|                             * UI Components                     |
|                                                                 |
+----------------------------------------------------------------+
```

### 4.2 与 Python Core 集成

#### 4.2.1 AI Engine 复用

现有 `contentforge.processing.ai_engine.AIEngine` 已支持 OpenAI/Claude/Ollama 多 Provider，AI Chat Engine 直接复用：

```python
# contentforge/ai/chat_engine.py
from contentforge.processing.ai_engine import AIEngine, AIConfig

class ChatEngine:
    def __init__(self, config: ContentForgeConfig):
        self.ai_engine = AIEngine.from_config(config.ai_provider.to_dict())
        self.agent_registry = AgentRegistry()
        self.tool_executor = ToolExecutor()
        self.session_manager = SessionManager()
```

#### 4.2.2 Pipeline Engine 集成

Agent 可通过 `run_pipeline` 工具调用现有 Pipeline：

```python
async def pipeline_run_handler(preset_name: str, input_url: str) -> Dict:
    from contentforge.pipeline.engine import PipelineEngine
    from contentforge.pipeline.presets import load_preset
    
    engine = PipelineEngine()
    pipeline = load_preset(preset_name)
    
    unit = ContentUnit(
        id=str(uuid.uuid4()),
        source=SourceInfo(platform="web", url=input_url),
        type=ContentType.ARTICLE,
    )
    
    result = engine.run(pipeline, inputs=[unit])
    return {
        "status": result.status.value,
        "output_unit_ids": result.output_unit_ids,
        "logs": result.logs,
    }
```

### 4.3 与 Rust Backend 集成

#### 4.3.1 新增 Tauri 命令

```rust
// src-tauri/src/commands.rs

#[derive(Debug, Deserialize)]
pub struct ChatSendRequest {
    pub session_id: String,
    pub message: String,
    pub agent_id: String,
    pub selected_asset_ids: Vec<String>,
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    db: State<'_, Database>,
    request: ChatSendRequest,
) -> Result<ApiResponse<()>, String> {
    db.add_chat_message(&request.session_id, "user", &request.message,
                       &request.selected_asset_ids).await
        .map_err(|e| e.to_string())?;
    
    let assets = db.get_assets_by_ids(&request.selected_asset_ids).await
        .map_err(|e| e.to_string())?;
    
    tokio::spawn(async move {
        run_chat_stream(app, request.session_id, request.agent_id,
                       request.message, assets).await
    });
    
    Ok(ApiResponse::ok(()))
}

#[tauri::command]
pub async fn get_chat_sessions(
    db: State<'_, Database>,
) -> Result<ApiResponse<Vec<ChatSession>>, String> {
    match db.get_chat_sessions().await {
        Ok(sessions) => Ok(ApiResponse::ok(sessions)),
        Err(e) => Ok(ApiResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn get_chat_history(
    db: State<'_, Database>,
    session_id: String,
) -> Result<ApiResponse<Vec<ChatMessage>>, String> {
    match db.get_chat_messages(&session_id).await {
        Ok(messages) => Ok(ApiResponse::ok(messages)),
        Err(e) => Ok(ApiResponse::err(e.to_string())),
    }
}
```

#### 4.3.2 数据库 Schema 扩展

```sql
-- 新增：chat_sessions 表
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    agent_id TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'active',
    linked_task_id TEXT,
    linked_asset_ids TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 新增：chat_messages 表
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    tool_results TEXT,
    selected_asset_ids TEXT DEFAULT '[]',
    tokens_used INTEGER,
    model TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

-- 新增：content_assets 表
CREATE TABLE content_assets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT,
    source_url TEXT,
    source_platform TEXT,
    file_path TEXT,
    extracted_text TEXT,
    summary TEXT,
    transcript TEXT,
    language TEXT,
    duration_sec REAL,
    status TEXT DEFAULT 'ingested',
    metadata TEXT DEFAULT '{}',
    tags TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX idx_chat_sessions_task ON chat_sessions(linked_task_id);
CREATE INDEX idx_content_assets_type ON content_assets(type);
CREATE INDEX idx_content_assets_status ON content_assets(status);
```

### 4.4 与前端集成

#### 4.4.1 前端 Store 扩展

```typescript
// store/chatStore.ts (扩展现有)

interface ChatSession {
  id: string;
  title: string;
  agent_id: string;
  status: "active" | "archived";
  linked_task_id?: string;
  linked_asset_ids: string[];
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  selected_asset_ids?: string[];
  tokens_used?: number;
  model?: string;
  created_at: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
}

interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  toolCalls: Map<string, ToolCall>;
  
  loadSessions: () => Promise<void>;
  createSession: (agentId: string, title?: string) => Promise<string>;
  switchSession: (sessionId: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  sendMessage: (text: string, options?: SendMessageOptions) => Promise<void>;
}
```

---

## 5. 技术选型

### 5.1 框架对比

| 框架 | 适用场景 | 优点 | 缺点 | 推荐度 |
|------|----------|------|------|--------|
| 原生 OpenAI API | 简单对话 | 直接、可控 | 需自行实现工具调用、上下文管理 | 3/5 |
| LangChain | 复杂 Agent | 生态丰富、工具链成熟 | 抽象层厚重、学习曲线陡 | 4/5 |
| LangGraph | 多 Agent 协作 | 状态机驱动、可视化 | 相对新、社区较小 | 4/5 |
| AutoGen | 多 Agent 对话 | Microsoft 背书、多 Agent 强 | 过度设计、与现有架构耦合难 | 3/5 |
| OpenAI Assistants API | 快速原型 | 内置 RAG、工具调用 | 厂商锁定、离线不可用 | 2/5 |
| MCP (Model Context Protocol) | 工具标准化 | 开放标准、跨模型兼容 | 新兴标准、生态待完善 | 5/5 |

### 5.2 推荐方案：分层架构

```
+-------------------------------------------------------------+
|                    推荐技术栈                                 |
+-------------------------------------------------------------+
|                                                             |
|  Layer 1: LLM 接口层                                         |
|  +-- 首选: 原生 OpenAI/Claude API（通过现有 AIEngine）        |
|  +-- 理由: ContentForge 已有成熟的多 Provider 抽象            |
|                                                             |
|  Layer 2: 工具调用层                                         |
|  +-- 首选: OpenAI Function Calling Schema                    |
|  +-- 备选: LangChain Tools（如需更复杂编排）                  |
|  +-- 未来: MCP Protocol（工具标准化）                         |
|                                                             |
|  Layer 3: Agent 编排层                                       |
|  +-- 首选: 自研轻量框架（基于 ReAct 模式）                    |
|  +-- 理由: 与现有 Pipeline 引擎风格一致、可控                  |
|  +-- 备选: LangGraph（如需复杂状态机）                        |
|                                                             |
|  Layer 4: 上下文管理层                                       |
|  +-- 自研 ContextBudget + RAG（基于现有 Asset Store）         |
|  +-- 向量检索: 可选集成 Chroma/FAISS（未来）                  |
|                                                             |
+-------------------------------------------------------------+
```

### 5.3 决策理由

1. **不复用 LangChain**：ContentForge 已有清晰的 Pipeline 抽象和 AIEngine，引入 LangChain 会造成概念重叠。仅在需要复杂链式调用时局部使用。

2. **自研 Agent 框架**：基于 ReAct（Reasoning + Acting）模式实现，与现有 `PipelineEngine` 的 Step Handler 模式一致，团队学习成本低。

3. **Function Calling 标准**：采用 OpenAI 的 Function Calling Schema 作为工具定义标准，Claude 和 Ollama 均可兼容。

4. **MCP 前瞻性**：在工具定义层预留 MCP 适配接口，未来可无缝接入 MCP 生态。

---

## 6. UI/UX 设计

### 6.1 布局设计

```
+-----------------------------------------------------------------------------+
|  ContentForge AI Workspace                                                   |
+--------------+------------------------------------------+-------------------+
|              |                                          |                   |
|  Context     |                                          |   Agent           |
|  Panel       |           Chat Panel                     |   Selector        |
|  (内容资产)   |           (对话主区域)                    |   (Agent 切换)    |
|              |                                          |                   |
|  +--------+  |  +------------------------------------+  |  +-------------+  |
|  | search |  |  | robot 我是 ContentForge 助手...    |  |  | robot Agent |  |
|  +--------+  |  |    选择左侧内容开始对话             |  |  |    v        |  |
|              |  +------------------------------------+  |  +-------------+  |
|  Reports     |                                          |                   |
|  [ ] Report1 |  +------------------------------------+  |  lightning Quick |
|  [ ] Report2 |  | person 分析这个视频的核心观点        |  |  +-----------+  |
|              |  +------------------------------------+  |  | Summarize |  |
|  Videos      |                                          |  | Rewrite   |  |
|  [ ] Video1  |  +------------------------------------+  |  | Translate |  |
|  [ ] Video2  |  | robot 正在分析...                   |  |  +-----------+  |
|              |  | [Tool: analyze] 运行中...           |  |                   |
|  Subtitles   |  | check 分析完成                         |  |  Session Info     |
|  [ ] Sub1    |  |                                     |  |  Tokens: 1,234    |
|              |  | [分析结果卡片]                       |  |  Model: gpt-4o   |
|              |  |                                     |  |                   |
|              |  +------------------------------------+  |  +-----------+  |
|              |  | person 改写成小红书风格              |  |  | trash Clear|  |
|              |  +------------------------------------+  |  +-----------+  |
|              |                                          |                   |
|              |  +------------------------------------+  |                   |
|              |  | [输入框] 输入消息...                |  |                   |
|              |  | [paperclip] [mic] [camera] [send]  |  |                   |
|              |  +------------------------------------+  |                   |
|              |                                          |                   |
+--------------+------------------------------------------+-------------------+
```

### 6.2 交互设计

#### 6.2.1 消息类型

| 消息类型 | 展示方式 | 示例 |
|----------|----------|------|
| 用户文本 | 右侧气泡，用户头像 | "分析这个视频" |
| Agent 文本 | 左侧气泡，Agent 图标 | "正在为您分析..." |
| 工具调用 | 折叠卡片，可展开 | `[Tool: analyze] 运行中 -> 完成` |
| 工具结果 | 结构化卡片 | 分析结果表格/列表 |
| 内容预览 | 内嵌卡片 | 视频缩略图 + 标题 |
| 代码块 | 语法高亮 | Markdown 代码 |

#### 6.2.2 工具调用展示

```
+-----------------------------------------+
| wrench Tool: analyze                    |
| ======================================  |
| Running...                              |
|                                         |
| Arguments:                              |
| * asset_id: "vtt_report:abc123"         |
| * mode: "ai"                            |
|                                         |
| [Cancel]                                |
+-----------------------------------------+

v

+-----------------------------------------+
| check Tool: analyze - Completed         |
| ======================================  |
| Duration: 2.3s | Tokens: 1,847          |
|                                         |
| Result:                                 |
| * Topics: AI, Machine Learning, Python  |
| * Sentiment: Positive (0.85)            |
| * Keywords: neural network, training... |
|                                         |
| [View Details] [Apply to Asset]         |
+-----------------------------------------+
```

#### 6.2.3 多模态输入

```
+-----------------------------------------+
| [输入框]                                |
|                                         |
| [paperclip 附件] [mic 语音] [camera 截图] [film 视频片段]|
|                                         |
+-----------------------------------------+
```

- **paperclip 附件**：上传本地文件（txt, md, pdf, srt, vtt）
- **mic 语音**：语音转文字输入（调用 Whisper）
- **camera 截图**：粘贴/上传图片（OCR 提取文字）
- **film 视频片段**：从已下载视频中选择时间范围

### 6.3 响应式设计

| 断点 | 布局调整 |
|------|----------|
| Desktop (>=1280px) | 三栏：Context (280px) + Chat (flex) + Agent (240px) |
| Tablet (768-1279px) | 两栏：Chat + 可折叠的 Context Drawer |
| Mobile (<768px) | 单栏：Chat 全屏，Context/Agent 通过 Bottom Sheet |

---

## 7. 数据模型扩展

### 7.1 扩展示意图

```
+-------------------------------------------------------------+
|                    Extended Data Model                       |
+-------------------------------------------------------------+
|                                                             |
|  +--------------+         +--------------+                 |
|  | ChatSession  |<------->|  ChatMessage |                 |
|  | -----------  |   1:N   |  ----------  |                 |
|  | id           |         |  id          |                 |
|  | title        |         |  session_id  |                 |
|  | agent_id     |         |  role        |                 |
|  | linked_task  |         |  content     |                 |
|  | linked_assets|         |  tool_calls  |                 |
|  | status       |         |  tokens_used |                 |
|  +--------------+         +--------------+                 |
|         |                                                    |
|         | N:1                                                |
|         v                                                    |
|  +--------------+         +--------------+                 |
|  | ContentAsset |<------->|  PipelineRun |                 |
|  | -----------  |   1:N   |  ----------  |                 |
|  | id           |         |  id          |                 |
|  | type         |         |  pipeline_id |                 |
|  | source_url   |         |  status      |                 |
|  | extracted_text|        |  input_units |                 |
|  | summary      |         |  output_units|                 |
|  | transcript   |         +--------------+                 |
|  | status       |                                            |
|  +--------------+                                            |
|         ^                                                    |
|         | 继承/扩展                                          |
|  +------+------+                                            |
|  | Download    |  (现有)                                     |
|  | VttReport   |  (现有)                                     |
|  +-------------+                                            |
|                                                             |
+-------------------------------------------------------------+
```

### 7.2 统一 Asset 模型

```typescript
// types/asset.ts

interface ContentAsset {
  id: string;
  type: "video" | "article" | "tweet" | "thread" | "audio" | "image" | "note";
  
  // 来源信息
  source: {
    platform: string;
    url: string;
    author?: string;
    published_at?: string;
  };
  
  // 内容
  title: string;
  description?: string;
  extracted_text?: string;
  summary?: string;
  transcript?: string;
  
  // 媒体
  file_path?: string;
  thumbnail_url?: string;
  duration_sec?: number;
  language?: string;
  
  // 分析结果
  analysis?: {
    topics: string[];
    keywords: string[];
    entities: string[];
    sentiment: {
      label: string;
      confidence: number;
    };
    quality_score: number;
  };
  
  // 元数据
  status: "ingested" | "processing" | "processed" | "ready" | "published";
  tags: string[];
  pipeline_id?: string;
  
  // 时间戳
  created_at: string;
  updated_at: string;
}
```

---

## 8. 实现优先级与里程碑

### 8.1 阶段规划

```
+-----------------------------------------------------------------------------+
|                         Implementation Roadmap                              |
+-----------------------------------------------------------------------------+
|                                                                             |
|  Phase 1: 基础对话 (MVP) -------------------------------- 4 周              |
|  =========================================================================  |
|  [P0] 统一 Asset 模型：合并 downloads + vtt_reports -> content_assets       |
|  [P0] 后端 Chat Engine：Python 实现基础对话 + 流式响应                       |
|  [P0] 前端 Chat UI：消息列表、输入框、流式展示                              |
|  [P0] 数据库扩展：chat_sessions + chat_messages 表                          |
|  [P0] Tauri 命令：chat_send, get_chat_history, get_chat_sessions           |
|                                                                             |
|  交付：可与 AI 对话、查看历史、基础上下文注入                                |
|                                                                             |
|  Phase 2: Agent 系统 ------------------------------------ 3 周              |
|  =========================================================================  |
|  [P0] Agent Registry：注册、发现、切换机制                                  |
|  [P0] Agent Router：基于意图的自动路由                                      |
|  [P0] 6 个内置 Agent：general, content_analyst, summarizer, rewriter,       |
|       publisher, pipeline_runner                                            |
|  [P1] Agent Selector UI：侧边栏 Agent 切换 + 快捷操作                       |
|  [P1] 系统提示优化：每个 Agent 的角色定义和提示工程                          |
|                                                                             |
|  交付：可切换不同 Agent 角色，Agent 具备专业领域能力                         |
|                                                                             |
|  Phase 3: 工具调用 -------------------------------------- 3 周              |
|  =========================================================================  |
|  [P1] Tool Registry：工具注册、Schema 定义                                  |
|  [P1] Function Calling：OpenAI/Claude 函数调用集成                          |
|  [P1] 核心工具实现：analyze, summarize, rewrite, translate,                 |
|       xiaohongshu_convert, search_assets                                    |
|  [P1] 工具调用 UI：工具卡片、进度展示、结果渲染                              |
|  [P1] 确认机制：destructive 操作需用户确认                                  |
|                                                                             |
|  交付：Agent 可调用 ContentForge 工具完成实际任务                           |
|                                                                             |
|  Phase 4: 上下文增强 ------------------------------------ 2 周              |
|  =========================================================================  |
|  [P1] Context Panel 重构：统一 Asset 浏览、搜索、选择                        |
|  [P1] Context Budget：Token 预算管理、智能截断                              |
|  [P1] 会话关联：对话关联到采集任务/Pipeline Run                             |
|  [P2] 历史搜索：对话历史全文检索                                            |
|                                                                             |
|  交付：完善的上下文管理，对话可关联到具体任务                                |
|                                                                             |
|  Phase 5: 多模态与优化 ---------------------------------- 2 周              |
|  =========================================================================  |
|  [P1] 多模态输入：图片上传/OCR、语音输入/Whisper                            |
|  [P2] 视频片段选择：从已下载视频选择时间范围                                 |
|  [P2] 性能优化：流式响应优化、大上下文处理                                   |
|  [P2] 错误处理：网络错误、API 限流、超时处理                                 |
|  [P2] Web 端适配：HTTP API + WebSocket 实现                                 |
|                                                                             |
|  交付：完整的多模态支持，桌面端和 Web 端统一体验                             |
|                                                                             |
|  Phase 6: 高级功能 -------------------------------------- 持续迭代          |
|  =========================================================================  |
|  [P2] 自定义 Agent：用户可创建/配置自定义 Agent                             |
|  [P2] Skill 集成：Agent 可调用 ~/.agents/skills/ 下的 Skill                 |
|  [P2] 向量检索：基于 Embedding 的内容资产语义搜索                            |
|  [P3] MCP 支持：接入 Model Context Protocol 生态                            |
|  [P3] 协作功能：会话分享、评论、版本历史                                    |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### 8.2 详细里程碑

| 里程碑 | 日期 | 交付物 | 验收标准 |
|--------|------|--------|----------|
| M1 | Week 2 | Asset 统一模型 + DB Schema | 现有 downloads/vtt_reports 数据迁移成功 |
| M2 | Week 4 | MVP 对话功能 | 可与 AI 对话、流式响应、历史记录 |
| M3 | Week 7 | Agent 系统 | 6 个 Agent 可切换、意图路由准确 |
| M4 | Week 10 | 工具调用 | Agent 可完成 analyze -> summarize -> rewrite 链式任务 |
| M5 | Week 12 | 上下文增强 | 选中资产注入上下文、Token 预算管理 |
| M6 | Week 14 | 多模态 + Web | 图片/语音输入、Web 端可用 |

---

## 9. 风险与对策

| 风险 | 影响 | 概率 | 对策 |
|------|------|------|------|
| Token 成本过高 | 高 | 中 | 实现 Context Budget、摘要注入、缓存机制 |
| LLM API 不稳定 | 高 | 中 | 多 Provider fallback、本地 Ollama 降级 |
| 大文件处理超时 | 中 | 高 | 分块处理、异步 Pipeline、进度反馈 |
| 上下文窗口溢出 | 中 | 高 | Token 预算、智能截断、RAG 检索 |
| 工具调用安全性 | 高 | 中 | 确认机制、沙箱执行、操作审计日志 |
| 前端性能问题 | 中 | 中 | 虚拟列表、消息分页、懒加载 |
| Web 端与桌面端差异 | 中 | 高 | API Client 抽象、功能降级策略 |

---

## 10. 附录

### 10.1 术语表

| 术语 | 定义 |
|------|------|
| Agent | 具有特定角色和能力的 AI 实体 |
| Tool | Agent 可调用的功能单元（如 scrape, analyze） |
| Asset | ContentForge 中的内容资产（视频、文章等） |
| Context | 对话中注入的上下文信息（资产内容、历史消息） |
| Session | 一次连续的对话会话 |
| Pipeline | 预设的内容处理流程 |
| ReAct | Reasoning + Acting，AI Agent 的推理-行动循环模式 |
| MCP | Model Context Protocol，AI 工具调用开放标准 |

### 10.2 参考文档

- [ContentForge README](../README.md)
- [vYtDL Desktop AGENTS.md](../../vYtDL-desktop/AGENTS.md)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [MCP Protocol](https://modelcontextprotocol.io/)

### 10.3 相关文件

```
contentforge/
+-- core/python/contentforge/
|   +-- models.py              # 核心数据模型
|   +-- config.py              # 配置管理
|   +-- processing/
|   |   +-- ai_engine.py       # AI Engine（复用）
|   |   +-- summarizer.py      # 摘要器（复用）
|   |   +-- analyzer.py        # 分析器（复用）
|   |   +-- xiaohongshu_converter.py  # 小红书转换（复用）
|   +-- pipeline/
|   |   +-- engine.py          # Pipeline 引擎（复用）
|   +-- ai/                    # 【新增】AI Chat 模块
|       +-- __init__.py
|       +-- chat_engine.py     # 对话引擎
|       +-- agent.py           # Agent 定义
|       +-- router.py          # Agent 路由
|       +-- tools.py           # 工具注册
|       +-- context.py         # 上下文管理
|       +-- session.py         # 会话管理
|
+-- desktop/                   # 【待开发】桌面端
    +-- ...

vYtDL-desktop/
+-- apps/desktop/src/
|   +-- store/
|   |   +-- chatStore.ts       # 【扩展】聊天状态
|   |   +-- assetStore.ts      # 【新增】资产状态
|   +-- components/workspace/
|   |   +-- chat-panel.tsx     # 【扩展】聊天面板
|   |   +-- context-panel.tsx  # 【扩展】上下文面板
|   |   +-- agent-selector.tsx # 【扩展】Agent 选择器
|   |   +-- tool-call-card.tsx # 【新增】工具调用卡片
|   +-- types/
|       +-- index.ts           # 【扩展】类型定义
|
+-- src-tauri/src/
    +-- commands.rs            # 【扩展】新增 chat 命令
    +-- database.rs            # 【扩展】新增 chat 表
    +-- lib.rs                 # 【扩展】注册新命令
```

---

> 本文档为 ContentForge AI 对话窗口主工作区的技术方案设计，后续实现过程中可根据实际情况调整。
