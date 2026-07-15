"""ContentForge AI 模块 — Skill 调用层与 Agent 框架。

本模块实现 Chat 对话框的 Skill 调用层：
- SkillLoader: 从 ~/.agents/skills/contentforge/ 加载 Markdown+YAML Frontmatter 格式 Skill
- SkillExecutor: 执行 Skill 的 ReAct 风格 Agent 框架
- SkillContext: 提供本地内容访问（SQLite、文件系统、视频元数据）的执行上下文

设计原则：
- 与现有 AIEngine 复用，不引入 LangChain
- 自研轻量 ReAct 风格 Agent 框架
- 支持流式响应和工具调用（Function Calling）
- Skill 采用 Markdown + YAML Frontmatter 格式
"""

from .skill_loader import SkillLoader, SkillDefinition, SkillTrigger
from .skill_executor import SkillExecutor, AgentDecision, ToolCall, ToolResult
from .skill_context import SkillContext, ContentAccess, FileAccess, ToolRegistry

__all__ = [
    "SkillLoader",
    "SkillDefinition",
    "SkillTrigger",
    "SkillExecutor",
    "AgentDecision",
    "ToolCall",
    "ToolResult",
    "SkillContext",
    "ContentAccess",
    "FileAccess",
    "ToolRegistry",
]
