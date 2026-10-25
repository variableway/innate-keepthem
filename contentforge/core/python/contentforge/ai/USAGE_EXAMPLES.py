"""
ContentForge Agent 调用层 — 使用示例与集成指南
================================================

本文件演示如何使用 AgentRegistry、AgentRouter、AgentSession 三个核心组件。

## 快速开始

### 1. 基本对话（单 Agent）

```python
from contentforge.ai import AgentSession, SessionConfig
from contentforge.processing.ai_engine import AIEngine, AIConfig

# 初始化 AIEngine
ai_engine = AIEngine(AIConfig(
    provider="openai",
    api_key="your-api-key",
    model="gpt-4o-mini",
))

# 创建会话
session = AgentSession(
    config=SessionConfig(session_id="demo-1", title="Demo Chat"),
    ai_engine=ai_engine,
)

# 发送消息
response = session.send_message("帮我总结一下最近的视频内容")
print(response)
```

### 2. 流式响应

```python
for event in session.send_message_stream("分析这篇文章的数据"):
    if event["type"] == "token":
        print(event["data"], end="", flush=True)
    elif event["type"] == "tool_call":
        print(f"\n[Tool] {event['data']['name']}")
    elif event["type"] == "done":
        print("\n[Complete]")
```

### 3. Agent 切换

```python
# 手动切换到写作 Agent
session.set_active_agent("agent-writer")
response = session.send_message("把这段内容改写成小红书风格")

# 切换到发布 Agent
session.set_active_agent("agent-publisher")
response = session.send_message("发布到小红书")
```

### 4. 使用 Router 自动路由

```python
from contentforge.ai import AgentRouter

router = AgentRouter(ai_engine=ai_engine)

# 自动分析意图并路由
result = router.route("把这篇文章发到小红书")
print(result.decision)        # SKILL
print(result.skill_name)      # publish_content
print(result.target_agent_ids)  # ["agent-publisher"]
```

### 5. 多 Agent 协作

```python
# 创建协作计划
plan_id = router.create_collaboration_plan(
    description="Research and publish",
    steps=[
        {"agent_id": "agent-researcher", "task": "Research trending topics", "depends_on": [], "output_key": "research"},
        {"agent_id": "agent-writer", "task": "Write article based on research", "depends_on": [0], "output_key": "article"},
        {"agent_id": "agent-publisher", "task": "Format and publish article", "depends_on": [1], "output_key": "published"},
    ]
)

# 执行协作计划
for update in router.execute_collaboration_plan(plan_id):
    print(f"Step {update['step_index']}: {update['status']}")
```

### 6. 自定义 Agent 注册

```python
from contentforge.ai import AgentRegistry, AgentDefinition, AgentRole

registry = AgentRegistry()

# 创建自定义 Agent
agent_id = registry.create_custom_agent(
    name="SEO Specialist",
    description="SEO 优化专家，擅长关键词分析和标题优化",
    system_prompt="You are an SEO specialist. Optimize content for search engines.",
    model="gpt-4o",
    skills=["keyword_analysis", "title_optimization", "meta_description"],
)

# 或者使用完整定义
agent_def = AgentDefinition(
    id="agent-seo",
    name="SEO Specialist",
    role=AgentRole.CUSTOM,
    description="SEO 优化专家",
    system_prompt="You are an SEO specialist...",
    model="gpt-4o",
    skills=["keyword_analysis"],
)
registry.register(agent_def)
```

### 7. Skill 注册与使用

```python
from contentforge.ai import SkillManifest

# 注册自定义 Skill（代码方式）
def my_skill_handler(content: str, platform: str = "xiaohongshu"):
    return f"Formatted {content} for {platform}"

skill = SkillManifest(
    name="custom_format",
    description="Custom content formatter",
    parameters={
        "content": {"type": "string", "required": True, "description": "Content to format"},
        "platform": {"type": "string", "required": False, "default": "xiaohongshu"},
    },
    entrypoint="my_skill_handler",
)

registry.skill_registry.register(skill, handler=my_skill_handler)

# 通过自然语言触发
response = session.send_message("用 custom_format 处理这段内容")
```

### 8. 本地内容访问工具

```python
# Agent 会自动使用以下工具访问本地内容：
# - query_content_units: 查询 SQLite 内容资产
# - read_file: 读取本地文件
# - list_content_assets: 列出所有内容资产
# - get_video_metadata: 获取视频元数据

response = session.send_message("帮我找一下最近下载的视频")
# Agent 会自动调用 query_content_units 工具

response = session.send_message("读取 /path/to/transcript.txt 的内容")
# Agent 会自动调用 read_file 工具
```

### 9. 上下文管理

```python
# 添加上下文变量
session.add_context("current_platform", "xiaohongshu")
session.add_context("content_id", "unit-123")

# 获取上下文
platform = session.get_context("current_platform")

# 导出对话历史
history = session.export_history()
for msg in history:
    print(f"[{msg['role']}] {msg['content'][:100]}...")

# 清空历史（保留系统消息）
session.clear_history()
```

### 10. 状态持久化

```python
# Agent 状态自动持久化到 SQLite
# 路径: ~/.contentforge/agent_registry.db

# 查看所有 Agent 状态
states = registry.get_all_states()
for agent_id, state in states.items():
    print(f"{agent_id}: {state.status.value}")

# 重置 Agent 状态
registry.reset_state("agent-writer")
```

## 与现有模块集成

### 与 AIEngine 集成

AgentSession 直接使用现有的 AIEngine 作为 LLM 后端：

```python
from contentforge.processing.ai_engine import AIEngine, AIConfig
from contentforge.ai import AgentSession

ai_engine = AIEngine(AIConfig(provider="openai", api_key="..."))
session = AgentSession(ai_engine=ai_engine)
```

### 与 Pipeline 集成

```python
from contentforge.pipeline.engine import PipelineEngine
from contentforge.ai import AgentSession

# Agent 可以触发 Pipeline 执行
session.add_context("pipeline_engine", PipelineEngine())

# 在 Skill 中调用 Pipeline
def run_pipeline_skill(pipeline_id: str, content_unit_id: str):
    engine = session.get_context("pipeline_engine")
    return engine.run(pipeline_id, content_unit_id)
```

### 与 ContentUnit 集成

```python
from contentforge.models import ContentUnit

# Agent 可以读取 ContentUnit 数据
session.add_context("content_unit", content_unit)

# 在对话中引用
response = session.send_message("分析这个内容单元的数据表现")
```

## 架构关系

```
Chat UI (Next.js)
    ↓ HTTP/WebSocket
AgentSession ──→ AgentRouter ──→ AgentRegistry
    │                 │                │
    ↓                 ↓                ↓
AIEngine ←──── ReAct Loop ←── SkillRegistry
    │                 │                │
    ↓                 ↓                ↓
OpenAI/Claude    Tool Calls      Markdown Skills
    │                 │                │
    ↓                 ↓                ↓
SQLite DB ←── Local Content ←── File System
```

## 文件清单

- `agent_registry.py` — Agent 注册、发现、生命周期、状态持久化
- `agent_router.py` — 意图路由、Agent 调度、协作编排
- `agent_session.py` — ReAct 循环、工具调用、流式响应、上下文管理
- `__init__.py` — 统一导出
- `USAGE_EXAMPLES.py` — 本文档

## 注意事项

1. AgentRegistry 是单例模式，全局共享 Agent 定义和状态
2. Skill 采用 Markdown + YAML Frontmatter 格式，存放于 ~/.contentforge/skills/
3. 工具调用使用 ReAct 风格（Action/Action Input）或 JSON function call
4. 流式响应通过 Generator 实现，前端可逐 token 渲染
5. 状态持久化使用 SQLite，路径由 config.state_dir 决定
"""

# 以下代码可直接运行进行测试

if __name__ == "__main__":
    print("ContentForge Agent 调用层 — 使用示例")
    print("=" * 50)
    print()
    print("请阅读本文件中的注释和示例代码了解如何使用。")
    print()
    print("核心导入：")
    print("  from contentforge.ai import AgentRegistry, AgentRouter, AgentSession")
    print()
    print("快速测试（无需 API Key）：")
    print("  python -c \"from contentforge.ai import AgentRegistry; r = AgentRegistry(); print(list(a.name for a in r.list_agents()))\"")
