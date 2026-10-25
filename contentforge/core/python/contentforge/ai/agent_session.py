"""Agent Session — Agent 运行时会话、ReAct 循环、工具调用与流式响应。"""
import json
import logging
import re
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Any, AsyncGenerator, Callable, Dict, Generator, List, Optional, Union

from contentforge.processing.ai_engine import AIEngine, AIConfig
from contentforge.ai.agent_registry import (
    AgentRegistry, AgentDefinition, AgentState, AgentStatus, AgentRole,
    SkillManifest, SkillRegistry,
)
from contentforge.ai.agent_router import AgentRouter, RouteResult, RoutingDecision

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------------------
# 消息模型
# ------------------------------------------------------------------------------

class MessageRole(Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    AGENT = "agent"          # 多 Agent 对话中的 Agent 消息


@dataclass
class ChatMessage:
    """聊天消息 — 统一消息格式。"""
    id: str
    role: MessageRole
    content: str
    agent_id: Optional[str] = None    # 发送方 Agent ID
    tool_call: Optional[Dict[str, Any]] = None  # 工具调用信息
    tool_result: Optional[Dict[str, Any]] = None  # 工具执行结果
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role.value,
            "content": self.content,
            "agent_id": self.agent_id,
            "tool_call": self.tool_call,
            "tool_result": self.tool_result,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
        }

    def to_llm_message(self) -> Dict[str, str]:
        """转换为 AIEngine 可用的消息格式。"""
        return {
            "role": self.role.value,
            "content": self.content,
        }

    @classmethod
    def user(cls, content: str, **kwargs) -> "ChatMessage":
        return cls(id=f"msg-{uuid.uuid4().hex[:8]}", role=MessageRole.USER, content=content, **kwargs)

    @classmethod
    def assistant(cls, content: str, agent_id: Optional[str] = None, **kwargs) -> "ChatMessage":
        return cls(id=f"msg-{uuid.uuid4().hex[:8]}", role=MessageRole.ASSISTANT, content=content, agent_id=agent_id, **kwargs)

    @classmethod
    def system(cls, content: str, **kwargs) -> "ChatMessage":
        return cls(id=f"msg-{uuid.uuid4().hex[:8]}", role=MessageRole.SYSTEM, content=content, **kwargs)

    @classmethod
    def tool(cls, content: str, tool_result: Dict[str, Any], **kwargs) -> "ChatMessage":
        return cls(id=f"msg-{uuid.uuid4().hex[:8]}", role=MessageRole.TOOL, content=content, tool_result=tool_result, **kwargs)


# ------------------------------------------------------------------------------
# 工具模型
# ------------------------------------------------------------------------------

@dataclass
class ToolDefinition:
    """工具定义 — Function Calling 格式。"""
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema
    handler: Optional[Callable] = None  # 执行函数

    def to_openai_schema(self) -> Dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


@dataclass
class ToolCall:
    """工具调用实例。"""
    id: str
    name: str
    arguments: Dict[str, Any]

    @classmethod
    def from_llm_output(cls, data: Dict[str, Any]) -> "ToolCall":
        return cls(
            id=data.get("id", f"call-{uuid.uuid4().hex[:8]}"),
            name=data["function"]["name"],
            arguments=json.loads(data["function"]["arguments"]) if isinstance(data["function"]["arguments"], str) else data["function"]["arguments"],
        )


@dataclass
class ToolResult:
    """工具执行结果。"""
    call_id: str
    name: str
    success: bool
    result: Any
    error: Optional[str] = None


# ------------------------------------------------------------------------------
# 会话模型
# ------------------------------------------------------------------------------

@dataclass
class SessionConfig:
    """会话配置。"""
    session_id: str
    user_id: Optional[str] = None
    title: str = "New Chat"
    max_turns: int = 50
    enable_multi_agent: bool = True
    enable_skills: bool = True
    enable_tools: bool = True
    stream_response: bool = True
    persist_history: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)


