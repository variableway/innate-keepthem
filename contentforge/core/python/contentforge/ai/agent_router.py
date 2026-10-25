"""Agent Router — 意图路由、Agent 调度与协作编排。"""
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Generator, List, Optional, Tuple

from contentforge.processing.ai_engine import AIEngine, AIConfig
from contentforge.ai.agent_registry import (
    AgentRegistry, AgentDefinition, AgentState, AgentStatus, AgentRole,
    SkillManifest,
)

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------------------
# 路由模型
# ------------------------------------------------------------------------------

class RoutingDecision(Enum):
    """路由决策类型。"""
    DIRECT = "direct"           # 直接路由到指定 Agent
    DELEGATE = "delegate"       # 委派给子 Agent
    COLLABORATE = "collaborate" # 多 Agent 协作
    SKILL = "skill"             # 直接触发 Skill
    CLARIFY = "clarify"         # 需要澄清


@dataclass
class RouteResult:
    """路由结果 — 包含决策和上下文。"""
    decision: RoutingDecision
    target_agent_ids: List[str] = field(default_factory=list)
    skill_name: Optional[str] = None
    skill_params: Dict[str, Any] = field(default_factory=dict)
    reasoning: str = ""
    confidence: float = 0.0
    user_message: str = ""       # 原始用户消息
    context: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "decision": self.decision.value,
            "target_agent_ids": self.target_agent_ids,
            "skill_name": self.skill_name,
            "skill_params": self.skill_params,
            "reasoning": self.reasoning,
            "confidence": self.confidence,
            "user_message": self.user_message,
            "context": self.context,
        }


@dataclass
class CollaborationPlan:
    """多 Agent 协作计划。"""
    plan_id: str
    description: str
    steps: List[Dict[str, Any]] = field(default_factory=list)
    # step: {agent_id, task, depends_on, output_key}
    created_at: datetime = field(default_factory=datetime.utcnow)
    status: str = "pending"  # pending | running | completed | failed


# ------------------------------------------------------------------------------
# Agent Router
# ------------------------------------------------------------------------------

