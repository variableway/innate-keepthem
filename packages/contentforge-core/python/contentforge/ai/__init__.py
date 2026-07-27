"""ContentForge AI 模块 — 本地内容访问层与 Agent 调用层。

提供：
1. 本地内容访问层（ContentAccess, AssetRetriever, VideoInspector）
   - SQLite 数据库查询、文件系统读取、文本检索、视频元数据提取
2. Agent 层（AgentRegistry, AgentRouter, AgentSession）
   - Agent 注册、发现、切换、生命周期管理
"""

from contentforge.ai.content_access import ContentAccess, ContentAccessError
from contentforge.ai.asset_retriever import AssetRetriever, AssetSearchResult
from contentforge.ai.video_inspector import VideoInspector, VideoMetadata

from contentforge.ai.agent_registry import (
    AgentRegistry,
    AgentDefinition,
    AgentState,
    AgentStatus,
    AgentRole,
    SkillManifest,
    SkillRegistry,
)

from contentforge.ai.agent_router import (
    AgentRouter,
    RouteResult,
    RoutingDecision,
    CollaborationPlan,
)

from contentforge.ai.agent_session import (
    AgentSession,
    SessionConfig,
    ChatMessage,
    MessageRole,
    ToolDefinition,
    ToolCall,
    ToolResult,
)

__all__ = [
    # Content Access Layer
    "ContentAccess",
    "ContentAccessError",
    "AssetRetriever",
    "AssetSearchResult",
    "VideoInspector",
    "VideoMetadata",
    # Agent Registry
    "AgentRegistry",
    "AgentDefinition",
    "AgentState",
    "AgentStatus",
    "AgentRole",
    "SkillManifest",
    "SkillRegistry",
    # Agent Router
    "AgentRouter",
    "RouteResult",
    "RoutingDecision",
    "CollaborationPlan",
    # Agent Session
    "AgentSession",
    "SessionConfig",
    "ChatMessage",
    "MessageRole",
    "ToolDefinition",
    "ToolCall",
    "ToolResult",
]
