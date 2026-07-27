# ContentForge Python Core SPEC

**任务标识**: `PYTHON_CORE_SPEC`  
**版本**: v1.0  
**撰写语言**: 中文（技术术语保持英文）

---

## 目录

1. [概述](#1-概述)
2. [模块总览](#2-模块总览)
3. [核心数据模型](#3-核心数据模型)
4. [配置管理](#4-配置管理)
5. [AI 模块](#5-ai-模块)
6. [采集模块](#6-采集模块)
7. [流水线模块](#7-流水线模块)
8. [处理模块](#8-处理模块)
9. [CLI 桥接层](#9-cli-桥接层)
10. [工具系统](#10-工具系统)
11. [错误处理与日志](#11-错误处理与日志)
12. [依赖关系图](#12-依赖关系图)

---

## 1. 概述

ContentForge Python Core 是 ContentForge 项目的内容处理引擎，负责内容采集、AI 处理、流水线编排和发布格式化。它作为 Go CLI / Tauri 后端的子进程被调用，通过 JSON over stdout 进行通信。

### 1.1 设计原则

- **不引入 LangChain**：自研轻量 Agent 框架，基于 ReAct 模式
- **多 Provider 支持**：OpenAI、Claude、Ollama 统一抽象
- **Pipeline 驱动**：可编排的 DAG 步骤执行
- **本地优先**：SQLite 持久化、本地文件访问
- **Skill 可扩展**：Markdown + YAML Frontmatter 格式的 Skill 定义

### 1.2 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | Python 3.10+ |
| HTTP 客户端 | `requests` |
| 数据解析 | `PyYAML`（可选） |
| 数据库 | SQLite3（标准库） |
| 外部工具 | `yt-dlp`, `ffmpeg/ffprobe`, `agent-reach` |

---

## 2. 模块总览

```
core/python/contentforge/
├── __init__.py              # 包入口
├── models.py                # 核心数据模型
├── config.py                # 配置管理
│
├── ai/                      # AI 模块
│   ├── __init__.py
│   ├── agent.py             # Agent 角色定义与意图路由
│   ├── agent_registry.py    # Agent 注册与生命周期管理
│   ├── agent_router.py      # 意图路由与协作编排
│   ├── agent_session.py     # ReAct 会话与工具调用
│   ├── chat_engine.py       # 对话引擎
│   ├── content_access.py    # 本地内容访问层
│   ├── asset_retriever.py   # 智能资产检索
│   ├── video_inspector.py   # 视频元数据提取
│   ├── context.py           # Token 预算与上下文管理
│   ├── session.py           # 会话管理
│   ├── router.py            # Agent 动态路由
│   ├── tools.py             # 工具注册与执行
│   ├── USAGE_EXAMPLES.py    # 使用示例
│   └── skills/              # Skill 系统
│       ├── skill_loader.py
│       ├── skill_executor.py
│       ├── skill_context.py
│       └── examples.py
│
├── cli/                     # CLI 桥接层
│   ├── __init__.py
│   ├── __main__.py
│   ├── bridge.py
│   ├── scrape.py
│   ├── process.py
│   ├── publish.py
│   └── pipeline.py
│
├── ingestion/               # 采集模块
│   ├── __init__.py
│   ├── agent_reach.py       # agent-reach CLI 封装
│   ├── web_scraper.py       # Jina Reader 网页采集
│   ├── transcriber.py       # 视频字幕提取
│   └── health_check.py      # 健康检查
│
├── pipeline/                # 流水线模块
│   ├── __init__.py
│   ├── engine.py            # 流水线执行引擎
│   ├── presets.py           # 预设流水线
│   └── runner.py            # 流水线运行器
│
├── processing/              # 处理模块
│   ├── __init__.py
│   ├── ai_engine.py         # AI Engine 多 Provider 抽象
│   ├── analyzer.py          # 内容分析器
│   ├── summarizer.py        # 摘要生成器
│   ├── translator.py        # 多语言翻译器
│   └── xiaohongshu_converter.py  # 小红书文案转换器
│
└── publishing/              # 发布域（占位）
    └── __init__.py
```

---

## 3. 核心数据模型

**文件**: `contentforge/models.py`

### 3.1 枚举定义

#### `ContentType`

内容类型枚举，标识内容的来源形式。

| 成员 | 值 | 说明 |
|------|-----|------|
| `VIDEO` | `"video"` | 视频 |
| `ARTICLE` | `"article"` | 文章 |
| `TWEET` | `"tweet"` | 单条推文 |
| `THREAD` | `"thread"` | 推文线程 |
| `AUDIO` | `"audio"` | 音频 |
| `IMAGE` | `"image"` | 图片 |
| `NOTE` | `"note"` | 笔记 |

#### `ContentStatus`

内容生命周期状态。

| 成员 | 值 |
|------|-----|
| `INGESTED` | `"ingested"` |
| `PROCESSING` | `"processing"` |
| `PROCESSED` | `"processed"` |
| `EDITING` | `"editing"` |
| `READY` | `"ready"` |
| `PUBLISHED` | `"published"` |
| `FAILED` | `"failed"` |

#### `PipelineStatus`

流水线执行状态。

| 成员 | 值 |
|------|-----|
| `PENDING` | `"pending"` |
| `RUNNING` | `"running"` |
| `COMPLETED` | `"completed"` |
| `FAILED` | `"failed"` |
| `CANCELLED` | `"cancelled"` |
| `PARTIAL` | `"partial"` |

### 3.2 数据类

#### `SourceInfo`

```python
@dataclass
class SourceInfo:
    platform: str                    # 来源平台（youtube, twitter, web, rss...）
    url: str                         # 原始 URL
    author: Optional[str] = None     # 作者
    published_at: Optional[datetime] = None
    engagement: Dict[str, int] = {}  # 互动数据（likes, replies, reposts, views）
```

**属性**：
- `likes`, `replies`, `reposts`, `views` — 从 `engagement` 字典读取的便捷属性
- `to_dict()` — 序列化为字典

#### `ContentUnit`

核心内容单元，贯穿采集 → 处理 → 编辑 → 发布全生命周期。

```python
@dataclass
class ContentUnit:
    id: str
    source: SourceInfo
    type: ContentType
    title: str = ""
    description: str = ""
    extracted_text: str = ""          # 提取的原始文本
    summary: Optional[str] = None     # 摘要
    key_points: List[str] = []        # 关键要点
    sentiment: Optional[str] = None   # 情感标签
    topics: List[str] = []            # 主题标签
    translated_text: Optional[str] = None
    rewritten_text: Optional[str] = None
    status: ContentStatus = ContentStatus.INGESTED
    pipeline_id: Optional[str] = None
    tags: List[str] = []
    file_path: Optional[str] = None   # 关联的本地文件路径
    raw_metadata: Dict[str, Any] = {} # 原始元数据
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
```

**方法**：
- `word_count` — 基于 `extracted_text` 的词数统计
- `to_dict()` / `to_json()` — 序列化
- `from_dict(cls, data)` — 反序列化

#### `PipelineStep`

```python
@dataclass
class PipelineStep:
    id: str
    type: str                         # 步骤类型（ingest, summarize, translate...）
    config: Dict[str, Any] = {}       # 步骤配置
    input_mapping: Dict[str, str] = {}
    output_mapping: Dict[str, str] = {}
    max_retries: int = 3              # 最大重试次数
    backoff: str = "exponential"      # 退避策略（exponential / linear）
    delay_ms: int = 1000              # 基础延迟
    condition: Optional[str] = None   # 条件表达式
    timeout_ms: int = 30000           # 超时（毫秒）
```

#### `Pipeline`

```python
@dataclass
class Pipeline:
    id: str
    name: str
    description: str = ""
    steps: List[PipelineStep] = []
    trigger: str = "manual"           # 触发方式（manual / schedule / webhook）
    schedule: Optional[str] = None    # Cron 表达式
    input_config: Dict[str, Any] = {}
    output_config: Dict[str, Any] = {}
    enabled: bool = True
    last_run_at: Optional[datetime] = None
    run_count: int = 0
    fail_count: int = 0
```

#### `PipelineRun`

```python
@dataclass
class PipelineRun:
    id: str
    pipeline_id: str
    status: PipelineStatus = PipelineStatus.PENDING
    started_at: datetime
    completed_at: Optional[datetime] = None
    steps: List[Dict] = []            # 每步的执行结果
    input_unit_ids: List[str] = []
    output_unit_ids: List[str] = []
    logs: List[str] = []
    error: Optional[str] = None
```

#### `PublishProfile`

```python
@dataclass
class PublishProfile:
    id: str
    name: str
    platform: str                     # 目标平台
    credentials: Dict[str, str] = {}
    default_format: str = "markdown"
    default_template: str = ""
    auto_publish: bool = False
    max_length: Optional[int] = None
    image_config: Optional[Dict] = None
```

---

## 4. 配置管理

**文件**: `contentforge/config.py`

### 4.1 配置模型

#### `AIProviderConfig`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | `str` | `"openai"` | Provider 名称 |
| `api_key` | `str` | `""` | API Key（序列化时自动掩码） |
| `base_url` | `str` | `""` | 自定义 Base URL |
| `default_model` | `str` | `""` | 默认模型 |
| `timeout` | `int` | `120` | 超时（秒） |

#### `PlatformBackendConfig`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `agent_reach_binary` | `str` | `"agent-reach"` | agent-reach 可执行文件路径 |
| `ytdlp_binary` | `str` | `"yt-dlp"` | yt-dlp 可执行文件路径 |
| `ffmpeg_path` | `Optional[str]` | `None` | FFmpeg 路径 |
| `jina_api_key` | `Optional[str]` | `None` | Jina Reader API Key |

#### `ContentForgeConfig`

完整配置聚合类，包含：
- `version: str = "1"`
- `ai_provider: AIProviderConfig` — 默认 AI Provider
- `ai_providers: List[AIProviderConfig]` — 多 Provider 列表
- `platform: PlatformBackendConfig` — 平台后端配置
- `proxy: ProxyConfig` — 代理配置
- `publish_profiles: List[PublishProfileConfig]` — 发布 Profile 列表
- `default_pipeline: str = ""` — 默认流水线
- `log_level: str = "INFO"`
- `state_dir: str = ""` — 状态目录

### 4.2 ConfigManager

配置管理器，支持 YAML 文件加载和环境变量覆盖。

```python
class ConfigManager:
    ENV_PREFIX = "CF_"
    DEFAULT_CONFIG_PATH = ~/.config/contentforge/config.yaml
```

**方法**：

| 方法 | 说明 |
|------|------|
| `load()` | 加载配置，优先文件，然后环境变量覆盖 |
| `reload()` | 重新加载配置 |
| `get()` | 获取当前配置（缓存） |
| `save(config)` | 保存配置到文件 |
| `init_default()` | 创建默认配置并保存 |

**环境变量映射**：

| 环境变量 | 覆盖字段 |
|----------|----------|
| `CF_AI_API_KEY` | `ai_provider.api_key` |
| `CF_AI_PROVIDER` | `ai_provider.name` |
| `CF_AI_MODEL` | `ai_provider.default_model` |
| `CF_AI_BASE_URL` | `ai_provider.base_url` |
| `CF_AGENT_REACH_BINARY` | `platform.agent_reach_binary` |
| `CF_YTDLP_BINARY` | `platform.ytdlp_binary` |
| `CF_FFMPEG_PATH` | `platform.ffmpeg_path` |
| `CF_JINA_API_KEY` | `platform.jina_api_key` |
| `CF_HTTP_PROXY` / `CF_HTTPS_PROXY` | `proxy.http` / `proxy.https` |
| `CF_LOG_LEVEL` | `log_level` |
| `CF_STATE_DIR` | `state_dir` |

**全局便捷函数**：
- `get_config(config_path=None)` — 懒加载全局配置
- `reload_config()` — 重新加载全局配置

---

## 5. AI 模块

### 5.1 Agent 角色定义

**文件**: `contentforge/ai/agent.py`

#### `AgentCapability` 枚举

| 成员 | 值 |
|------|-----|
| `ANALYZE` | `"analyze"` |
| `SUMMARIZE` | `"summarize"` |
| `REWRITE` | `"rewrite"` |
| `TRANSLATE` | `"translate"` |
| `PUBLISH` | `"publish"` |
| `PIPELINE` | `"pipeline"` |
| `SEARCH` | `"search"` |
| `GENERAL` | `"general"` |

#### `AgentRole`

Agent 角色定义数据类：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | `str` | 必填 | 唯一标识 |
| `name` | `str` | 必填 | 显示名称 |
| `description` | `str` | 必填 | 功能描述 |
| `system_prompt` | `str` | 必填 | 系统提示词 |
| `capabilities` | `List[AgentCapability]` | 必填 | 能力列表 |
| `tools` | `List[str]` | 必填 | 可用工具列表 |
| `model` | `str` | `"gpt-4o-mini"` | 使用的模型 |
| `temperature` | `float` | `0.7` | 温度参数 |
| `max_tokens` | `int` | `4000` | 最大 Token |
| `context_window` | `int` | `128000` | 上下文窗口 |
| `icon` | `str` | `"bot"` | UI 图标 |
| `color` | `str` | `"#6366f1"` | UI 颜色 |
| `auto_switch` | `bool` | `False` | 是否支持自动切换 |
| `streaming` | `bool` | `True` | 是否支持流式输出 |
| `requires_context` | `bool` | `True` | 是否需要上下文 |
| `order` | `int` | `0` | 排序权重 |

#### 内置 Agent 列表

| ID | 名称 | 能力 | 模型 | 自动切换 |
|-----|------|------|------|----------|
| `general` | 通用助手 | GENERAL, SEARCH | gpt-4o-mini | 否 |
| `content_analyst` | 内容分析师 | ANALYZE, SEARCH | gpt-4o | 是 |
| `summarizer` | 摘要专家 | SUMMARIZE, SEARCH | gpt-4o-mini | 是 |
| `rewriter` | 改写专家 | REWRITE, TRANSLATE, SEARCH | gpt-4o | 是 |
| `publisher` | 发布助手 | PUBLISH, SEARCH | gpt-4o-mini | 是 |
| `pipeline_runner` | 流水线执行器 | PIPELINE, SEARCH | gpt-4o-mini | 是 |

#### `AgentRegistry`

Agent 注册表，管理内置 Agent 的注册、发现和基于意图的路由。

**方法**：

| 方法 | 签名 | 说明 |
|------|------|------|
| `register` | `(agent: AgentRole) -> None` | 注册 Agent |
| `unregister` | `(agent_id: str) -> None` | 注销 Agent |
| `get_agent` | `(agent_id: str) -> Optional[AgentRole]` | 获取 Agent |
| `list_agents` | `() -> List[AgentRole]` | 列出所有 Agent（按 order 排序） |
| `get_by_capability` | `(capability: AgentCapability) -> Optional[AgentRole]` | 按能力查找 |
| `route_by_intent` | `(message, selected_asset_ids, current_agent_id) -> str` | 基于意图路由 |

**意图路由策略**：
1. 检查是否显式提及 Agent（`AGENT_MENTIONS` 模式匹配）
2. 基于 `INTENT_PATTERNS` 进行 capability 评分
3. 选择最高分的 capability 对应的 Agent
4. 无明确意图时保持当前 Agent

### 5.2 Agent 注册中心

**文件**: `contentforge/ai/agent_registry.py`

`AgentRegistry`（注意：此模块与 `agent.py` 中的 `AgentRegistry` 是**不同实现**，`agent_registry.py` 提供更完整的功能）：

- **单例模式**：全局共享 Agent 定义和状态
- **SQLite 持久化**：`~/.contentforge/agent_registry.db`
- **Skill 注册表集成**：`SkillRegistry`

#### 数据模型

**`AgentStatus` 枚举**：
- `IDLE`, `BUSY`, `PAUSED`, `ERROR`, `TERMINATED`

**`AgentRole` 枚举**：
- `ORCHESTRATOR`, `ASSISTANT`, `WRITER`, `ANALYST`, `RESEARCHER`, `PUBLISHER`, `CUSTOM`

**`AgentDefinition`**：
静态配置数据类，包含 `id`, `name`, `role`, `system_prompt`, `model`, `provider`, `skills`, `tools`, `memory_enabled`, `max_history` 等字段。

**`AgentState`**：
运行时状态数据类，包含 `status`, `current_task`, `memory_snapshot`, `context_variables`, `last_active`, `error_message`, `metrics`。

**`SkillManifest`**：
Skill 元数据，支持 YAML Frontmatter + Markdown Body 格式。

#### 核心方法

| 方法 | 说明 |
|------|------|
| `register(agent_def)` | 注册新 Agent，持久化到 SQLite |
| `unregister(agent_id)` | 注销 Agent，删除持久化数据 |
| `get(agent_id)` | 获取 Agent 定义 |
| `get_state(agent_id)` | 获取运行时状态 |
| `update_state(agent_id, **kwargs)` | 更新状态字段 |
| `list_agents(role, status)` | 按角色或状态过滤 |
| `find_by_skill(skill_name)` | 查找支持指定 Skill 的 Agent |
| `find_by_name(name)` | 按名称精确匹配 |
| `search(query)` | 模糊搜索 |
| `create_custom_agent(...)` | 便捷方法：创建自定义 Agent |
| `reset_state(agent_id)` | 重置状态（清空记忆） |
| `to_json()` | 导出所有定义为 JSON |

#### SkillRegistry

Skill 注册中心，管理 Markdown + YAML Frontmatter 格式的 Skill。

**Skill 目录优先级**：
1. `CONTENTFORGE_SKILL_DIR` 环境变量
2. `~/.contentforge/skills/`
3. `contentforge/skills/`（包内目录）

**核心方法**：

| 方法 | 说明 |
|------|------|
| `load_all()` | 扫描所有 Skill 目录 |
| `register(manifest, handler)` | 手动注册 Skill |
| `get(name)` | 获取 Skill 元数据 |
| `list_skills(tag)` | 按 tag 过滤 |
| `search(query)` | 模糊搜索 |
| `bind_handler(name, handler)` | 绑定执行函数 |
| `to_prompt_context(skill_names)` | 转换为 LLM prompt 上下文 |

### 5.3 Agent Router

**文件**: `contentforge/ai/agent_router.py`

`AgentRouter` 负责用户意图分析、Agent 调度、多 Agent 协作编排。

#### 路由决策类型

```python
class RoutingDecision(Enum):
    DIRECT = "direct"           # 直接路由到指定 Agent
    DELEGATE = "delegate"       # 委派给子 Agent
    COLLABORATE = "collaborate" # 多 Agent 协作
    SKILL = "skill"             # 直接触发 Skill
    CLARIFY = "clarify"         # 需要澄清
```

#### `RouteResult`

```python
@dataclass
class RouteResult:
    decision: RoutingDecision
    target_agent_ids: List[str]
    skill_name: Optional[str]
    skill_params: Dict[str, Any]
    reasoning: str
    confidence: float
    user_message: str
    context: Dict[str, Any]
```

#### `CollaborationPlan`

多 Agent 协作计划：
```python
@dataclass
class CollaborationPlan:
    plan_id: str
    description: str
    steps: List[Dict]  # {agent_id, task, depends_on, output_key}
    status: str        # pending | running | completed | failed
```

#### 核心方法

| 方法 | 说明 |
|------|------|
| `route(user_message, context)` | 分析用户消息，返回路由决策 |
| `route_stream(user_message, context)` | 流式路由，产出决策过程 |
| `create_collaboration_plan(description, steps)` | 创建协作计划 |
| `execute_collaboration_plan(plan_id, initial_context)` | 执行协作计划（Generator） |
| `auto_collaborate(message, context)` | 自动分析需求并生成协作计划 |
| `suggest_agents(message, top_k)` | 推荐最匹配的 Agent（含相似度分数） |
| `get_route_history(n)` | 获取最近路由历史 |
| `cancel_plan(plan_id)` | 取消协作计划 |

**路由流程**：
1. **快速模式匹配** — 关键词/正则匹配 Skill
2. **显式 Agent 指定** — 检测 `@AgentName` 格式
3. **LLM 推理路由** — 使用 Orchestrator Agent 做 LLM 推理

### 5.4 Agent Session

**文件**: `contentforge/ai/agent_session.py`

`AgentSession` 是完整的 ReAct 风格 Agent 运行时。

#### 数据模型

**`MessageRole` 枚举**：
- `SYSTEM`, `USER`, `ASSISTANT`, `TOOL`, `AGENT`

**`ChatMessage`**：
统一消息格式，支持 `to_llm_message()` 转换。

**`ToolDefinition`**：
工具定义，包含 `name`, `description`, `parameters`（JSON Schema）, `handler`。

**`ToolCall`** / **`ToolResult`**：
工具调用实例和执行结果。

**`SessionConfig`**：
会话配置，包含 `session_id`, `max_turns`, `enable_multi_agent`, `enable_skills`, `stream_response`, `persist_history`。

#### 内置工具

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `query_content_units` | 查询 SQLite 内容资产 | `limit`, `type`, `status`, `search`, `tags` |
| `read_file` | 读取本地文件 | `path`, `max_length` |
| `list_content_assets` | 列出内容资产统计 | `platform` |
| `get_video_metadata` | 获取视频元数据 | `content_id` |
| `execute_skill` | 执行注册 Skill | `skill_name`, `params` |
| `switch_agent` | 切换 Agent | `agent_name`, `reason` |

#### 核心方法

| 方法 | 说明 |
|------|------|
| `send_message(user_message, context)` | 同步发送消息，返回完整响应 |
| `send_message_stream(user_message, context)` | 流式发送消息，产出增量 token 和事件 |
| `set_active_agent(agent_id)` | 手动设置当前 Agent |
| `add_context(key, value)` | 添加上下文变量 |
| `export_history()` | 导出完整对话历史 |
| `clear_history()` | 清空对话历史（保留系统消息） |
| `get_stats()` | 获取会话统计 |

**流式事件类型**：
- `thinking` — 思考过程
- `tool_call` — 工具调用
- `tool_result` — 工具执行结果
- `token` — 增量文本
- `agent_switch` — Agent 切换
- `done` / `error` — 完成/错误

**ReAct 循环**：
1. 路由决策 → 确定目标 Agent
2. 构建 LLM 消息（含上下文截断）
3. 调用 LLM，收集响应
4. 检测工具调用（JSON/ReAct 格式）
5. 执行工具，将结果注入对话
6. 重复直到无工具调用或达到最大迭代次数（默认 5 次）

### 5.5 Chat Engine

**文件**: `contentforge/ai/chat_engine.py`

`ChatEngine` 是对话引擎，职责：
- 管理对话历史和会话状态
- 调用 AI Engine 生成响应
- 支持流式输出
- 集成工具调用（Function Calling）
- Agent 路由与切换

**核心方法**：

| 方法 | 说明 |
|------|------|
| `chat(session_id, message, agent_id, selected_asset_ids)` | 非流式对话 |
| `stream_chat(session_id, message, agent_id, selected_asset_ids)` | 流式对话 |
| `cancel_stream(message_id)` | 取消流式生成 |

**流式事件类型**：
- `text` — 文本块
- `tool_call` — 工具调用
- `tool_result` — 工具结果
- `agent_switched` — Agent 切换通知
- `done` — 完成
- `error` — 错误

### 5.6 Content Access

**文件**: `contentforge/ai/content_access.py`

`ContentAccess` 是 Chat 对话框本地内容访问层统一入口。

#### 数据模型

**`TextSearchResult`**：
- `asset_id`, `field`, `snippet`, `score`, `matched_terms`

**`ContentQuery`**：
支持基础过滤、文本搜索、时间范围、分页、排序。

**`ContentAccessResult`**：
- `success`, `data`, `error`, `total_count`, `execution_time_ms`

#### `DatabaseConnection`

SQLite 连接上下文管理器：
- 支持连接池和行工厂
- 自动启用外键约束 (`PRAGMA foreign_keys = ON`)
- 使用 WAL 模式 (`PRAGMA journal_mode = WAL`)
- 自动回滚/提交

#### ContentAccess 核心能力

**1. SQLite 数据库查询**：

| 方法 | 说明 |
|------|------|
| `get_asset(asset_id)` | 按 ID 获取单个资产 |
| `get_assets_by_ids(asset_ids)` | 批量获取 |
| `query_assets(query)` | 通用查询（支持 FTS5 + LIKE 回退） |
| `save_asset(asset)` | 保存或更新 |
| `delete_asset(asset_id)` | 删除 |

**FTS5 全文检索**：
- 虚拟表 `content_assets_fts`
- 覆盖字段：`id`, `title`, `extracted_text`, `summary`, `transcript`
- 无 FTS 结果时自动回退到 `LIKE` 模糊匹配

**2. 文件系统读取**：

| 方法 | 说明 |
|------|------|
| `read_file(file_path, max_bytes)` | 安全读取本地文件（默认 10MB 限制） |
| `read_asset_file(asset_id)` | 读取资产关联文件 |
| `list_asset_files(asset_id)` | 列出资产目录下的文件 |

**安全策略**：
- 路径规范化（`resolve`）防止目录遍历
- 文件大小限制
- 多编码尝试（utf-8, gbk, latin-1）

**3. 文本内容检索**：

| 方法 | 说明 |
|------|------|
| `search_text(query, fields, limit)` | 关键词搜索，返回带上下文的片段 |
| `get_text_content(asset_id, field)` | 获取指定字段文本 |
| `get_combined_text(asset_id)` | 按优先级拼接文本（title > summary > extracted_text > transcript） |

**4. 视频元数据**：
- `get_video_metadata(asset_id)` — 委托 `VideoInspector`
- `list_videos(status, limit)` — 列出视频资产

**5. 工具方法**：
- `get_stats()` — 获取内容库统计
- `to_prompt_context(asset_ids, max_length)` — 转换为 LLM prompt 上下文

### 5.7 Asset Retriever

**文件**: `contentforge/ai/asset_retriever.py`

`AssetRetriever` 在 `ContentAccess` 之上提供智能检索策略。

#### 数据模型

**`AssetSearchResult`**：
- `asset`, `score`, `matched_fields`, `match_reason`, `related_asset_ids`

**`RetrievalContext`**：
- 多轮检索上下文，包含 `original_query`, `expanded_queries`, `filters_applied`, `previous_results`

**`AssetRelation`**：
- `source_id`, `target_id`, `relation_type`, `strength`

#### 检索策略

| 策略 | 说明 | 触发条件 |
|------|------|----------|
| 精确匹配 | ID / URL 精确匹配 | 查询看起来像 UUID 或 asset ID |
| 全文检索 | FTS5 / LIKE 检索 | 普通文本查询 |
| 标签过滤 | 按标签匹配 | 有解析出的关键词 |
| 关系图谱 | 通过 pipeline/platform/author 发现关联 | 结果不足时自动触发 |

#### 评分维度

| 维度 | 权重逻辑 |
|------|----------|
| 文本匹配度 | 关键词出现频率 × 字段权重 |
| 字段权重 | title(3.0) > tags(2.5) > summary(2.0) > transcript(1.5) > extracted_text(1.0) |
| 时效性 | 最近 1 天 +0.3，7 天 +0.2，30 天 +0.1 |
| 质量信号 | ready 状态 +0.1，有摘要 +0.05 |

#### 核心方法

| 方法 | 说明 |
|------|------|
| `search(query, ...)` | 智能搜索入口 |
| `search_similar(asset_id)` | 查找相似内容 |
| `get_recent_assets(days)` | 获取最近添加的资产 |
| `get_pipeline_assets(pipeline_id)` | 获取 Pipeline 关联资产 |
| `get_asset_relations(asset_id)` | 获取关系图谱 |
| `get_recommended_assets(asset_id)` | 推荐相关资产 |
| `expand_query(query)` | 查询扩展（同义词） |

### 5.8 Video Inspector

**文件**: `contentforge/ai/video_inspector.py`

`VideoInspector` 负责视频元数据提取。

#### 数据模型

**`VideoStreamInfo`**：
- `index`, `codec`, `width`, `height`, `fps`, `bitrate`, `pixel_format`, `color_space`

**`AudioStreamInfo`**：
- `index`, `codec`, `sample_rate`, `channels`, `bitrate`, `language`

**`SubtitleStreamInfo`**：
- `index`, `codec`, `language`, `title`, `is_forced`, `is_default`

**`VideoMetadata`**：
- 基础信息：`file_path`, `source_url`, `title`, `duration_sec`, `size_bytes`
- 流信息：`video_streams`, `audio_streams`, `subtitle_streams`
- 关键属性：`width`, `height`, `fps`, `video_bitrate`, `audio_bitrate`
- 缩略图：`thumbnail_path`
- 章节和标签：`chapters`, `tags`
- 原始输出：`raw_info`

**便捷属性**：
- `resolution` — 分辨率字符串（如 "1920x1080"）
- `duration_str` — 人类可读时长（如 "01:23:45"）
- `has_subtitles` — 是否有字幕轨道
- `has_multiple_audio` — 是否有多个音轨

#### 核心方法

| 方法 | 说明 |
|------|------|
| `inspect_file(file_path)` | 提取本地视频完整元数据（ffprobe） |
| `inspect_file_quick(file_path)` | 快速检查（仅基础信息） |
| `inspect_url(url)` | 获取在线视频元数据（yt-dlp --dump-json） |
| `extract_thumbnail(file_path, timestamp)` | 提取缩略图（ffmpeg） |
| `extract_keyframes(file_path, count)` | 提取关键帧（均匀分布） |
| `extract_subtitle_text(file_path, stream_index)` | 提取字幕文本 |
| `get_available_formats(url)` | 获取在线视频可用格式列表 |
| `check_health()` | 检查依赖健康状态 |

#### 异常类型

| 异常 | 说明 |
|------|------|
| `VideoInspectorError` | 通用错误 |
| `FFmpegNotFoundError` | FFmpeg 未安装 |
| `YTDLPNotFoundError` | yt-dlp 未安装 |
| `VideoProbeError` | 视频探测失败 |

### 5.9 Context 管理

**文件**: `contentforge/ai/context.py`

`ContextManager` 负责构建 LLM 上下文消息列表，管理 Token 预算。

#### `TokenBudget`

```python
@dataclass
class TokenBudget:
    max_tokens: int = 128000
    reserved: Dict[str, int] = {
        "system": 2000,
        "tools": 3000,
        "response": 4000,
        "buffer": 2000,
    }
```

- `available` — 可用 Token 数（max - reserved）
- `estimate_tokens(text)` — 简化估算（每 3 字符 ≈ 1 token）
- `allocate_for_assets(assets)` — 为资产分配 Token 预算（优先摘要，超长截断）
- `truncate_history(messages, max_tokens)` — 从后往前截断历史消息

#### 上下文层级

| 层级 | 内容 | 优先级 |
|------|------|--------|
| L1 | System Context（Agent 角色 + 工具列表） | 最高 |
| L3 | Asset Context（选中资产内容） | 高 |
| L4 | Tool Context（工具调用结果） | 中 |
| L2 | Session Context（历史消息） | 动态截断 |
| — | 当前用户消息 | 必保留 |

### 5.10 Session 管理

**文件**: `contentforge/ai/session.py`

`SessionManager` 管理会话生命周期和消息历史。

**核心方法**：

| 方法 | 说明 |
|------|------|
| `create_session(...)` | 创建会话 |
| `get_session(session_id)` | 获取会话 |
| `list_sessions(status, agent_id, limit, offset)` | 列出会话 |
| `archive_session(session_id)` | 归档会话 |
| `add_message(message)` | 添加消息 |
| `get_messages(session_id, limit, offset, before_id)` | 获取消息历史（支持分页） |
| `link_asset(session_id, asset_id)` | 关联资产 |
| `search_sessions(query)` | 搜索会话 |

**参考数据库 Schema**：
```sql
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '新会话',
    agent_id TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'active',
    linked_task_id TEXT,
    linked_asset_ids TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    tool_results TEXT,
    selected_asset_ids TEXT DEFAULT '[]',
    tokens_used TEXT,
    model TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);
```

### 5.11 Skill 系统

#### 5.11.1 Skill Loader

**文件**: `contentforge/ai/skills/skill_loader.py`

`SkillLoader` 从文件系统加载和索引 Skill。

**Skill 文件格式**（Markdown + YAML Frontmatter）：

```markdown
---
name: xiaohongshu_publish
description: 将内容转换为小红书文案并发布
version: "1.0.0"
author: contentforge
category: publishing
tags: ["social", "xiaohongshu"]
triggers:
  - type: keyword
    patterns: ["小红书", "xhs", "xiaohongshu"]
  - type: intent
    patterns: ["publish_to_xiaohongshu"]
parameters:
  - name: content
    type: string
    required: true
    description: 要转换的内容
tools:
  - name: xiaohongshu_converter
    description: 转换内容到小红书格式
    required: true
---

# 小红书发布 Skill

## 使用说明
...

```prompt
你是一个小红书文案专家...
```
```

**触发器类型**：
- `keyword` — 关键词包含匹配
- `intent` — 意图精确/包含匹配
- `regex` — 正则表达式匹配
- `semantic` — 语义匹配（占位）

**核心方法**：

| 方法 | 说明 |
|------|------|
| `load_all()` | 加载所有 Skill |
| `match(text, min_confidence, top_k)` | 自然语言匹配 |
| `match_exact(name)` | 精确匹配 |
| `suggest(text)` | 获取匹配建议（UI 展示） |
| `create_skill_template(name)` | 生成 Skill 模板 |
| `save_skill_template(name)` | 保存模板到文件 |

#### 5.11.2 Skill Executor

**文件**: `contentforge/ai/skills/skill_executor.py`

`SkillExecutor` 是 Skill 执行引擎，自研轻量 ReAct 风格 Agent 框架。

**行动类型**：
- `THINK` — 思考/推理
- `TOOL_CALL` — 调用工具
- `ANSWER` — 直接回答
- `CLARIFY` — 请求澄清
- `SKILL_SWITCH` — 切换 Skill

**执行模式**：
- `react_mode=True` — ReAct 风格（Thought/Action/Action Input/Observation）
- `react_mode=False` — Function Calling 风格

**核心方法**：

| 方法 | 说明 |
|------|------|
| `execute(skill, user_input, context, args)` | 同步执行 Skill |
| `stream_execute(skill, user_input, context, args)` | 流式执行 |
| `stream_with_tools(skill, user_input, context, args)` | 流式执行，产出工具调用事件 |
| `extract_parameters(skill, user_input, context)` | 从用户输入中提取参数 |
| `route(user_input, context)` | 路由到合适的 Skill |
| `auto_execute(user_input, context)` | 自动路由并执行 |
| `add_tool_result(messages, tool_call, result)` | 将工具结果添加回消息列表 |

#### 5.11.3 Skill Context

**文件**: `contentforge/ai/skills/skill_context.py`

`SkillContext` 统一封装所有本地访问能力。

**组成**：
- `content: ContentAccess` — SQLite 数据访问
- `file: FileAccess` — 文件系统访问
- `tools: ToolRegistry` — 工具注册与调用

**内置工具**：

| 工具名 | 功能 |
|--------|------|
| `content_search` | 搜索本地内容 |
| `content_read` | 读取 ContentUnit |
| `content_list` | 列出内容 |
| `file_read` | 读取本地文件 |
| `file_list` | 列出文件 |
| `video_metadata` | 获取视频元数据 |
| `pipeline_list` | 列出 PipelineRun |
| `pipeline_run` | 执行 Pipeline |
| `ai_generate` | 调用 AI 生成 |
| `ai_summarize` | 调用 AI 摘要 |

---

## 6. 采集模块

### 6.1 Agent-Reach 采集器

**文件**: `contentforge/ingestion/agent_reach.py`

`AgentReachIngestor` 封装 `agent-reach` CLI，支持多平台内容获取。

**支持的平台**：

| 方法 | 平台 | 说明 |
|------|------|------|
| `fetch_twitter(url)` | Twitter/X | 获取推文或线程 |
| `fetch_web(url)` | 任意网页 | 获取网页内容 |
| `fetch_youtube(url)` | YouTube | 获取视频元数据和字幕 |
| `fetch_rss(feed_url, limit)` | RSS Feed | 获取文章列表 |
| `fetch(url)` | 自动检测 | 根据 URL 自动分派 |

**自动检测规则**：
- `twitter.com` / `x.com` → Twitter
- `youtube.com` / `youtu.be` → YouTube
- `.rss` / `feed.xml` / `/rss/` / `/feed/` → RSS
- 其他 → Web

**CLI 调用方式**：
```bash
agent-reach fetch --json --platform <platform> <url>
```

**输出解析**：
- 尝试解析最后有效的 JSON 行（处理日志+JSON 混合输出）
- 超时：默认 120 秒

### 6.2 网页采集器

**文件**: `contentforge/ingestion/web_scraper.py`

`JinaWebScraper`（别名 `WebScraper`）使用 Jina AI Reader API 获取网页内容。

**API 端点**：
- HTTP: `https://r.jina.ai/http://<url>`
- HTTPS: `https://r.jina.ai/https://<url>`

**特性**：
- 自动将网页转换为结构化 Markdown
- 支持批量 URL 获取
- 自定义 User-Agent 和代理
- API Token 支持（提高速率限制）

**方法**：

| 方法 | 说明 |
|------|------|
| `fetch(url)` | 获取单个网页 |
| `fetch_batch(urls)` | 批量获取 |
| `fetch_with_metadata(url)` | 获取原始 Markdown 和元数据 |
| `health_check()` | 检测服务可用性 |

**响应解析**：
- 第一行以 `Title: ` 开头 → 提取标题
- 最后一行以 `Source URL: ` 开头 → 提取源 URL

### 6.3 转录器

**文件**: `contentforge/ingestion/transcriber.py`

`Transcriber` 支持多种后端的视频/音频转录。

**支持的后端**：

| 后端 | 说明 |
|------|------|
| `yt-dlp` | 提取 YouTube 字幕/自动字幕（默认） |
| `agent-reach` | 调用 agent-reach transcribe 子命令 |
| `ffmpeg-whisper` | 提取音频（需外部 Whisper 服务） |

**yt-dlp 流程**：
1. `--skip-download --write-subs --write-auto-subs --sub-langs en,zh-Hans,zh-Hant --sub-format vtt`
2. 查找生成的 VTT 文件
3. 解析 VTT 为纯文本（移除时间戳和标记行）
4. 无字幕时回退到视频描述

**VTT 解析**：
- 移除 `WEBVTT` 标记
- 移除时间戳行（`00:00:00.000 --> 00:00:01.000`）
- 保留纯文本内容

### 6.4 健康检查

**文件**: `contentforge/ingestion/health_check.py`

`HealthChecker` 检测各平台可用性。

**检查项**：

| 名称 | 检查方式 | 超时 |
|------|----------|------|
| agent-reach | `--version` | 10s |
| yt-dlp | `--version` | 10s |
| ffmpeg | `-version` | 10s |
| jina-reader | `GET https://r.jina.ai/http://example.com` | 15s |
| internet | `GET https://1.1.1.1` | 10s |

**状态等级**：
- `ok` — 正常
- `degraded` — 降级（超时或 HTTP 错误）
- `fail` — 失败

**方法**：
- `check_all()` — 运行全部检查
- `doctor()` — 返回汇总报告

---

## 7. 流水线模块

### 7.1 执行引擎

**文件**: `contentforge/pipeline/engine.py`

`PipelineEngine` 支持 DAG 步骤执行、重试、超时、条件判断。

#### 步骤处理器

所有处理器继承自 `StepHandler` 抽象基类：

```python
class StepHandler(ABC):
    @property
    @abstractmethod
    def step_type(self) -> str: ...
    
    @abstractmethod
    def execute(self, step, inputs, context) -> List[ContentUnit]: ...
```

**内置处理器**：

| 处理器 | 类型 | 说明 |
|--------|------|------|
| `IngestionHandler` | `ingest` | 采集内容 |
| `SummarizeHandler` | `summarize` | 生成摘要 |
| `RewriteHandler` | `rewrite` | 改写风格 |
| `XiaohongshuHandler` | `xiaohongshu` | 转换为小红书文案 |
| `TranslateHandler` | `translate` | 翻译 |
| `AnalyzeHandler` | `analyze` | 分析内容 |
| `FilterHandler` | `filter` | 过滤内容 |
| `CustomHandler` | `custom` | 自定义函数（占位） |

#### PipelineEngine 核心方法

| 方法 | 说明 |
|------|------|
| `register_handler(handler)` | 注册自定义处理器 |
| `run(pipeline, inputs, context, fail_fast)` | 执行流水线 |

**执行特性**：
- 顺序执行 steps
- 每步支持 `max_retries` 次重试
- 超时控制（`timeout_ms`）
- 条件判断（`condition` 表达式，使用 `eval` 安全命名空间）
- 错误处理：`fail_fast=True` 时遇到错误立即停止；否则继续处理未失败的输入
- 退避策略：`exponential`（delay × 2^(attempt-1)）或 `linear`

**状态判定**：
- 全部失败 → `FAILED`
- 部分失败 → `PARTIAL`
- 全部成功 → `COMPLETED`

### 7.2 预设流水线

**文件**: `contentforge/pipeline/presets.py`

内置 5 个预设流水线：

| 预设名称 | 说明 | 步骤 |
|----------|------|------|
| `twitter_to_xiaohongshu` | Twitter 转小红书 | ingest → translate → summarize → xiaohongshu → analyze |
| `youtube_to_notes` | YouTube 转笔记 | ingest → translate(条件) → summarize → analyze → rewrite |
| `rss_to_digest` | RSS 转摘要 | ingest → filter → summarize → analyze |
| `web_to_summary` | 网页转摘要 | ingest → summarize → analyze → translate(条件) |
| `ai_processing` | 通用 AI 处理 | analyze → summarize → rewrite → xiaohongshu(条件) → translate(条件) |

**PipelinePreset 方法**：
- `to_pipeline(pipeline_id)` — 转换为可执行的 Pipeline 实例

### 7.3 运行器

**文件**: `contentforge/pipeline/runner.py`

`PipelineRunner` 管理 PipelineRun 生命周期、日志持久化、状态查询。

**存储结构**：
```
~/.config/contentforge/runs/
├── {run_id}.json        # 运行记录
├── logs/
│   └── {run_id}.log     # 执行日志
└── outputs/
    └── {run_id}.json    # 输出 ContentUnit
```

**核心方法**：

| 方法 | 说明 |
|------|------|
| `run(pipeline, inputs, context, fail_fast)` | 执行流水线 |
| `run_preset(preset_name, context, **input_params)` | 使用预设执行 |
| `get_status(run_id)` | 获取运行状态 |
| `get_logs(run_id)` | 获取日志 |
| `get_outputs(run_id)` | 获取输出 |
| `list_runs(pipeline_id, limit)` | 列出历史运行 |
| `cancel(run_id)` | 取消运行 |
| `retry(run_id, context)` | 重试失败的运行 |
| `cleanup(max_age_days)` | 清理旧记录 |

---

## 8. 处理模块

### 8.1 AI Engine

**文件**: `contentforge/processing/ai_engine.py`

`AIEngine` 是多 Provider AI 调用统一入口。

#### 支持的 Provider

| Provider | 类 | 默认 Base URL | 认证方式 |
|----------|-----|---------------|----------|
| OpenAI | `OpenAIProvider` | `https://api.openai.com/v1` | `Authorization: Bearer {api_key}` |
| Claude | `ClaudeProvider` | `https://api.anthropic.com/v1` | `x-api-key: {api_key}` |
| Ollama | `OllamaProvider` | `http://localhost:11434` | 无 |

**所有 Provider 支持**：
- `chat(messages, **kwargs)` — 非流式对话
- `stream(messages, **kwargs)` — 流式对话（Generator）

#### AIConfig

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `provider` | `"openai"` | Provider 名称 |
| `api_key` | `None` | API Key |
| `base_url` | `None` | 自定义 Base URL |
| `model` | `"gpt-4o-mini"` | 模型 |
| `temperature` | `0.7` | 温度 |
| `max_tokens` | `2000` | 最大 Token |
| `timeout` | `60` | 超时（秒） |
| `proxy` | `None` | 代理 |

#### AIEngine 方法

| 方法 | 说明 |
|------|------|
| `generate(prompt, system, **kwargs)` | 通用生成 |
| `generate_structured(prompt, system, **kwargs)` | 生成结构化 JSON（自动解析） |
| `summarize(text, max_length, **kwargs)` | 生成摘要 |
| `rewrite(text, style, **kwargs)` | 改写文本 |

**JSON 解析容错**：
1. 尝试直接解析
2. 尝试从 ` ```json ` 代码块提取
3. 尝试从 ` ``` ` 代码块提取

#### 异常类型

| 异常 | 说明 |
|------|------|
| `AIEngineError` | 通用错误 |
| `AIProviderNotFoundError` | Provider 不存在 |
| `AIAPIError` | API 调用错误 |

### 8.2 分析器

**文件**: `contentforge/processing/analyzer.py`

`Analyzer` 提供主题提取、关键词提取、情感分析和内容质量评估。

**分析模式**：

| 模式 | 说明 |
|------|------|
| `ai` | 调用 LLM 深度分析（默认） |
| `quick` | 基于规则的高速分析 |
| `both` | 两者结合（AI 负责 topics/entities，快速模式补充 keywords） |

**AI 分析输出**：
- `topics` — 3-5 个主题
- `keywords` — 10-15 个关键词
- `entities` — 命名实体
- `sentiment` — 情感标签（positive/neutral/negative）+ 置信度 + 解释
- `audience` — 目标受众
- `quality_score` — 质量评分（1-10）

**快速分析规则**：
- 分词：保留中文和英文，去除标点
- 关键词：频率统计，去除停用词
- 情感：基于正负词典计数
- 主题：基于关键词共现映射到预定义主题
- 实体：匹配大写组合（英文）和引号内容

### 8.3 摘要器

**文件**: `contentforge/processing/summarizer.py`

`Summarizer` 调用 AI Engine 生成结构化摘要。

**支持风格**：

| 风格 | 说明 |
|------|------|
| `structured` | 结构化（What I Learned + Key Patterns + One-Sentence Summary） |
| `concise` | 简洁（<150 词） |
| `detailed` | 详细（全面分析） |
| `bullets` | 要点列表（7-10 项） |
| `executive` | 执行摘要（100-200 词，面向决策者） |

**结构化摘要解析**：
- 提取 `### What I Learned` 下的列表项
- 提取 `### Key Patterns` 下的列表项
- 提取 `### One-Sentence Summary`
- 提取 `### Confidence Assessment`

### 8.4 翻译器

**文件**: `contentforge/processing/translator.py`

`Translator` 支持多语言翻译。

**支持语言**（部分）：
- `zh` — 中文（简体）
- `en` — English
- `ja` — 日本語
- `ko` — 한국어
- `de`, `fr`, `es`, `it`, `pt`, `ru`, `ar`, `hi`, `th`, `vi` ...

**翻译模式**：

| 模式 | 说明 |
|------|------|
| `full` | 完整翻译（默认） |
| `summary` | 摘要式翻译 |
| `concise` | 精简翻译 |

**特性**：
- 自动语言检测（基于字符比例：中文 >30%，日文 >20%，韩文 >20%，默认英文）
- 长文本自动分段（每段 8000 字符）
- 翻译缓存（基于文本前 500 字符的 hash）
- 上下文感知翻译（`translate_with_context`）

### 8.5 小红书转换器

**文件**: `contentforge/processing/xiaohongshu_converter.py`

`XiaohongshuConverter` 将内容转换为小红书风格文案。

**转换模式**：

| 模式 | 说明 |
|------|------|
| AI 模式 | 调用 LLM 高质量改写（推荐，需 engine） |
| 模板模式 | 基于规则快速转换（无需 AI） |

**小红书风格规则**：
1. 标题：emoji 开头，制造悬念或共鸣（20 字以内）
2. 开场：第一人称建立信任（"我发现""亲测"）
3. 正文：短段落、大量 emoji、关键信息加粗
4. 标签：文末 3-5 个 `#话题`
5. 互动：结尾引导点赞收藏

**后处理**：
- 调整 emoji 密度（low/medium/high）
- 字数控制（自动截断到 max_length）
- 质量评分（length, emoji, hashtag, interaction, structure 五维度）

---

## 9. CLI 桥接层

### 9.1 主入口

**文件**: `contentforge/cli/__init__.py`

Python CLI 作为 Go 后端的子进程被调用：

```bash
python -m contentforge.cli <subcommand> [args]
```

**子命令**：

| 命令 | 说明 | 数据来源 |
|------|------|----------|
| `scrape` | 采集内容 | `stdin` JSON payload |
| `process` | AI 处理 | `stdin` JSON payload |
| `publish` | 发布/导出 | `stdin` JSON payload |
| `pipeline` | 流水线操作 | `stdin` JSON payload |

**通信协议**：
- 输入：`stdin` 中的 JSON payload
- 输出：`stdout` 中的 JSON 结果
- 日志：`stderr`

### 9.2 Bridge 模块

**文件**: `contentforge/cli/bridge.py`

提供 argparse 风格的 CLI 接口，支持以下命令：

| 命令 | 参数 | 说明 |
|------|------|------|
| `scrape` | `--url`, `--type`, `--backend` | 采集内容 |
| `process` | `--input`, `--mode`, `--target-lang`, `--tone`, `--max-length` | AI 处理 |
| `publish` | `--input`, `--format` | 发布/导出 |
| `pipeline_list` | 无 | 列出预设 |
| `pipeline_run` | `--preset`, `--url`, `--feed-url`, `--input` | 执行流水线 |
| `pipeline_create` | `--preset`, `--new-name`, `--output` | 基于预设创建 |
| `pipeline_status` | `--run-id` | 查询状态 |

### 9.3 各子命令处理器

**文件**: `contentforge/cli/scrape.py`, `process.py`, `publish.py`, `pipeline.py`

**统一输入格式**：
```json
{
  "action": "summarize",
  "input_data": "...",
  "url": "...",
  "...": "..."
}
```

**统一输出格式**：
```json
{
  "success": true,
  "data": { ... }
}
```
或
```json
{
  "success": false,
  "error": "错误信息"
}
```

---

## 10. 工具系统

**文件**: `contentforge/ai/tools.py`

### 10.1 工具定义

**`ToolParameter`**：
- `name`, `type`, `description`, `required`, `enum`, `default`

**`ToolDefinition`**：
- `name`, `description`, `parameters`, `handler`, `requires_confirmation`, `async_handler`, `category`, `icon`
- `to_openai_schema()` — 转换为 OpenAI Function Calling Schema
- `to_claude_schema()` — 转换为 Claude Tool Use Schema

**`ToolExecutionResult`**：
- `success`, `output`, `error`, `duration_ms`, `metadata`

### 10.2 工具执行器

`ToolExecutor` 管理所有可用工具。

**内置工具列表**：

| 工具名 | 类别 | 说明 |
|--------|------|------|
| `scrape` | ingestion | 从 URL 采集内容 |
| `analyze` | processing | 分析内容 |
| `summarize` | processing | 生成摘要 |
| `rewrite` | processing | 改写风格 |
| `translate` | processing | 翻译内容 |
| `xiaohongshu_convert` | processing | 转小红书文案 |
| `run_pipeline` | pipeline | 执行预设流水线 |
| `search_assets` | asset | 搜索内容资产库 |
| `get_asset_detail` | asset | 获取资产详情 |
| `publish` | publishing | 导出内容 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `register(tool)` | 注册工具 |
| `execute(name, args)` | 执行工具 |
| `describe_tools(tool_names)` | 生成工具描述文本 |
| `get_schemas_for_llm(tool_names)` | 获取 LLM 可用的 Schema 列表 |

---

## 11. 错误处理与日志

### 11.1 日志配置

所有模块使用标准 `logging` 库：

```python
logger = logging.getLogger(__name__)
```

**CLI 日志格式**：
```
%(asctime)s [%(levelname)s] %(name)s: %(message)s
```

### 11.2 异常体系

| 模块 | 异常类 | 说明 |
|------|--------|------|
| `ai_engine` | `AIEngineError` | AI Engine 通用错误 |
| `ai_engine` | `AIProviderNotFoundError` | Provider 不存在 |
| `ai_engine` | `AIAPIError` | API 调用错误 |
| `analyzer` | `AnalyzerError` | 分析器错误 |
| `summarizer` | `SummarizerError` | 摘要器错误 |
| `translator` | `TranslatorError` | 翻译器错误 |
| `xiaohongshu_converter` | `XiaohongshuError` | 小红书转换错误 |
| `pipeline/engine` | `PipelineEngineError` | 流水线引擎错误 |
| `pipeline/presets` | `PresetError` | 预设错误 |
| `pipeline/runner` | `PipelineRunnerError` | 运行器错误 |
| `content_access` | `ContentAccessError` | 内容访问通用错误 |
| `content_access` | `AssetNotFoundError` | 资产不存在 |
| `content_access` | `DatabaseConnectionError` | 数据库连接失败 |
| `content_access` | `FileAccessError` | 文件系统访问失败 |
| `video_inspector` | `VideoInspectorError` | 视频检查器通用错误 |
| `video_inspector` | `FFmpegNotFoundError` | FFmpeg 未安装 |
| `video_inspector` | `YTDLPNotFoundError` | yt-dlp 未安装 |
| `video_inspector` | `VideoProbeError` | 视频探测失败 |
| `skill_context` | `ToolNotFoundError` | 工具未找到 |
| `skill_context` | `ToolExecutionError` | 工具执行错误 |

---

## 12. 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI 桥接层                            │
│              (scrape / process / publish / pipeline)         │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
    ┌─────────▼─────────┐         ┌───────────▼──────────┐
    │    采集模块        │         │      处理模块         │
    │  (agent_reach)    │         │   (ai_engine)        │
    │  (web_scraper)    │◄────────┤   (analyzer)         │
    │  (transcriber)    │         │   (summarizer)       │
    └─────────┬─────────┘         │   (translator)       │
              │                   │   (xiaohongshu)      │
              │                   └───────────┬──────────┘
              │                               │
    ┌─────────▼───────────────────────────────▼────────────┐
    │              核心数据模型 (models.py)                 │
    │           ContentUnit / Pipeline / PipelineRun       │
    └─────────┬───────────────────────────────┬────────────┘
              │                               │
    ┌─────────▼─────────┐         ┌───────────▼────────────┐
    │    流水线模块      │         │       AI 模块          │
    │  (engine)         │         │  (agent_registry)      │
    │  (presets)        │         │  (agent_router)        │
    │  (runner)         │         │  (agent_session)       │
    └───────────────────┘         │  (content_access)      │
                                  │  (asset_retriever)     │
                                  │  (video_inspector)     │
                                  │  (skill_*)             │
                                  └───────────┬────────────┘
                                              │
                                  ┌───────────▼────────────┐
                                  │      配置管理          │
                                  │    (config.py)         │
                                  └────────────────────────┘
```

---

## 附录 A：数据库 Schema 参考

### content_assets 表

```sql
CREATE TABLE IF NOT EXISTS content_assets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT,
    description TEXT,
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
    pipeline_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 索引

```sql
CREATE INDEX IF NOT EXISTS idx_assets_type ON content_assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON content_assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_platform ON content_assets(source_platform);
CREATE INDEX IF NOT EXISTS idx_assets_created ON content_assets(created_at);
CREATE INDEX IF NOT EXISTS idx_assets_pipeline ON content_assets(pipeline_id);
```

### FTS5 虚拟表

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS content_assets_fts USING fts5(
    id, title, extracted_text, summary, transcript,
    content='content_assets', content_rowid='rowid'
);
```

### agent_registry 表

```sql
CREATE TABLE IF NOT EXISTS agent_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    model TEXT,
    provider TEXT,
    temperature REAL,
    max_tokens INTEGER,
    skills TEXT,
    tools TEXT,
    memory_enabled INTEGER,
    max_history INTEGER,
    metadata TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS agent_states (
    agent_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    current_task TEXT,
    memory_snapshot TEXT,
    context_variables TEXT,
    last_active TEXT,
    error_message TEXT,
    metrics TEXT,
    FOREIGN KEY (agent_id) REFERENCES agent_definitions(id)
);
```

---

**文档结束**
