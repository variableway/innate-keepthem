"""SkillExecutor — Skill 执行引擎与 ReAct 风格 Agent 框架。

核心组件：
- AgentDecision: Agent 决策（思考、行动、工具调用）
- SkillExecutor: 执行 Skill 的主引擎，支持 ReAct 循环
- 流式响应支持
- 工具调用（Function Calling）支持

与现有模块集成：
- skill_loader.SkillDefinition: Skill 定义
- skill_context.SkillContext: 执行上下文
- processing.ai_engine.AIEngine: AI 生成

设计原则：
- 不引入 LangChain，自研轻量框架
- 支持流式响应
- 支持 Function Calling（OpenAI 风格）
- 支持 ReAct 风格思考-行动-观察循环
"""

import json
import logging
import re
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Callable, Dict, Generator, List, Optional, Tuple, Union

from contentforge.ai.skills.skill_loader import SkillDefinition, SkillLoader
from contentforge.ai.skills.skill_context import SkillContext, ToolRegistry
from contentforge.processing.ai_engine import AIEngine

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Data Models
# ------------------------------------------------------------------------------


class ActionType(Enum):
    """Agent 行动类型。"""

    THINK = "think"           # 思考/推理
    TOOL_CALL = "tool_call"   # 调用工具
    ANSWER = "answer"         # 直接回答
    CLARIFY = "clarify"       # 请求澄清
    SKILL_SWITCH = "skill_switch"  # 切换 Skill


@dataclass
class ToolCall:
    """工具调用定义。"""

    tool_name: str
    arguments: Dict[str, Any] = field(default_factory=dict)
    call_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.call_id,
            "type": "function",
            "function": {
                "name": self.tool_name,
                "arguments": json.dumps(self.arguments, ensure_ascii=False),
            },
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ToolCall":
        """从 OpenAI Function Calling 格式解析。"""
        func = data.get("function", {})
        args = func.get("arguments", "{}")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        return cls(
            tool_name=func.get("name", ""),
            arguments=args,
            call_id=data.get("id", str(uuid.uuid4())[:8]),
        )


@dataclass
class ToolResult:
    """工具执行结果。"""

    call_id: str
    tool_name: str
    success: bool
    result: Any
    error: Optional[str] = None
    duration_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_call_id": self.call_id,
            "role": "tool",
            "name": self.tool_name,
            "content": json.dumps(self.result, ensure_ascii=False) if self.success else self.error,
        }


@dataclass
class AgentDecision:
    """Agent 决策 — 每一步的思考结果。"""

    action_type: ActionType
    thought: str = ""                    # 思考过程
    tool_calls: List[ToolCall] = field(default_factory=list)  # 工具调用
    answer: str = ""                     # 回答内容
    clarification_question: str = ""     # 澄清问题
    target_skill: Optional[str] = None   # 目标 Skill（切换时）
    confidence: float = 0.0              # 置信度

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action_type": self.action_type.value,
            "thought": self.thought,
            "tool_calls": [tc.to_dict() for tc in self.tool_calls],
            "answer": self.answer,
            "clarification_question": self.clarification_question,
            "target_skill": self.target_skill,
            "confidence": self.confidence,
        }


@dataclass
class ExecutionResult:
    """Skill 执行结果。"""

    success: bool
    skill_name: str
    output: str = ""
    tool_results: List[ToolResult] = field(default_factory=list)
    decisions: List[AgentDecision] = field(default_factory=list)
    error: Optional[str] = None
    execution_time_ms: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "skill_name": self.skill_name,
            "output": self.output,
            "tool_results": [tr.to_dict() for tr in self.tool_results],
            "decisions": [d.to_dict() for d in self.decisions],
            "error": self.error,
            "execution_time_ms": self.execution_time_ms,
            "metadata": self.metadata,
        }


# ------------------------------------------------------------------------------
# ReAct Parser
# ------------------------------------------------------------------------------