class AgentSession:
    """Agent 会话 — 完整的 ReAct 风格 Agent 运行时。

    核心职责：
    1. 对话历史管理 — 消息存储、上下文截断、持久化
    2. ReAct 循环 — Thought → Action → Observation → Response
    3. 工具调用 — Function Calling 解析与执行
    4. Skill 执行 — 触发 Skill 并处理结果
    5. 多 Agent 协作 — 在会话内切换 Agent、传递上下文
    6. 流式响应 — 支持流式输出 token
    7. 本地内容访问 — SQLite 查询、文件读取、ContentUnit 检索

    与现有 AIEngine 复用，不引入 LangChain。
    """

    # 工具注册表（类级别，所有会话共享）
    _tools: Dict[str, ToolDefinition] = {}
    _tool_initialized = False

    def __init__(
        self,
        config: Optional[SessionConfig] = None,
        registry: Optional[AgentRegistry] = None,
        router: Optional[AgentRouter] = None,
        ai_engine: Optional[AIEngine] = None,
    ):
        self.config = config or SessionConfig(session_id=f"session-{uuid.uuid4().hex[:8]}")
        self.registry = registry or AgentRegistry()
        self.router = router or AgentRouter(registry=self.registry, ai_engine=ai_engine)
        self.ai_engine = ai_engine

        # 会话状态
        self._messages: List[ChatMessage] = []
        self._active_agent_id: Optional[str] = None
        self._agent_stack: List[str] = []  # 多 Agent 嵌套调用栈
        self._context: Dict[str, Any] = {}
        self._turn_count = 0
        self._is_streaming = False

        # 初始化工具
        if not AgentSession._tool_initialized:
            self._init_builtin_tools()
            AgentSession._tool_initialized = True

        # 初始化系统消息
        self._add_system_message()

    # ------------------------------------------------------------------
    # 工具注册
    # ------------------------------------------------------------------

    @classmethod
    def register_tool(cls, tool: ToolDefinition) -> None:
        """注册全局工具。"""
        cls._tools[tool.name] = tool
        logger.info("Registered tool: %s", tool.name)

    @classmethod
    def get_tool(cls, name: str) -> Optional[ToolDefinition]:
        return cls._tools.get(name)

    @classmethod
    def list_tools(cls) -> List[ToolDefinition]:
        return list(cls._tools.values())

    def _init_builtin_tools(self) -> None:
        """初始化内置工具（本地内容访问）。"""
        # 1. 查询 SQLite 内容资产
        self.register_tool(ToolDefinition(
            name="query_content_units",
            description="Query ContentForge content units from SQLite database. Supports filtering by type, status, tags, and text search.",
            parameters={
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max results", "default": 10},
                    "type": {"type": "string", "description": "Content type filter: video, article, tweet, etc."},
                    "status": {"type": "string", "description": "Status filter: ingested, processed, ready, etc."},
                    "search": {"type": "string", "description": "Text search in title or description"},
                    "tags": {"type": "string", "description": "Comma-separated tag filters"},
                },
                "required": [],
            },
            handler=self._tool_query_content_units,
        ))

        # 2. 读取本地文件
        self.register_tool(ToolDefinition(
            name="read_file",
            description="Read a local file and return its contents. Use for accessing documents, transcripts, metadata files.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute file path"},
                    "max_length": {"type": "integer", "description": "Max characters to read", "default": 10000},
                },
                "required": ["path"],
            },
            handler=self._tool_read_file,
        ))

        # 3. 列出内容资产
        self.register_tool(ToolDefinition(
            name="list_content_assets",
            description="List all content assets in the database with summary statistics.",
            parameters={
                "type": "object",
                "properties": {
                    "platform": {"type": "string", "description": "Filter by platform"},
                },
                "required": [],
            },
            handler=self._tool_list_content_assets,
        ))

        # 4. 获取视频元数据
        self.register_tool(ToolDefinition(
            name="get_video_metadata",
            description="Get metadata for a specific video content unit including transcript, duration, platform info.",
            parameters={
                "type": "object",
                "properties": {
                    "content_id": {"type": "string", "description": "Content unit ID"},
                },
                "required": ["content_id"],
            },
            handler=self._tool_get_video_metadata,
        ))

        # 5. 执行 Skill
        self.register_tool(ToolDefinition(
            name="execute_skill",
            description="Execute a registered skill by name with parameters. Use when the user wants to perform a specific action like publishing, summarizing, or rewriting.",
            parameters={
                "type": "object",
                "properties": {
                    "skill_name": {"type": "string", "description": "Name of the skill to execute"},
                    "params": {"type": "object", "description": "Skill parameters as key-value pairs"},
                },
                "required": ["skill_name"],
            },
            handler=self._tool_execute_skill,
        ))

        # 6. 切换 Agent
        self.register_tool(ToolDefinition(
            name="switch_agent",
            description="Switch to a different agent for specialized handling. Available agents: writer, analyst, researcher, publisher, assistant.",
            parameters={
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string", "description": "Name or ID of the agent to switch to"},
                    "reason": {"type": "string", "description": "Why this agent is needed"},
                },
                "required": ["agent_name"],
            },
            handler=self._tool_switch_agent,
        ))

    # ------------------------------------------------------------------
    # 工具实现
    # ------------------------------------------------------------------

    def _tool_query_content_units(self, limit: int = 10, type: Optional[str] = None,
                                   status: Optional[str] = None, search: Optional[str] = None,
                                   tags: Optional[str] = None) -> Dict[str, Any]:
        """查询 SQLite 中的 ContentUnit。"""
        try:
            from contentforge.config import get_config
            cfg = get_config()
            state_dir = Path(cfg.state_dir or Path.home() / ".contentforge")
            db_path = state_dir / "contentforge.db"

            if not db_path.exists():
                return {"success": False, "error": "Database not found", "results": []}

            import sqlite3
            with sqlite3.connect(str(db_path)) as conn:
                conn.row_factory = sqlite3.Row
                query = "SELECT id, title, type, status, source_platform, created_at FROM content_units WHERE 1=1"
                params = []
                if type:
                    query += " AND type = ?"
                    params.append(type)
                if status:
                    query += " AND status = ?"
                    params.append(status)
                if search:
                    query += " AND (title LIKE ? OR description LIKE ?)"
                    params.extend([f"%{search}%", f"%{search}%"])
                if tags:
                    query += " AND tags LIKE ?"
                    params.append(f"%{tags}%")
                query += " ORDER BY created_at DESC LIMIT ?"
                params.append(limit)

                rows = conn.execute(query, params).fetchall()
                results = [dict(row) for row in rows]
                return {"success": True, "count": len(results), "results": results}
        except Exception as exc:
            logger.error("query_content_units failed: %s", exc)
            return {"success": False, "error": str(exc), "results": []}

    def _tool_read_file(self, path: str, max_length: int = 10000) -> Dict[str, Any]:
        """读取本地文件。"""
        try:
            file_path = Path(path)
            if not file_path.exists():
                return {"success": False, "error": f"File not found: {path}"}
            if not file_path.is_file():
                return {"success": False, "error": f"Not a file: {path}"}

            content = file_path.read_text(encoding="utf-8", errors="ignore")
            if len(content) > max_length:
                content = content[:max_length] + f"\n\n... [truncated, total {len(content)} chars]"
            return {"success": True, "path": str(path), "content": content, "size": len(content)}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    def _tool_list_content_assets(self, platform: Optional[str] = None) -> Dict[str, Any]:
        """列出内容资产统计。"""
        try:
            result = self._tool_query_content_units(limit=1000)
            if not result["success"]:
                return result

            items = result["results"]
            stats = {}
            for item in items:
                t = item.get("type", "unknown")
                stats[t] = stats.get(t, 0) + 1

            return {
                "success": True,
                "total": len(items),
                "by_type": stats,
                "recent": items[:5],
            }
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    def _tool_get_video_metadata(self, content_id: str) -> Dict[str, Any]:
        """获取视频元数据。"""
        try:
            from contentforge.config import get_config
            cfg = get_config()
            state_dir = Path(cfg.state_dir or Path.home() / ".contentforge")
            db_path = state_dir / "contentforge.db"

            if not db_path.exists():
                return {"success": False, "error": "Database not found"}

            import sqlite3
            with sqlite3.connect(str(db_path)) as conn:
                conn.row_factory = sqlite3.Row
                row = conn.execute(
                    "SELECT * FROM content_units WHERE id = ? AND type = 'video'",
                    (content_id,)
                ).fetchone()
                if not row:
                    return {"success": False, "error": f"Video not found: {content_id}"}
                return {"success": True, "metadata": dict(row)}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    def _tool_execute_skill(self, skill_name: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """执行 Skill。"""
        skill = self.registry.skill_registry.get(skill_name)
        if not skill:
            return {"success": False, "error": f"Skill not found: {skill_name}"}

        handler = self.registry.skill_registry.get_handler(skill_name)
        if not handler:
            return {"success": False, "error": f"No handler registered for skill: {skill_name}"}

        try:
            result = handler(**(params or {}))
            return {"success": True, "skill": skill_name, "result": result}
        except Exception as exc:
            logger.error("Skill execution failed: %s", exc)
            return {"success": False, "error": str(exc)}

    def _tool_switch_agent(self, agent_name: str, reason: str = "") -> Dict[str, Any]:
        """切换当前 Agent。"""
        agent = self.registry.find_by_name(agent_name)
        if not agent:
            # 尝试按 ID 查找
            agent = self.registry.get(agent_name)
        if not agent:
            return {"success": False, "error": f"Agent not found: {agent_name}"}

        self._switch_to_agent(agent.id)
        return {
            "success": True,
            "agent_id": agent.id,
            "agent_name": agent.name,
            "reason": reason,
        }

    # ------------------------------------------------------------------
    # 会话管理
    # ------------------------------------------------------------------

    def _add_system_message(self) -> None:
        """添加系统消息。"""
        base_system = (
            "You are an AI assistant in ContentForge. "
            "You have access to tools and skills. "
            "When you need to use a tool, respond with a JSON function call. "
            "Available tools: query_content_units, read_file, list_content_assets, "
            "get_video_metadata, execute_skill, switch_agent. "
            "Think step by step. If a task requires multiple steps, plan them first."
        )
        self._messages.append(ChatMessage.system(base_system))

    def _switch_to_agent(self, agent_id: str) -> None:
        """切换到指定 Agent。"""
        agent = self.registry.get(agent_id)
        if not agent:
            logger.warning("Attempted to switch to unknown agent: %s", agent_id)
            return

        self._active_agent_id = agent_id
        self._agent_stack.append(agent_id)

        # 添加 Agent 切换系统消息
        switch_msg = (
            f"[System] Now acting as {agent.name} ({agent.role.value}). "
            f"Description: {agent.description}"
        )
        if agent.system_prompt:
            switch_msg += f"\n\nAgent instructions:\n{agent.system_prompt}"

        # 添加 Skill 上下文
        if agent.skills:
            skill_ctx = self.registry.skill_registry.to_prompt_context(agent.skills)
            switch_msg += f"\n\n{skill_ctx}"

        self._messages.append(ChatMessage.system(switch_msg))
        self.registry.update_state(agent_id, status=AgentStatus.BUSY)
        logger.info("Switched to agent: %s", agent.name)

    def _get_active_agent(self) -> Optional[AgentDefinition]:
        if self._active_agent_id:
            return self.registry.get(self._active_agent_id)
        return None

    def _build_messages_for_llm(self) -> List[Dict[str, str]]:
        """构建发送给 LLM 的消息列表（含上下文截断）。"""
        agent = self._get_active_agent()
        max_history = agent.max_history if agent else 20

        # 保留系统消息，截断历史
        system_msgs = [m for m in self._messages if m.role == MessageRole.SYSTEM]
        other_msgs = [m for m in self._messages if m.role != MessageRole.SYSTEM]

        # 保留最近 max_history 轮
        if len(other_msgs) > max_history * 2:
            other_msgs = other_msgs[-max_history * 2:]
            # 添加提示说明历史被截断
            other_msgs.insert(0, ChatMessage.system(
                "[Note] Earlier conversation history has been truncated to manage context length."
            ))

        all_msgs = system_msgs + other_msgs
        return [m.to_llm_message() for m in all_msgs]

    # ------------------------------------------------------------------
    # 核心 ReAct 循环
    # ------------------------------------------------------------------

    def send_message(self, user_message: str, context: Optional[Dict[str, Any]] = None) -> str:
        """同步发送消息，返回完整响应。"""
        # 路由决策
        route = self.router.route(user_message, context)

        # 根据路由决策执行
        if route.decision == RoutingDecision.SKILL and route.skill_name:
            return self._execute_skill_flow(route, user_message)
        elif route.decision == RoutingDecision.COLLABORATE:
            return self._execute_collaboration_flow(route, user_message)
        else:
            # DIRECT / DELEGATE / CLARIFY — 单 Agent 对话
            return self._execute_chat_flow(user_message, route)

    def send_message_stream(
        self,
        user_message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """流式发送消息，产出增量 token 和事件。

        Yields: {
            "type": "thinking" | "tool_call" | "tool_result" | "token" | "agent_switch" | "done",
            "data": Any
        }
        """
        self._is_streaming = True

        # 路由
        yield {"type": "thinking", "data": "Analyzing your request..."}
        route = self.router.route(user_message, context)
        yield {"type": "thinking", "data": f"Routed to: {route.target_agent_ids[0] if route.target_agent_ids else 'assistant'}"}

        # 确保有 active agent
        if not self._active_agent_id or route.target_agent_ids:
            target_id = route.target_agent_ids[0] if route.target_agent_ids else "agent-assistant"
            if self._active_agent_id != target_id:
                self._switch_to_agent(target_id)
                agent = self._get_active_agent()
                yield {"type": "agent_switch", "data": {"agent_id": target_id, "agent_name": agent.name if agent else "Assistant"}}

        # 添加用户消息
        user_msg = ChatMessage.user(user_message)
        self._messages.append(user_msg)
        self._turn_count += 1

        # ReAct 循环
        max_iterations = 5
        for iteration in range(max_iterations):
            yield {"type": "thinking", "data": f"Thinking... (step {iteration + 1})"}

            # 调用 LLM
            llm_messages = self._build_messages_for_llm()
            agent = self._get_active_agent()

            if not self.ai_engine:
                yield {"type": "error", "data": "AIEngine not initialized"}
                return

            # 收集完整响应以检测工具调用
            full_response = ""
            for chunk in self.ai_engine.provider.stream(llm_messages, model=agent.model if agent else None):
                full_response += chunk
                yield {"type": "token", "data": chunk}

            # 检测工具调用
            tool_calls = self._extract_tool_calls(full_response)
            if not tool_calls:
                # 无工具调用，直接作为最终回复
                assistant_msg = ChatMessage.assistant(full_response, agent_id=self._active_agent_id)
                self._messages.append(assistant_msg)
                yield {"type": "done", "data": {"response": full_response, "agent_id": self._active_agent_id}}
                break

            # 执行工具调用
            for tool_call in tool_calls:
                yield {"type": "tool_call", "data": {"name": tool_call.name, "arguments": tool_call.arguments}}

                tool_def = self._tools.get(tool_call.name)
                if not tool_def or not tool_def.handler:
                    error_result = ToolResult(
                        call_id=tool_call.id,
                        name=tool_call.name,
                        success=False,
                        result=None,
                        error=f"Tool {tool_call.name} not found or no handler",
                    )
                else:
                    try:
                        result = tool_def.handler(**tool_call.arguments)
                        error_result = ToolResult(
                            call_id=tool_call.id,
                            name=tool_call.name,
                            success=True,
                            result=result,
                        )
                    except Exception as exc:
                        error_result = ToolResult(
                            call_id=tool_call.id,
                            name=tool_call.name,
                            success=False,
                            result=None,
                            error=str(exc),
                        )

                # 添加工具结果到对话
                tool_content = json.dumps(error_result.result if error_result.success else error_result.error, ensure_ascii=False)
                tool_msg = ChatMessage.tool(
                    content=f"Tool {tool_call.name} result: {tool_content}",
                    tool_result={"call_id": tool_call.id, "name": tool_call.name, "success": error_result.success, "result": error_result.result, "error": error_result.error},
                )
                self._messages.append(tool_msg)
                yield {"type": "tool_result", "data": {"name": tool_call.name, "success": error_result.success, "result": error_result.result}}

        self._is_streaming = False
        self._persist_state()

    # ------------------------------------------------------------------
    # 执行流程
    # ------------------------------------------------------------------

    def _execute_chat_flow(self, user_message: str, route: RouteResult) -> str:
        """执行单 Agent 对话流。"""
        # 确保 active agent
        target_id = route.target_agent_ids[0] if route.target_agent_ids else "agent-assistant"
        if self._active_agent_id != target_id:
            self._switch_to_agent(target_id)

        # 添加用户消息
        self._messages.append(ChatMessage.user(user_message))
        self._turn_count += 1

        # ReAct 循环
        max_iterations = 5
        for _ in range(max_iterations):
            llm_messages = self._build_messages_for_llm()
            agent = self._get_active_agent()

            if not self.ai_engine:
                return "Error: AIEngine not initialized"

            response = self.ai_engine.provider.chat(llm_messages, model=agent.model if agent else None)

            # 检测工具调用
            tool_calls = self._extract_tool_calls(response)
            if not tool_calls:
                self._messages.append(ChatMessage.assistant(response, agent_id=self._active_agent_id))
                self._persist_state()
                return response

            # 执行工具
            for tool_call in tool_calls:
                self._execute_tool_call(tool_call)

        return "Error: Max iterations reached"

    def _execute_skill_flow(self, route: RouteResult, user_message: str) -> str:
        """执行 Skill 触发流。"""
        skill_name = route.skill_name
        skill_params = route.skill_params

        # 找到支持该 Skill 的 Agent
        target_id = route.target_agent_ids[0] if route.target_agent_ids else "agent-assistant"
        if self._active_agent_id != target_id:
            self._switch_to_agent(target_id)

        # 添加用户消息
        self._messages.append(ChatMessage.user(user_message))

        # 直接执行 Skill
        skill = self.registry.skill_registry.get(skill_name)
        if skill and skill.system_prompt:
            self._messages.append(ChatMessage.system(f"[Skill Context] {skill.system_prompt}"))

        # 构建 Skill 执行 prompt
        skill_prompt = f"Execute skill: {skill_name}\nParameters: {json.dumps(skill_params, ensure_ascii=False)}\n\nUser request: {user_message}"
        self._messages.append(ChatMessage.user(skill_prompt))

        # 调用 LLM 生成 Skill 执行结果
        llm_messages = self._build_messages_for_llm()
        response = self.ai_engine.provider.chat(llm_messages)

        self._messages.append(ChatMessage.assistant(response, agent_id=self._active_agent_id))
        self._persist_state()
        return response

    def _execute_collaboration_flow(self, route: RouteResult, user_message: str) -> str:
        """执行多 Agent 协作流。"""
        plan_id, steps = self.router.auto_collaborate(user_message)
        if not plan_id:
            # 退化为单 Agent
            return self._execute_chat_flow(user_message, route)

        results = []
        shared_context = {"user_message": user_message}

        for update in self.router.execute_collaboration_plan(plan_id, shared_context):
            if update.get("status") == "ready":
                step = update
                agent_id = step["agent_id"]
                task = step["task"]
                output_key = step["output_key"]

                # 切换 Agent
                self._switch_to_agent(agent_id)

                # 执行子任务
                self._messages.append(ChatMessage.user(task))
                llm_messages = self._build_messages_for_llm()
                response = self.ai_engine.provider.chat(llm_messages)
                self._messages.append(ChatMessage.assistant(response, agent_id=agent_id))

                shared_context[output_key] = response
                results.append({"agent": agent_id, "output": response})

        # 汇总结果
        summary_prompt = f"Summarize the following collaboration results:\n\n{json.dumps(results, ensure_ascii=False, indent=2)}"
        # 切回 orchestrator 或第一个 Agent
        if self.registry.get("agent-orchestrator"):
            self._switch_to_agent("agent-orchestrator")
        self._messages.append(ChatMessage.user(summary_prompt))
        llm_messages = self._build_messages_for_llm()
        final_response = self.ai_engine.provider.chat(llm_messages)
        self._messages.append(ChatMessage.assistant(final_response, agent_id=self._active_agent_id))

        self._persist_state()
        return final_response

    # ------------------------------------------------------------------
    # 工具调用解析与执行
    # ------------------------------------------------------------------

    def _extract_tool_calls(self, response: str) -> List[ToolCall]:
        """从 LLM 响应中提取工具调用。

        支持格式：
        1. JSON 代码块中的 function call
        2. ReAct 风格：Action: tool_name\nAction Input: {...}
        """
        tool_calls = []

        # 尝试匹配 JSON 代码块
        json_pattern = r'```json\s*(\{.*?\})\s*```'
        for match in re.finditer(json_pattern, response, re.DOTALL):
            try:
                data = json.loads(match.group(1))
                if "name" in data and "arguments" in data:
                    tool_calls.append(ToolCall.from_llm_output({"function": data}))
            except json.JSONDecodeError:
                continue

        # 尝试 ReAct 风格
        react_pattern = r'Action:\s*(\w+)\s*Action Input:\s*(\{.*?\})'
        for match in re.finditer(react_pattern, response, re.DOTALL):
            try:
                name = match.group(1)
                args = json.loads(match.group(2))
                tool_calls.append(ToolCall(id=f"call-{uuid.uuid4().hex[:8]}", name=name, arguments=args))
            except json.JSONDecodeError:
                continue

        # 尝试 inline JSON function call
        try:
            if response.strip().startswith("{"):
                data = json.loads(response.strip())
                if "function" in data or ("name" in data and "arguments" in data):
                    if "function" in data:
                        tool_calls.append(ToolCall.from_llm_output(data))
                    else:
                        tool_calls.append(ToolCall(
                            id=f"call-{uuid.uuid4().hex[:8]}",
                            name=data["name"],
                            arguments=data["arguments"],
                        ))
        except json.JSONDecodeError:
            pass

        return tool_calls

    def _execute_tool_call(self, tool_call: ToolCall) -> ToolResult:
        """执行单个工具调用。"""
        tool_def = self._tools.get(tool_call.name)
        if not tool_def or not tool_def.handler:
            result = ToolResult(
                call_id=tool_call.id,
                name=tool_call.name,
                success=False,
                result=None,
                error=f"Tool {tool_call.name} not found",
            )
        else:
            try:
                output = tool_def.handler(**tool_call.arguments)
                result = ToolResult(
                    call_id=tool_call.id,
                    name=tool_call.name,
                    success=True,
                    result=output,
                )
            except Exception as exc:
                result = ToolResult(
                    call_id=tool_call.id,
                    name=tool_call.name,
                    success=False,
                    result=None,
                    error=str(exc),
                )

        # 添加工具结果到对话历史
        tool_content = json.dumps(result.result if result.success else result.error, ensure_ascii=False)
        self._messages.append(ChatMessage.tool(
            content=f"Tool {tool_call.name} result: {tool_content}",
            tool_result={"call_id": tool_call.id, "name": tool_call.name, "success": result.success, "result": result.result, "error": result.error},
        ))
        return result

    # ------------------------------------------------------------------
    # 持久化
    # ------------------------------------------------------------------

    def _persist_state(self) -> None:
        """持久化会话状态到 AgentState。"""
        if not self.config.persist_history or not self._active_agent_id:
            return

        # 提取当前 Agent 的记忆快照
        agent_msgs = [
            m.to_llm_message() for m in self._messages
            if m.role in (MessageRole.USER, MessageRole.ASSISTANT, MessageRole.TOOL)
        ]

        self.registry.update_state(
            self._active_agent_id,
            memory_snapshot=agent_msgs[-20:],  # 保留最近 20 条
            context_variables=self._context,
        )

    def export_history(self) -> List[Dict[str, Any]]:
        """导出完整对话历史。"""
        return [m.to_dict() for m in self._messages]

    def clear_history(self) -> None:
        """清空对话历史（保留系统消息）。"""
        self._messages = [m for m in self._messages if m.role == MessageRole.SYSTEM]
        self._turn_count = 0
        self._context = {}
        logger.info("Session history cleared")

    def get_stats(self) -> Dict[str, Any]:
        """获取会话统计。"""
        return {
            "session_id": self.config.session_id,
            "turn_count": self._turn_count,
            "message_count": len(self._messages),
            "active_agent": self._active_agent_id,
            "agent_stack": self._agent_stack,
        }

    # ------------------------------------------------------------------
    # 便捷方法
    # ------------------------------------------------------------------

    def set_active_agent(self, agent_id: str) -> bool:
        """手动设置当前 Agent。"""
        if not self.registry.get(agent_id):
            return False
        self._switch_to_agent(agent_id)
        return True

    def get_active_agent(self) -> Optional[AgentDefinition]:
        return self._get_active_agent()

    def add_context(self, key: str, value: Any) -> None:
        """添加上下文变量。"""
        self._context[key] = value

    def get_context(self, key: str) -> Any:
        return self._context.get(key)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._persist_state()
        # 释放 Agent
        if self._active_agent_id:
            self.registry.update_state(self._active_agent_id, status=AgentStatus.IDLE, current_task=None)