class AgentRouter:
    """Agent 路由器 — 负责用户意图分析、Agent 调度、多 Agent 协作编排。

    核心职责：
    1. 意图识别 — 分析用户消息，决定路由策略
    2. Agent 选择 — 基于意图匹配最合适的 Agent
    3. 协作编排 — 规划多 Agent 执行顺序和依赖
    4. Skill 触发 — 识别自然语言中的 Skill 调用意图
    5. 上下文传递 — 在 Agent 间传递共享上下文

    与现有 AIEngine 复用，不引入 LangChain。
    """

    def __init__(
        self,
        registry: Optional[AgentRegistry] = None,
        ai_engine: Optional[AIEngine] = None,
        orchestrator_agent_id: str = "agent-orchestrator",
    ):
        self.registry = registry or AgentRegistry()
        self.ai_engine = ai_engine
        self._orchestrator_id = orchestrator_agent_id
        self._collaboration_plans: Dict[str, CollaborationPlan] = {}
        self._route_history: List[RouteResult] = []
        self._max_history = 50

    # ------------------------------------------------------------------
    # 核心路由方法
    # ------------------------------------------------------------------

    def route(self, user_message: str, context: Optional[Dict[str, Any]] = None) -> RouteResult:
        """分析用户消息，返回路由决策。

        路由流程：
        1. 快速模式匹配（关键词/正则）
        2. 如果匹配失败，调用 Orchestrator Agent 做 LLM 推理
        3. 返回 RouteResult
        """
        ctx = context or {}

        # 1. 快速模式匹配 — 关键词触发 Skill
        quick_match = self._quick_match(user_message)
        if quick_match:
            logger.info("Quick match routed to skill: %s", quick_match.skill_name)
            return quick_match

        # 2. 检查是否显式指定 Agent（@AgentName 格式）
        explicit_agent = self._extract_explicit_agent(user_message)
        if explicit_agent:
            logger.info("Explicit agent routing to: %s", explicit_agent)
            return RouteResult(
                decision=RoutingDecision.DIRECT,
                target_agent_ids=[explicit_agent],
                user_message=user_message,
                reasoning="Explicit agent mention detected",
                confidence=1.0,
                context=ctx,
            )

        # 3. LLM 推理路由 — 使用 Orchestrator Agent
        return self._llm_route(user_message, ctx)

    def _quick_match(self, message: str) -> Optional[RouteResult]:
        """基于关键词和正则的快速路由匹配。"""
        message_lower = message.lower()

        # Skill 关键词映射
        skill_patterns = {
            "publish_content": [
                r"发布到(.+)",
                r"发到(.+)",
                r"publish to (.+)",
                r"post to (.+)",
                r"分享到(.+)",
            ],
            "summarize": [
                r"总结(.+)",
                r"摘要(.+)",
                r"summarize (.+)",
                r"tl;dr",
            ],
            "rewrite_content": [
                r"改写(.+)",
                r"润色(.+)",
                r"rewrite (.+)",
                r"polish (.+)",
            ],
            "format_for_platform": [
                r"转成(.+)格式",
                r"适配(.+)",
                r"format for (.+)",
                r"convert to (.+) style",
            ],
            "web_search": [
                r"搜索(.+)",
                r"查一下(.+)",
                r"search for (.+)",
                r"look up (.+)",
            ],
            "analyze_engagement": [
                r"分析(.+)数据",
                r"数据分析",
                r"analyze (.+) data",
                r"engagement analysis",
            ],
        }

        for skill_name, patterns in skill_patterns.items():
            for pattern in patterns:
                match = re.search(pattern, message_lower)
                if match:
                    # 提取参数
                    params = {}
                    if match.groups():
                        params["target"] = match.group(1).strip()
                    # 查找支持该 Skill 的 Agent
                    agents = self.registry.find_by_skill(skill_name)
                    if agents:
                        return RouteResult(
                            decision=RoutingDecision.SKILL,
                            target_agent_ids=[agents[0].id],
                            skill_name=skill_name,
                            skill_params=params,
                            user_message=message,
                            reasoning=f"Keyword matched pattern: {pattern}",
                            confidence=0.85,
                        )

        return None

    def _extract_explicit_agent(self, message: str) -> Optional[str]:
        """提取 @AgentName 格式的显式 Agent 指定。"""
        # 匹配 @AgentName 或 @agent-name 格式
        match = re.search(r"@([\w\-]+)", message)
        if not match:
            return None

        mention = match.group(1)
        # 尝试精确匹配
        agent = self.registry.find_by_name(mention)
        if agent:
            return agent.id

        # 尝试模糊匹配
        agents = self.registry.search(mention)
        if agents:
            return agents[0].id

        return None

    def _llm_route(self, message: str, context: Dict[str, Any]) -> RouteResult:
        """使用 LLM 进行意图识别和路由决策。"""
        orchestrator = self.registry.get(self._orchestrator_id)
        if not orchestrator:
            # Fallback: 直接路由到通用助手
            assistant = self.registry.find_by_name("General Assistant")
            agent_id = assistant.id if assistant else "agent-assistant"
            return RouteResult(
                decision=RoutingDecision.DIRECT,
                target_agent_ids=[agent_id],
                user_message=message,
                reasoning="Orchestrator not found, fallback to assistant",
                confidence=0.5,
                context=context,
            )

        # 构建路由 prompt
        prompt = self._build_routing_prompt(message, context)

        # 使用 AIEngine 进行推理
        if self.ai_engine is None:
            # 尝试创建默认 AIEngine
            try:
                from contentforge.config import get_config
                cfg = get_config()
                provider_cfg = cfg.get_ai_provider()
                self.ai_engine = AIEngine(AIConfig(
                    provider=provider_cfg.name,
                    api_key=provider_cfg.api_key,
                    base_url=provider_cfg.base_url or None,
                    model=provider_cfg.default_model or "gpt-4o-mini",
                ))
            except Exception as exc:
                logger.error("Failed to create AIEngine for routing: %s", exc)
                return RouteResult(
                    decision=RoutingDecision.CLARIFY,
                    user_message=message,
                    reasoning=f"AIEngine initialization failed: {exc}",
                    confidence=0.0,
                    context=context,
                )

        try:
            system_prompt = orchestrator.system_prompt + "\n\n" + self._build_agent_catalog_prompt()
            raw_response = self.ai_engine.generate(
                prompt=prompt,
                system=system_prompt,
                max_tokens=1500,
                temperature=0.2,
            )
            return self._parse_routing_response(raw_response, message, context)
        except Exception as exc:
            logger.error("LLM routing failed: %s", exc)
            return RouteResult(
                decision=RoutingDecision.CLARIFY,
                user_message=message,
                reasoning=f"LLM routing error: {exc}",
                confidence=0.0,
                context=context,
            )

    def _build_routing_prompt(self, message: str, context: Dict[str, Any]) -> str:
        """构建路由推理 prompt。"""
        lines = [
            "Analyze the following user request and determine the best routing decision.",
            "",
            f"User message: \"{message}\"",
            "",
            "Available routing decisions:",
            "- DIRECT: Route to a single specialist agent",
            "- DELEGATE: Break down into sub-tasks and delegate",
            "- COLLABORATE: Multiple agents need to work together",
            "- SKILL: Directly trigger a specific skill",
            "- CLARIFY: Need more information from user",
            "",
            "Respond with a JSON object in this exact format:",
            "{\n"
            '  "decision": "DIRECT|DELEGATE|COLLABORATE|SKILL|CLARIFY",',
            '  "target_agents": ["agent-id-1", "agent-id-2"],',
            '  "skill_name": "optional-skill-name",',
            '  "skill_params": {"param1": "value1"},',
            '  "reasoning": "explain why this routing was chosen",',
            '  "confidence": 0.95',
            "}",
        ]

        if context.get("active_agents"):
            lines.append(f"\nActive agents in conversation: {context['active_agents']}")
        if context.get("previous_routes"):
            lines.append(f"Previous routing context: {context['previous_routes']}")

        return "\n".join(lines)

    def _build_agent_catalog_prompt(self) -> str:
        """构建可用 Agent 目录 prompt。"""
        lines = ["## Available Agents", ""]
        for agent in self.registry.list_agents():
            skills_str = ", ".join(agent.skills) if agent.skills else "none"
            lines.append(f"- {agent.id}: {agent.name} ({agent.role.value})")
            lines.append(f"  Description: {agent.description}")
            lines.append(f"  Skills: {skills_str}")
            lines.append("")
        return "\n".join(lines)

    def _parse_routing_response(self, raw: str, message: str, context: Dict[str, Any]) -> RouteResult:
        """解析 LLM 路由响应为 RouteResult。"""
        try:
            # 提取 JSON
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()

            data = json.loads(raw)
            decision = RoutingDecision(data.get("decision", "CLARIFY").lower())
            target_agents = data.get("target_agents", [])

            # 验证 Agent ID 存在
            valid_agents = [aid for aid in target_agents if self.registry.get(aid)]
            if not valid_agents and decision in (RoutingDecision.DIRECT, RoutingDecision.DELEGATE, RoutingDecision.COLLABORATE):
                # Fallback 到通用助手
                assistant = self.registry.find_by_name("General Assistant")
                if assistant:
                    valid_agents = [assistant.id]
                decision = RoutingDecision.DIRECT

            result = RouteResult(
                decision=decision,
                target_agent_ids=valid_agents,
                skill_name=data.get("skill_name"),
                skill_params=data.get("skill_params", {}),
                reasoning=data.get("reasoning", ""),
                confidence=data.get("confidence", 0.5),
                user_message=message,
                context=context,
            )
            self._route_history.append(result)
            if len(self._route_history) > self._max_history:
                self._route_history.pop(0)
            return result

        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            logger.warning("Failed to parse routing response: %s. Raw: %s", exc, raw[:500])
            # Fallback: 路由到通用助手
            assistant = self.registry.find_by_name("General Assistant")
            agent_id = assistant.id if assistant else "agent-assistant"
            return RouteResult(
                decision=RoutingDecision.DIRECT,
                target_agent_ids=[agent_id],
                user_message=message,
                reasoning=f"Failed to parse LLM routing response: {exc}",
                confidence=0.3,
                context=context,
            )

    # ------------------------------------------------------------------
    # 协作编排
    # ------------------------------------------------------------------

    def create_collaboration_plan(
        self,
        description: str,
        steps: List[Dict[str, Any]],
    ) -> str:
        """创建多 Agent 协作计划。

        step format: {
            "agent_id": str,
            "task": str,
            "depends_on": List[str],  # 依赖的 step index
            "output_key": str,        # 输出存入 context 的 key
        }
        """
        plan_id = f"plan-{uuid.uuid4().hex[:8]}"
        plan = CollaborationPlan(
            plan_id=plan_id,
            description=description,
            steps=steps,
        )
        self._collaboration_plans[plan_id] = plan
        logger.info("Created collaboration plan: %s with %d steps", plan_id, len(steps))
        return plan_id

    def execute_collaboration_plan(
        self,
        plan_id: str,
        initial_context: Optional[Dict[str, Any]] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """执行协作计划，产出流式进度更新。

        Yields: {
            "step_index": int,
            "agent_id": str,
            "status": "started" | "completed" | "failed",
            "output": Any,
            "error": Optional[str],
        }
        """
        plan = self._collaboration_plans.get(plan_id)
        if not plan:
            yield {"error": f"Plan {plan_id} not found"}
            return

        plan.status = "running"
        shared_context = initial_context or {}
        completed_steps: set = set()

        for i, step in enumerate(plan.steps):
            agent_id = step["agent_id"]
            task = step["task"]
            depends_on = step.get("depends_on", [])
            output_key = step.get("output_key", f"step_{i}_output")

            # 检查依赖
            if not all(d in completed_steps for d in depends_on):
                yield {
                    "step_index": i,
                    "agent_id": agent_id,
                    "status": "waiting",
                    "message": f"Waiting for dependencies: {depends_on}",
                }
                continue

            # 标记 Agent 为 busy
            self.registry.update_state(agent_id, status=AgentStatus.BUSY, current_task=task)

            yield {
                "step_index": i,
                "agent_id": agent_id,
                "status": "started",
                "task": task,
            }

            try:
                # 构建任务 prompt（注入共享上下文）
                task_with_context = self._inject_context(task, shared_context, depends_on)

                # 这里实际执行由 AgentSession 处理，Router 只负责编排
                # 返回待执行的任务描述
                yield {
                    "step_index": i,
                    "agent_id": agent_id,
                    "status": "ready",
                    "task": task_with_context,
                    "output_key": output_key,
                }

                # 标记完成（实际执行由调用方通过 AgentSession 完成后更新）
                completed_steps.add(i)
                self.registry.update_state(agent_id, status=AgentStatus.IDLE, current_task=None)

            except Exception as exc:
                self.registry.update_state(agent_id, status=AgentStatus.ERROR, error_message=str(exc))
                yield {
                    "step_index": i,
                    "agent_id": agent_id,
                    "status": "failed",
                    "error": str(exc),
                }

        plan.status = "completed" if len(completed_steps) == len(plan.steps) else "partial"

    def _inject_context(self, task: str, context: Dict[str, Any], depends_on: List[int]) -> str:
        """将依赖步骤的输出注入到当前任务中。"""
        if not depends_on:
            return task

        context_parts = ["## Context from previous steps", ""]
        for dep_idx in depends_on:
            key = f"step_{dep_idx}_output"
            if key in context:
                context_parts.append(f"### Step {dep_idx} output:")
                context_parts.append(str(context[key]))
                context_parts.append("")

        return task + "\n\n" + "\n".join(context_parts)

    def auto_collaborate(self, message: str, context: Optional[Dict[str, Any]] = None) -> Tuple[str, List[Dict[str, Any]]]:
        """自动分析需求并生成协作计划。

        使用 LLM 分析任务复杂度，决定是否需要多 Agent 协作。
        返回 (plan_id, steps)。
        """
        # 简单任务直接返回空 plan
        if len(message) < 50 and not any(kw in message.lower() for kw in ["and", "然后", "再", "同时", "协作", "合作"]):
            return "", []

        # 使用 LLM 生成协作计划
        prompt = f"""Analyze this task and break it down into sub-tasks if it requires multiple specialists.

Task: "{message}"

Available agent roles: writer, analyst, researcher, publisher, assistant

If the task is simple and can be handled by one agent, respond with: {{"simple": true, "agent": "role-name"}}

If the task requires multiple steps, respond with a JSON plan:
{{
  "simple": false,
  "steps": [
    {{"agent_role": "writer", "task": "description", "depends_on": []}},
    {{"agent_role": "publisher", "task": "description", "depends_on": [0]}}
  ]
}}

Respond with JSON only."""

        try:
            raw = self.ai_engine.generate_structured(prompt, system="You are a task planner.") if self.ai_engine else {"simple": True, "agent": "assistant"}
            if raw.get("simple", True):
                return "", []

            steps = []
            for i, step in enumerate(raw.get("steps", [])):
                role = step.get("agent_role", "assistant")
                # 查找对应角色的 Agent
                agents = self.registry.list_agents(role=AgentRole(role))
                agent_id = agents[0].id if agents else "agent-assistant"
                steps.append({
                    "agent_id": agent_id,
                    "task": step["task"],
                    "depends_on": step.get("depends_on", []),
                    "output_key": f"step_{i}_output",
                })

            plan_id = self.create_collaboration_plan(
                description=f"Auto-generated plan for: {message[:100]}",
                steps=steps,
            )
            return plan_id, steps

        except Exception as exc:
            logger.error("Auto-collaboration planning failed: %s", exc)
            return "", []

    # ------------------------------------------------------------------
    # 流式路由
    # ------------------------------------------------------------------

    def route_stream(
        self,
        user_message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """流式路由 — 产出路由决策过程。

        Yields: {"type": "thinking" | "decision" | "plan", "data": Any}
        """
        yield {"type": "thinking", "data": "Analyzing user intent..."}

        # 快速匹配
        quick = self._quick_match(user_message)
        if quick:
            yield {"type": "thinking", "data": f"Quick match: {quick.skill_name or quick.target_agent_ids[0]}"}
            yield {"type": "decision", "data": quick.to_dict()}
            return

        yield {"type": "thinking", "data": "Consulting orchestrator for complex routing..."}

        result = self._llm_route(user_message, context or {})
        yield {"type": "decision", "data": result.to_dict()}

        if result.decision == RoutingDecision.COLLABORATE:
            yield {"type": "thinking", "data": "Generating collaboration plan..."}
            plan_id, steps = self.auto_collaborate(user_message, context)
            if plan_id:
                yield {"type": "plan", "data": {"plan_id": plan_id, "steps": steps}}

    # ------------------------------------------------------------------
    # 工具与辅助
    # ------------------------------------------------------------------

    def get_route_history(self, n: int = 10) -> List[RouteResult]:
        """获取最近的路由历史。"""
        return self._route_history[-n:]

    def get_plan(self, plan_id: str) -> Optional[CollaborationPlan]:
        """获取协作计划。"""
        return self._collaboration_plans.get(plan_id)

    def cancel_plan(self, plan_id: str) -> bool:
        """取消协作计划。"""
        plan = self._collaboration_plans.get(plan_id)
        if not plan or plan.status == "completed":
            return False
        plan.status = "cancelled"
        # 释放所有 involved Agent
        for step in plan.steps:
            self.registry.update_state(step["agent_id"], status=AgentStatus.IDLE, current_task=None)
        return True

    def suggest_agents(self, message: str, top_k: int = 3) -> List[Tuple[AgentDefinition, float]]:
        """为消息推荐最匹配的 Agent（含相似度分数）。"""
        # 简单基于关键词重叠的相似度
        message_words = set(message.lower().split())
        scored = []
        for agent in self.registry.list_agents():
            agent_text = f"{agent.name} {agent.description} {' '.join(agent.skills)}".lower()
            agent_words = set(agent_text.split())
            overlap = len(message_words & agent_words)
            score = overlap / max(len(message_words), 1)
            scored.append((agent, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]