class ReActParser:
    """ReAct 风格输出解析器。

    解析格式：
        Thought: 我需要先搜索相关内容
        Action: content_search
        Action Input: {"query": "AI 新闻"}
        Observation: [...]
        
        Thought: 基于搜索结果...
        Action: answer
        Action Input: {"answer": "最终回答"}
    """

    @staticmethod
    def parse(text: str) -> AgentDecision:
        """解析 ReAct 格式的文本输出。"""
        thought = ""
        tool_calls = []
        answer = ""

        # 提取 Thought
        thought_match = re.search(r"Thought:\s*(.+?)(?=\n\s*(?:Action|Answer):|$)", text, re.DOTALL | re.IGNORECASE)
        if thought_match:
            thought = thought_match.group(1).strip()

        # 提取 Action 和 Action Input
        action_match = re.search(r"Action:\s*(\w+)\s*\n\s*Action Input:\s*(.+?)(?=\n\s*(?:Thought|Observation|Answer):|$)", text, re.DOTALL | re.IGNORECASE)
        if action_match:
            action_name = action_match.group(1).strip()
            action_input = action_match.group(2).strip()

            # 解析 Action Input
            try:
                # 尝试 JSON 解析
                if action_input.startswith("{") or action_input.startswith("["):
                    args = json.loads(action_input)
                else:
                    # 尝试从 markdown 代码块提取
                    code_match = re.search(r"```(?:json)?\n(.*?)```", action_input, re.DOTALL)
                    if code_match:
                        args = json.loads(code_match.group(1))
                    else:
                        args = {"input": action_input}
            except json.JSONDecodeError:
                args = {"input": action_input}

            if action_name.lower() in ("answer", "final_answer"):
                answer = args.get("answer", args.get("input", ""))
                return AgentDecision(
                    action_type=ActionType.ANSWER,
                    thought=thought,
                    answer=answer,
                )
            else:
                tool_calls.append(ToolCall(tool_name=action_name, arguments=args))
                return AgentDecision(
                    action_type=ActionType.TOOL_CALL,
                    thought=thought,
                    tool_calls=tool_calls,
                )

        # 提取直接 Answer
        answer_match = re.search(r"Answer:\s*(.+)", text, re.DOTALL | re.IGNORECASE)
        if answer_match:
            answer = answer_match.group(1).strip()
            return AgentDecision(
                action_type=ActionType.ANSWER,
                thought=thought,
                answer=answer,
            )

        # 默认：如果文本较长，视为回答
        if len(text) > 50 and not text.startswith("{"):
            return AgentDecision(
                action_type=ActionType.ANSWER,
                thought=thought,
                answer=text,
            )

        # 无法解析，请求澄清
        return AgentDecision(
            action_type=ActionType.CLARIFY,
            thought=thought,
            clarification_question="我需要更多信息来理解您的请求。",
        )


# ------------------------------------------------------------------------------
# Function Calling Parser (OpenAI 风格)
# ------------------------------------------------------------------------------


class FunctionCallingParser:
    """OpenAI Function Calling 格式解析器。"""

    @staticmethod
    def parse(response: Dict[str, Any]) -> AgentDecision:
        """解析 OpenAI Function Calling 响应。"""
        message = response.get("choices", [{}])[0].get("message", {})
        
        # 检查是否有 tool_calls
        tool_calls_data = message.get("tool_calls", [])
        if tool_calls_data:
            tool_calls = [ToolCall.from_dict(tc) for tc in tool_calls_data]
            return AgentDecision(
                action_type=ActionType.TOOL_CALL,
                thought=message.get("content", ""),
                tool_calls=tool_calls,
            )
        
        # 普通内容回复
        content = message.get("content", "")
        if content:
            return AgentDecision(
                action_type=ActionType.ANSWER,
                thought="",
                answer=content,
            )
        
        return AgentDecision(
            action_type=ActionType.CLARIFY,
            clarification_question="我无法理解您的请求。",
        )


# ------------------------------------------------------------------------------
# Skill Executor
# ------------------------------------------------------------------------------


