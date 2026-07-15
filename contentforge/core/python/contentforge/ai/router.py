"""
ContentForge Agent Router — 意图路由与 Agent 切换

职责：
- 基于用户输入的意图识别
- Agent 自动切换决策
- 上下文保持与切换通知

与 AgentRegistry 的区别：
- AgentRegistry: 静态注册和查询
- AgentRouter: 动态路由决策
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

from contentforge.ai.agent import AgentRegistry, AgentCapability, AgentRole

logger = logging.getLogger(__name__)


class AgentRouter:
    """
    Agent 路由器 — 动态意图路由

    支持策略：
    1. 显式提及: 用户直接提到 Agent 名称
    2. 意图匹配: 基于关键词模式匹配
    3. 上下文推断: 基于选中资产类型推断
    4. 历史关联: 基于对话历史推断
    """

    def __init__(self, registry: AgentRegistry):
        self.registry = registry
        self._route_cache: Dict[str, str] = {}  # message_hash -> agent_id

    def route(
        self,
        message: str,
        current_agent_id: str = "general",
        selected_asset_ids: Optional[List[str]] = None,
        chat_history: Optional[List[Dict]] = None,
    ) -> "RouteResult":
        """
        路由决策

        Returns:
            RouteResult: 包含目标 Agent ID 和切换原因
        """
        # 1. 检查缓存
        cache_key = self._hash_message(message)
        if cache_key in self._route_cache:
            cached_agent = self._route_cache[cache_key]
            if cached_agent != current_agent_id:
                return RouteResult(
                    target_agent_id=cached_agent,
                    should_switch=True,
                    reason="缓存路由结果",
                    confidence=0.8,
                )
            return RouteResult(
                target_agent_id=current_agent_id,
                should_switch=False,
                reason="缓存命中，无需切换",
                confidence=0.8,
            )

        # 2. 显式提及检测
        mention_result = self._detect_explicit_mention(message)
        if mention_result:
            self._route_cache[cache_key] = mention_result.target_agent_id
            return mention_result

        # 3. 意图模式匹配
        intent_result = self._match_intent_patterns(message)
        if intent_result and intent_result.should_switch:
            self._route_cache[cache_key] = intent_result.target_agent_id
            return intent_result

        # 4. 上下文推断（基于选中资产）
        if selected_asset_ids:
            context_result = self._infer_from_context(selected_asset_ids)
            if context_result and context_result.should_switch:
                return context_result

        # 5. 保持当前 Agent
        return RouteResult(
            target_agent_id=current_agent_id,
            should_switch=False,
            reason="无明确意图，保持当前 Agent",
            confidence=0.5,
        )

    def _detect_explicit_mention(self, message: str) -> Optional["RouteResult"]:
        """检测用户是否显式提及某个 Agent"""
        for agent_id, patterns in self.registry.AGENT_MENTIONS.items():
            if any(re.search(p, message, re.IGNORECASE) for p in patterns):
                return RouteResult(
                    target_agent_id=agent_id,
                    should_switch=True,
                    reason=f"用户显式提及 {agent_id}",
                    confidence=0.95,
                )
        return None

    def _match_intent_patterns(self, message: str) -> Optional["RouteResult"]:
        """基于意图模式匹配"""
        capability_scores: Dict[AgentCapability, int] = {}

        for capability, patterns in self.registry.INTENT_PATTERNS.items():
            score = sum(
                1 for p in patterns
                if re.search(p, message, re.IGNORECASE)
            )
            if score > 0:
                capability_scores[capability] = score

        if not capability_scores:
            return None

        # 选择最高分的 capability
        top_capability = max(capability_scores, key=capability_scores.get)
        top_score = capability_scores[top_capability]

        agent = self.registry.get_by_capability(top_capability)
        if not agent:
            return None

        return RouteResult(
            target_agent_id=agent.id,
            should_switch=True,
            reason=f"意图匹配: {top_capability.value} (score={top_score})",
            confidence=min(0.5 + top_score * 0.1, 0.9),
        )

    def _infer_from_context(
        self, selected_asset_ids: List[str]
    ) -> Optional["RouteResult"]:
        """基于选中资产推断最合适的 Agent"""
        # 简化实现：如果有资产被选中，倾向于分析 Agent
        # 实际实现中应根据资产类型和内容推断
        return None

    def _hash_message(self, message: str) -> str:
        """生成消息哈希（用于缓存）"""
        import hashlib
        normalized = re.sub(r"\s+", " ", message.lower().strip())
        return hashlib.md5(normalized.encode()).hexdigest()[:16]


@dataclass
class RouteResult:
    """路由结果"""
    target_agent_id: str
    should_switch: bool
    reason: str
    confidence: float  # 0.0 - 1.0

    def to_dict(self) -> Dict:
        return {
            "target_agent_id": self.target_agent_id,
            "should_switch": self.should_switch,
            "reason": self.reason,
            "confidence": self.confidence,
        }


# 需要导入 dataclass
from dataclasses import dataclass
