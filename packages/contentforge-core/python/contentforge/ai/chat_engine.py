"""
ContentForge AI Chat Engine — 对话引擎

职责：
- 对话管理（消息历史、会话生命周期）
- 意图识别与 Agent 路由
- 流式响应生成
- 与现有 AIEngine 复用

设计原则：
- 不复用 LangChain，自研轻量框架
- 基于 ReAct（Reasoning + Acting）模式
- Function Calling 标准兼容 OpenAI/Claude
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Generator, List, Optional, Callable
from datetime import datetime

from contentforge.processing.ai_engine import AIEngine, AIConfig
from contentforge.models import ContentUnit

logger = logging.getLogger(__name__)


# ─────────────────────────── 数据模型 ───────────────────────────

@dataclass
class ChatMessage:
    """聊天消息"""
    id: str
    session_id: str
    role: str  # "user" | "assistant" | "system" | "tool"
    content: str
    tool_calls: Optional[List[Dict]] = None
    tool_results: Optional[List[Dict]] = None
    selected_asset_ids: List[str] = field(default_factory=list)
    tokens_used: Optional[Dict[str, int]] = None
    model: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "role": self.role,
            "content": self.content,
            "tool_calls": self.tool_calls,
            "tool_results": self.tool_results,
            "selected_asset_ids": self.selected_asset_ids,
            "tokens_used": self.tokens_used,
            "model": self.model,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class ChatSession:
    """聊天会话"""
    id: str
    title: str
    agent_id: str = "general"
    status: str = "active"  # "active" | "archived" | "pinned"
    linked_task_id: Optional[str] = None
    linked_asset_ids: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "title": self.title,
            "agent_id": self.agent_id,
            "status": self.status,
            "linked_task_id": self.linked_task_id,
            "linked_asset_ids": self.linked_asset_ids,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class ToolCall:
    """工具调用"""
    id: str
    name: str
    args: Dict[str, Any]
    status: str = "pending"  # "pending" | "running" | "completed" | "failed"
    result: Optional[Any] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "args": self.args,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_ms": self.duration_ms,
        }


# ─────────────────────────── 流式事件 ───────────────────────────

@dataclass
class StreamEvent:
    """流式事件"""
    type: str  # "text" | "tool_call" | "tool_result" | "error" | "done"
    message_id: str
    text: Optional[str] = None
    tool_call: Optional[ToolCall] = None
    tool_result: Optional[Dict] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "type": self.type,
            "message_id": self.message_id,
            "text": self.text,
            "tool_call": self.tool_call.to_dict() if self.tool_call else None,
            "tool_result": self.tool_result,
            "error": self.error,
        }


# ─────────────────────────── Chat Engine ───────────────────────────

class ChatEngine:
    """
    Chat Engine — 对话引擎

    核心职责：
    1. 管理对话历史和会话状态
    2. 调用 AI Engine 生成响应
    3. 支持流式输出
    4. 集成工具调用（Function Calling）
    5. Agent 路由与切换

    使用示例：
        engine = ChatEngine(ai_config={"provider": "openai", "model": "gpt-4o"})
        for event in engine.stream_chat(session_id, "分析这个视频"):
            print(event)
    """

    def __init__(
        self,
        ai_config: Optional[Dict[str, Any]] = None,
        agent_registry: Optional["AgentRegistry"] = None,
        tool_executor: Optional["ToolExecutor"] = None,
        session_manager: Optional["SessionManager"] = None,
    ):
        self.ai_engine = AIEngine.from_config(ai_config or {})
        self.agent_registry = agent_registry or AgentRegistry()
        self.tool_executor = tool_executor or ToolExecutor()
        self.session_manager = session_manager or SessionManager()
        self._cancelled_streams: set = set()

    # ─────────────────── 核心对话方法 ───────────────────

    def chat(
        self,
        session_id: str,
        message: str,
        agent_id: Optional[str] = None,
        selected_asset_ids: Optional[List[str]] = None,
    ) -> ChatMessage:
        """非流式对话（用于简单查询）"""
        # 获取或创建会话
        session = self.session_manager.get_session(session_id)
        if not session:
            session = self.session_manager.create_session(session_id)

        # 确定 Agent
        current_agent = agent_id or session.agent_id
        agent = self.agent_registry.get_agent(current_agent)

        # 添加用户消息
        user_msg = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role="user",
            content=message,
            selected_asset_ids=selected_asset_ids or [],
        )
        self.session_manager.add_message(user_msg)

        # 构建上下文
        context = self._build_context(session, agent, user_msg)

        # 调用 AI
        response_text = self.ai_engine.provider.chat(
            messages=context,
            model=agent.model if agent else None,
            temperature=agent.temperature if agent else 0.7,
        )

        # 创建助手消息
        assistant_msg = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role="assistant",
            content=response_text,
            model=agent.model if agent else None,
        )
        self.session_manager.add_message(assistant_msg)

        return assistant_msg

    def stream_chat(
        self,
        session_id: str,
        message: str,
        agent_id: Optional[str] = None,
        selected_asset_ids: Optional[List[str]] = None,
    ) -> Generator[StreamEvent, None, None]:
        """
        流式对话 — 核心方法

        Yields:
            StreamEvent: 流式事件（text / tool_call / tool_result / done / error）
        """
        message_id = str(uuid.uuid4())

        try:
            # 获取或创建会话
            session = self.session_manager.get_session(session_id)
            if not session:
                session = self.session_manager.create_session(session_id)

            # 确定 Agent（支持意图路由）
            current_agent_id = agent_id or session.agent_id
            if not agent_id:
                # 基于意图自动路由
                routed_agent_id = self.agent_registry.route_by_intent(
                    message, selected_asset_ids
                )
                if routed_agent_id != current_agent_id:
                    current_agent_id = routed_agent_id
                    session.agent_id = routed_agent_id
                    yield StreamEvent(
                        type="agent_switched",
                        message_id=message_id,
                        text=json.dumps({
                            "previous_agent_id": session.agent_id,
                            "current_agent_id": current_agent_id,
                            "reason": "基于意图自动路由",
                        }),
                    )

            agent = self.agent_registry.get_agent(current_agent_id)

            # 添加用户消息
            user_msg = ChatMessage(
                id=str(uuid.uuid4()),
                session_id=session_id,
                role="user",
                content=message,
                selected_asset_ids=selected_asset_ids or [],
            )
            self.session_manager.add_message(user_msg)

            # 构建上下文
            context = self._build_context(session, agent, user_msg)

            # 流式生成
            accumulated_text = ""
            for chunk in self.ai_engine.provider.stream(
                messages=context,
                model=agent.model if agent else None,
                temperature=agent.temperature if agent else 0.7,
            ):
                if message_id in self._cancelled_streams:
                    self._cancelled_streams.discard(message_id)
                    yield StreamEvent(type="error", message_id=message_id, error="已取消")
                    return

                accumulated_text += chunk
                yield StreamEvent(type="text", message_id=message_id, text=chunk)

            # 检查是否需要工具调用（ReAct 模式）
            tool_calls = self._extract_tool_calls(accumulated_text)
            if tool_calls:
                for tool_call in tool_calls:
                    yield StreamEvent(
                        type="tool_call",
                        message_id=message_id,
                        tool_call=tool_call,
                    )

                    # 执行工具
                    tool_call.status = "running"
                    tool_call.started_at = datetime.utcnow()

                    try:
                        result = self.tool_executor.execute(
                            tool_call.name, tool_call.args
                        )
                        tool_call.status = "completed"
                        tool_call.result = result
                        tool_call.completed_at = datetime.utcnow()
                        tool_call.duration_ms = int(
                            (tool_call.completed_at - tool_call.started_at).total_seconds() * 1000
                        )

                        yield StreamEvent(
                            type="tool_result",
                            message_id=message_id,
                            tool_result={
                                "call_id": tool_call.id,
                                "name": tool_call.name,
                                "output": result,
                                "duration_ms": tool_call.duration_ms,
                            },
                        )

                    except Exception as e:
                        tool_call.status = "failed"
                        tool_call.error = str(e)
                        tool_call.completed_at = datetime.utcnow()

                        yield StreamEvent(
                            type="tool_result",
                            message_id=message_id,
                            tool_result={
                                "call_id": tool_call.id,
                                "name": tool_call.name,
                                "output": None,
                                "error": str(e),
                                "duration_ms": 0,
                            },
                        )

                # 工具调用后，生成最终响应
                final_response = self._generate_after_tools(
                    session, agent, accumulated_text, tool_calls
                )
                yield StreamEvent(type="text", message_id=message_id, text=final_response)
                accumulated_text += final_response

            # 保存助手消息
            assistant_msg = ChatMessage(
                id=message_id,
                session_id=session_id,
                role="assistant",
                content=accumulated_text,
                tool_calls=[tc.to_dict() for tc in tool_calls] if tool_calls else None,
                model=agent.model if agent else None,
            )
            self.session_manager.add_message(assistant_msg)

            yield StreamEvent(type="done", message_id=message_id)

        except Exception as e:
            logger.error("[ChatEngine] Stream error: %s", e, exc_info=True)
            yield StreamEvent(type="error", message_id=message_id, error=str(e))

    def cancel_stream(self, message_id: str) -> None:
        """取消流式生成"""
        self._cancelled_streams.add(message_id)

    # ─────────────────── 上下文构建 ───────────────────

    def _build_context(
        self,
        session: ChatSession,
        agent: Optional["AgentRole"],
        user_msg: ChatMessage,
    ) -> List[Dict[str, str]]:
        """构建 LLM 上下文消息列表"""
        messages: List[Dict[str, str]] = []

        # 1. System Prompt（Agent 角色定义）
        if agent:
            system_prompt = agent.system_prompt

            # 注入工具列表
            if agent.tools:
                tools_desc = self.tool_executor.describe_tools(agent.tools)
                system_prompt += f"\n\n可用工具:\n{tools_desc}"

            # 注入选中资产上下文
            if user_msg.selected_asset_ids:
                asset_context = self._build_asset_context(user_msg.selected_asset_ids)
                system_prompt += f"\n\n已选中的内容资产:\n{asset_context}"

            messages.append({"role": "system", "content": system_prompt})

        # 2. 历史消息（最近 N 条）
        history = self.session_manager.get_messages(session.id, limit=10)
        for msg in history:
            if msg.role == "user":
                messages.append({"role": "user", "content": msg.content})
            elif msg.role == "assistant":
                content = msg.content
                if msg.tool_results:
                    content += f"\n\n工具结果: {json.dumps(msg.tool_results, ensure_ascii=False)}"
                messages.append({"role": "assistant", "content": content})

        # 3. 当前用户消息
        messages.append({"role": "user", "content": user_msg.content})

        return messages

    def _build_asset_context(self, asset_ids: List[str]) -> str:
        """构建资产上下文描述"""
        # 这里从 Asset Store 获取资产详情
        # 简化实现，实际应从数据库/缓存获取
        context_parts = []
        for asset_id in asset_ids:
            context_parts.append(f"- 资产 ID: {asset_id}")
        return "\n".join(context_parts)

    # ─────────────────── 工具调用提取 ───────────────────

    def _extract_tool_calls(self, text: str) -> List[ToolCall]:
        """
        从 AI 响应中提取工具调用

        支持格式：
        - JSON 格式: {"tool": "name", "args": {...}}
        - XML 格式: <tool name="...">...</tool>
        """
        tool_calls = []

        # 尝试 JSON 格式
        try:
            # 查找 JSON 代码块
            if "```json" in text:
                json_str = text.split("```json")[1].split("```")[0].strip()
                data = json.loads(json_str)
                if "tool" in data:
                    tool_calls.append(ToolCall(
                        id=str(uuid.uuid4()),
                        name=data["tool"],
                        args=data.get("args", {}),
                    ))
        except (json.JSONDecodeError, IndexError):
            pass

        # 尝试内联 JSON
        try:
            # 查找 {"tool": ...} 模式
            import re
            pattern = r'\{[^}]*"tool"\s*:\s*"([^"]+)"[^}]*\}'
            for match in re.finditer(pattern, text):
                try:
                    data = json.loads(match.group(0))
                    tool_calls.append(ToolCall(
                        id=str(uuid.uuid4()),
                        name=data["tool"],
                        args=data.get("args", {}),
                    ))
                except json.JSONDecodeError:
                    continue
        except Exception:
            pass

        return tool_calls

    def _generate_after_tools(
        self,
        session: ChatSession,
        agent: Optional["AgentRole"],
        original_text: str,
        tool_calls: List[ToolCall],
    ) -> str:
        """工具调用后生成最终响应"""
        # 构建包含工具结果的上下文
        messages = []
        if agent:
            messages.append({"role": "system", "content": agent.system_prompt})

        messages.append({"role": "user", "content": "基于工具执行结果，给出最终回答。"})

        tool_results_text = "\n".join([
            f"工具 {tc.name} 结果: {json.dumps(tc.result, ensure_ascii=False) if tc.result else '执行失败: ' + str(tc.error)}"
            for tc in tool_calls
        ])

        messages.append({"role": "user", "content": tool_results_text})

        return self.ai_engine.provider.chat(messages=messages)


# ─────────────────────────── 占位类（完整实现在其他文件） ───────────────────────────

class AgentRegistry:
    """Agent 注册表 — 完整实现在 agent.py"""
    def __init__(self):
        self.agents: Dict[str, "AgentRole"] = {}

    def get_agent(self, agent_id: str) -> Optional["AgentRole"]:
        return self.agents.get(agent_id)

    def route_by_intent(self, message: str, selected_asset_ids: Optional[List[str]] = None) -> str:
        return "general"


class ToolExecutor:
    """工具执行器 — 完整实现在 tools.py"""
    def __init__(self):
        self.tools: Dict[str, Callable] = {}

    def execute(self, name: str, args: Dict[str, Any]) -> Any:
        handler = self.tools.get(name)
        if not handler:
            raise ValueError(f"Unknown tool: {name}")
        return handler(**args)

    def describe_tools(self, tool_names: List[str]) -> str:
        return ""


class SessionManager:
    """会话管理器 — 完整实现在 session.py"""
    def __init__(self):
        self.sessions: Dict[str, ChatSession] = {}
        self.messages: Dict[str, List[ChatMessage]] = {}

    def get_session(self, session_id: str) -> Optional[ChatSession]:
        return self.sessions.get(session_id)

    def create_session(self, session_id: str) -> ChatSession:
        session = ChatSession(id=session_id, title="新会话")
        self.sessions[session_id] = session
        return session

    def add_message(self, message: ChatMessage) -> None:
        if message.session_id not in self.messages:
            self.messages[message.session_id] = []
        self.messages[message.session_id].append(message)

    def get_messages(self, session_id: str, limit: int = 10) -> List[ChatMessage]:
        messages = self.messages.get(session_id, [])
        return messages[-limit:] if len(messages) > limit else messages