class SkillExecutor:
    """Skill 执行引擎 — 自研轻量 ReAct 风格 Agent 框架。

    特性：
    - 与现有 AIEngine 复用，不引入 LangChain
    - 支持 ReAct 风格思考-行动-观察循环
    - 支持 OpenAI Function Calling 风格
    - 支持流式响应
    - 支持工具调用
    - 支持 Skill 切换

    使用示例：
        # 基础执行
        executor = SkillExecutor(ai_engine=ai_engine)
        result = executor.execute(skill, user_input="把这篇文章发到小红书", context=context)
        print(result.output)

        # 流式执行
        for chunk in executor.stream_execute(skill, user_input="...", context=context):
            print(chunk, end="")
    """

    def __init__(
        self,
        ai_engine: AIEngine,
        skill_loader: Optional[SkillLoader] = None,
        tool_registry: Optional[ToolRegistry] = None,
        max_iterations: int = 10,
        react_mode: bool = True,  # True=ReAct, False=Function Calling
    ):
        self.ai_engine = ai_engine
        self.skill_loader = skill_loader or SkillLoader()
        self.tool_registry = tool_registry or ToolRegistry()
        self.max_iterations = max_iterations
        self.react_mode = react_mode
        self.react_parser = ReActParser()
        self.function_parser = FunctionCallingParser()

    # ------------------------------------------------------------------
    # Main Execution
    # ------------------------------------------------------------------

    def execute(
        self,
        skill: SkillDefinition,
        user_input: str,
        context: SkillContext,
        args: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        """执行 Skill。

        Args:
            skill: 要执行的 Skill 定义
            user_input: 用户输入文本
            context: 执行上下文
            args: 已解析的参数

        Returns:
            ExecutionResult 执行结果
        """
        import time
        start_time = time.time()

        # 验证参数
        if args:
            valid, errors = skill.validate_args(args)
            if not valid:
                return ExecutionResult(
                    success=False,
                    skill_name=skill.name,
                    error=f"参数验证失败: {', '.join(errors)}",
                )
            args = skill.fill_defaults(args)

        # 初始化对话
        messages = self._build_messages(skill, user_input, context, args)
        context.add_message("user", user_input)

        # ReAct 循环
        decisions = []
        tool_results = []
        output = ""

        for iteration in range(self.max_iterations):
            logger.info("[SkillExecutor] Iteration %d/%d for skill '%s'", iteration + 1, self.max_iterations, skill.name)

            # 调用 AI
            try:
                ai_response = self.ai_engine.provider.chat(messages)
            except Exception as e:
                logger.error("[SkillExecutor] AI call failed: %s", e)
                return ExecutionResult(
                    success=False,
                    skill_name=skill.name,
                    error=f"AI 调用失败: {e}",
                    execution_time_ms=int((time.time() - start_time) * 1000),
                )

            # 解析决策
            if self.react_mode:
                decision = self.react_parser.parse(ai_response)
            else:
                # Function Calling 模式需要结构化响应
                try:
                    # 尝试解析为 JSON（如果是结构化响应）
                    response_dict = json.loads(ai_response)
                    decision = self.function_parser.parse({"choices": [{"message": response_dict}]})
                except json.JSONDecodeError:
                    decision = self.react_parser.parse(ai_response)

            decisions.append(decision)
            logger.info("[SkillExecutor] Decision: %s", decision.action_type.value)

            # 处理决策
            if decision.action_type == ActionType.ANSWER:
                output = decision.answer
                context.add_message("assistant", output)
                break

            elif decision.action_type == ActionType.TOOL_CALL:
                # 执行工具调用
                for tool_call in decision.tool_calls:
                    result = self._execute_tool(tool_call, context)
                    tool_results.append(result)

                    # 将结果添加到消息
                    messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [tool_call.to_dict()],
                    })
                    messages.append(result.to_dict())

            elif decision.action_type == ActionType.CLARIFY:
                output = decision.clarification_question
                context.add_message("assistant", output)
                break

            elif decision.action_type == ActionType.SKILL_SWITCH:
                # 切换 Skill
                if decision.target_skill and self.skill_loader:
                    new_skill = self.skill_loader.get(decision.target_skill)
                    if new_skill:
                        logger.info("[SkillExecutor] Switching to skill: %s", new_skill.name)
                        return self.execute(new_skill, user_input, context, args)
                output = f"无法切换到 Skill: {decision.target_skill}"
                break

            elif decision.action_type == ActionType.THINK:
                # 纯思考，继续循环
                messages.append({"role": "assistant", "content": ai_response})
                messages.append({"role": "user", "content": "请继续。"})

        else:
            # 达到最大迭代次数
            output = "执行达到最大迭代次数，请简化您的请求或检查工具配置。"

        execution_time_ms = int((time.time() - start_time) * 1000)

        return ExecutionResult(
            success=True,
            skill_name=skill.name,
            output=output,
            tool_results=tool_results,
            decisions=decisions,
            execution_time_ms=execution_time_ms,
            metadata={
                "iterations": len(decisions),
                "react_mode": self.react_mode,
            },
        )

    def stream_execute(
        self,
        skill: SkillDefinition,
        user_input: str,
        context: SkillContext,
        args: Optional[Dict[str, Any]] = None,
    ) -> Generator[str, None, ExecutionResult]:
        """流式执行 Skill。

        Yields:
            流式输出文本块

        Returns:
            最终 ExecutionResult
        """
        import time
        start_time = time.time()

        # 构建消息
        messages = self._build_messages(skill, user_input, context, args)
        context.add_message("user", user_input)

        decisions = []
        tool_results = []
        output_parts = []

        for iteration in range(self.max_iterations):
            # 流式调用 AI
            full_response = ""
            try:
                for chunk in self.ai_engine.provider.stream(messages):
                    full_response += chunk
                    # 只在回答模式下流式输出
                    if iteration == 0 or not self._is_tool_call(full_response):
                        yield chunk
            except Exception as e:
                logger.error("[SkillExecutor] Streaming failed: %s", e)
                result = ExecutionResult(
                    success=False,
                    skill_name=skill.name,
                    error=f"流式调用失败: {e}",
                    execution_time_ms=int((time.time() - start_time) * 1000),
                )
                return result

            # 解析决策
            if self.react_mode:
                decision = self.react_parser.parse(full_response)
            else:
                try:
                    response_dict = json.loads(full_response)
                    decision = self.function_parser.parse({"choices": [{"message": response_dict}]})
                except json.JSONDecodeError:
                    decision = self.react_parser.parse(full_response)

            decisions.append(decision)

            if decision.action_type == ActionType.ANSWER:
                output = decision.answer
                context.add_message("assistant", output)
                break

            elif decision.action_type == ActionType.TOOL_CALL:
                # 执行工具（非流式）
                for tool_call in decision.tool_calls:
                    result = self._execute_tool(tool_call, context)
                    tool_results.append(result)
                    messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [tool_call.to_dict()],
                    })
                    messages.append(result.to_dict())
                
                # 通知用户正在执行工具
                yield f"\n[执行工具: {', '.join(tc.tool_name for tc in decision.tool_calls)}]\n"

            elif decision.action_type == ActionType.CLARIFY:
                output = decision.clarification_question
                context.add_message("assistant", output)
                break

            elif decision.action_type == ActionType.SKILL_SWITCH:
                if decision.target_skill and self.skill_loader:
                    new_skill = self.skill_loader.get(decision.target_skill)
                    if new_skill:
                        yield f"\n[切换到 Skill: {new_skill.name}]\n"
                        # 递归流式执行（简化：直接返回新结果）
                        sub_result = self.execute(new_skill, user_input, context, args)
                        yield sub_result.output
                        return sub_result
                output = f"无法切换到 Skill: {decision.target_skill}"
                break

            elif decision.action_type == ActionType.THINK:
                messages.append({"role": "assistant", "content": full_response})
                messages.append({"role": "user", "content": "请继续。"})

        else:
            output = "执行达到最大迭代次数。"

        execution_time_ms = int((time.time() - start_time) * 1000)

        result = ExecutionResult(
            success=True,
            skill_name=skill.name,
            output=output,
            tool_results=tool_results,
            decisions=decisions,
            execution_time_ms=execution_time_ms,
            metadata={"iterations": len(decisions), "react_mode": self.react_mode},
        )
        return result

    # ------------------------------------------------------------------
    # Message Building
    # ------------------------------------------------------------------

    def _build_messages(
        self,
        skill: SkillDefinition,
        user_input: str,
        context: SkillContext,
        args: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, str]]:
        """构建 AI 对话消息。"""
        messages = []

        # 系统提示
        system_prompt = skill.system_prompt
        
        # 添加工具描述（Function Calling 模式）
        if not self.react_mode:
            tools_desc = self._build_tools_description(skill)
            system_prompt += "\n\n" + tools_desc

        messages.append({"role": "system", "content": system_prompt})

        # 添加上下文信息
        context_info = self._build_context_info(context)
        if context_info:
            messages.append({"role": "system", "content": f"Context:\n{context_info}"})

        # 添加历史对话
        for msg in context.get_conversation_history(limit=5):
            messages.append(msg)

        # 用户输入
        user_message = user_input
        if args:
            user_message += f"\n\n[已解析参数: {json.dumps(args, ensure_ascii=False)}]"
        
        messages.append({"role": "user", "content": user_message})

        return messages

    def _build_tools_description(self, skill: SkillDefinition) -> str:
        """构建工具描述（用于 Function Calling）。"""
        lines = ["Available tools:"]
        for tool in skill.tools:
            schema = self.tool_registry.get_schema(tool.name)
            if schema:
                lines.append(f"\n{tool.name}: {tool.description}")
                lines.append(f"  Schema: {json.dumps(schema, ensure_ascii=False)}")
            else:
                lines.append(f"\n{tool.name}: {tool.description} (schema not available)")
        
        lines.extend([
            "",
            "Use the format:",
            "  Thought: your reasoning",
            "  Action: tool_name",
            "  Action Input: {\"key\": \"value\"}",
            "  Observation: result",
            "",
            "Or for final answer:",
            "  Thought: your reasoning",
            "  Answer: your final response",
        ])
        
        return "\n".join(lines)

    def _build_context_info(self, context: SkillContext) -> str:
        """构建上下文信息字符串。"""
        info_parts = []
        
        # 内容统计
        stats = context.content.get_stats()
        if stats:
            info_parts.append(f"Content stats: {json.dumps(stats, ensure_ascii=False)}")
        
        # 最近内容
        recent = context.content.get_recent_content(limit=3)
        if recent:
            info_parts.append("Recent content:")
            for unit in recent:
                info_parts.append(f"  - [{unit.id}] {unit.title or 'Untitled'} ({unit.type.value})")
        
        return "\n".join(info_parts)

    # ------------------------------------------------------------------
    # Tool Execution
    # ------------------------------------------------------------------

    def _execute_tool(self, tool_call: ToolCall, context: SkillContext) -> ToolResult:
        """执行单个工具调用。"""
        import time
        start_time = time.time()

        tool_name = tool_call.tool_name
        args = tool_call.arguments

        # 检查工具是否存在
        if not self.tool_registry.has_tool(tool_name):
            # 尝试从 Skill 的工具列表中查找备选
            return ToolResult(
                call_id=tool_call.call_id,
                tool_name=tool_name,
                success=False,
                result=None,
                error=f"Tool not found: {tool_name}",
            )

        # 执行工具
        try:
            result = self.tool_registry.call(tool_name, **args)
            duration_ms = int((time.time() - start_time) * 1000)
            
            # 记录到上下文
            context.add_tool_call(tool_name, args, result)
            
            return ToolResult(
                call_id=tool_call.call_id,
                tool_name=tool_name,
                success=True,
                result=result,
                duration_ms=duration_ms,
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error("[SkillExecutor] Tool %s failed: %s", tool_name, e)
            return ToolResult(
                call_id=tool_call.call_id,
                tool_name=tool_name,
                success=False,
                result=None,
                error=str(e),
                duration_ms=duration_ms,
            )

    def _is_tool_call(self, text: str) -> bool:
        """判断文本是否包含工具调用。"""
        return bool(re.search(r"Action:\s*\w+", text, re.IGNORECASE))

    # ------------------------------------------------------------------
    # Parameter Extraction
    # ------------------------------------------------------------------

    def extract_parameters(
        self,
        skill: SkillDefinition,
        user_input: str,
        context: SkillContext,
    ) -> Dict[str, Any]:
        """从用户输入中提取 Skill 参数。

        使用 AI 模型解析自然语言中的参数。
        """
        if not skill.parameters:
            return {}

        prompt = f"""从用户输入中提取以下参数：

Skill: {skill.name}
Description: {skill.description}

Parameters:
"""
        for param in skill.parameters:
            req = "required" if param.required else f"optional (default: {param.default})"
            prompt += f"  - {param.name} ({param.param_type}, {req}): {param.description}\n"
            if param.enum:
                prompt += f"    Allowed values: {param.enum}\n"

        prompt += f"""

User input: {user_input}

Extract the parameters as JSON. Use null for missing optional parameters.
Only return valid JSON, no other text.

Example output:
{{"param1": "value1", "param2": null}}
"""

        try:
            raw = self.ai_engine.generate(prompt, system="You are a parameter extraction assistant. Output valid JSON only.")
            params = json.loads(raw)
            # 过滤掉 null 值（使用默认值）
            return {k: v for k, v in params.items() if v is not None}
        except Exception as e:
            logger.warning("[SkillExecutor] Parameter extraction failed: %s", e)
            return {}

    # ------------------------------------------------------------------
    # Skill Discovery & Routing
    # ------------------------------------------------------------------

    def route(
        self,
        user_input: str,
        context: SkillContext,
    ) -> Optional[SkillDefinition]:
        """路由用户输入到合适的 Skill。

        1. 先使用 SkillLoader 的触发器匹配
        2. 如果没有匹配，使用 AI 判断
        """
        # 1. 触发器匹配
        if self.skill_loader:
            matches = self.skill_loader.match(user_input, min_confidence=0.5, top_k=1)
            if matches:
                skill, confidence = matches[0]
                logger.info("[SkillExecutor] Routed to '%s' via trigger (confidence=%.2f)", skill.name, confidence)
                return skill

        # 2. AI 路由判断
        available_skills = self.skill_loader.list_skills() if self.skill_loader else []
        if not available_skills:
            return None

        skill_list = "\n".join([
            f"- {s.name}: {s.description} (tags: {', '.join(s.tags)})"
            for s in available_skills[:10]  # 限制数量
        ])

        prompt = f"""Given the user input, determine which skill is most appropriate.

Available skills:
{skill_list}

User input: {user_input}

Respond with the exact skill name, or "none" if no skill matches.
Only return the skill name, no other text.
"""

        try:
            result = self.ai_engine.generate(prompt, system="You are a skill routing assistant.")
            skill_name = result.strip().lower()
            
            if skill_name == "none":
                return None
            
            # 模糊匹配
            for s in available_skills:
                if s.name.lower() == skill_name or skill_name in s.name.lower():
                    logger.info("[SkillExecutor] Routed to '%s' via AI", s.name)
                    return s
            
            return None
        except Exception as e:
            logger.error("[SkillExecutor] AI routing failed: %s", e)
            return None

    def auto_execute(
        self,
        user_input: str,
        context: SkillContext,
    ) -> ExecutionResult:
        """自动路由并执行 Skill。

        完整流程：
        1. 路由到合适的 Skill
        2. 提取参数
        3. 执行 Skill
        """
        # 路由
        skill = self.route(user_input, context)
        if not skill:
            return ExecutionResult(
                success=False,
                skill_name="",
                output="",
                error="未找到匹配的 Skill，请尝试更明确的描述。",
            )

        # 提取参数
        args = self.extract_parameters(skill, user_input, context)
        
        # 执行
        return self.execute(skill, user_input, context, args)

    # ------------------------------------------------------------------
    # Streaming with Function Calling
    # ------------------------------------------------------------------

    def stream_with_tools(
        self,
        skill: SkillDefinition,
        user_input: str,
        context: SkillContext,
        args: Optional[Dict[str, Any]] = None,
    ) -> Generator[Union[str, ToolCall], None, ExecutionResult]:
        """流式执行，支持工具调用事件。

        Yields:
            str: 流式文本输出
            ToolCall: 工具调用事件（需要外部执行）

        Returns:
            ExecutionResult
        """
        import time
        start_time = time.time()

        messages = self._build_messages(skill, user_input, context, args)
        context.add_message("user", user_input)

        decisions = []
        tool_results = []

        for iteration in range(self.max_iterations):
            full_response = ""
            
            # 流式生成
            for chunk in self.ai_engine.provider.stream(messages):
                full_response += chunk
                yield chunk

            # 解析决策
            decision = self.react_parser.parse(full_response)
            decisions.append(decision)

            if decision.action_type == ActionType.ANSWER:
                context.add_message("assistant", decision.answer)
                break

            elif decision.action_type == ActionType.TOOL_CALL:
                # 产出工具调用事件，由外部执行
                for tool_call in decision.tool_calls:
                    yield tool_call
                
                # 注意：外部需要执行工具并将结果通过 add_tool_result 添加
                break  # 流式中断，等待外部工具执行

            elif decision.action_type == ActionType.CLARIFY:
                context.add_message("assistant", decision.clarification_question)
                break

            elif decision.action_type == ActionType.SKILL_SWITCH:
                if decision.target_skill and self.skill_loader:
                    new_skill = self.skill_loader.get(decision.target_skill)
                    if new_skill:
                        yield f"\n[Switching to skill: {new_skill.name}]\n"
                        return self.execute(new_skill, user_input, context, args)
                break

        else:
            full_response = "执行达到最大迭代次数。"

        execution_time_ms = int((time.time() - start_time) * 1000)

        return ExecutionResult(
            success=True,
            skill_name=skill.name,
            output=decision.answer if decisions else "",
            tool_results=tool_results,
            decisions=decisions,
            execution_time_ms=execution_time_ms,
        )

    def add_tool_result(
        self,
        messages: List[Dict[str, str]],
        tool_call: ToolCall,
        result: ToolResult,
    ) -> List[Dict[str, str]]:
        """将工具结果添加到消息列表，继续执行。"""
        messages.append({
            "role": "assistant",
            "content": None,
            "tool_calls": [tool_call.to_dict()],
        })
        messages.append(result.to_dict())
        return messages
