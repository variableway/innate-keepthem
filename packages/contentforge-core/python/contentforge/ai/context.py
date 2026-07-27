"""
ContentForge Context 管理 — 上下文构建、Token 预算、资产注入

职责：
- 构建 LLM 上下文消息列表
- Token 预算管理
- 资产内容注入与截断
- 历史消息管理

设计原则：
- 与现有 Asset Store 复用
- 智能截断，优先保留关键信息
- 支持多级上下文（System / Session / Asset / Tool）
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from contentforge.models import ContentUnit
from contentforge.ai.agent import AgentRole

logger = logging.getLogger(__name__)


# ─────────────────────────── Token 预算 ───────────────────────────

@dataclass
class TokenBudget:
    """Token 预算管理"""
    max_tokens: int = 128000
    reserved: Dict[str, int] = field(default_factory=lambda: {
        "system": 2000,
        "tools": 3000,
        "response": 4000,
        "buffer": 2000,
    })

    @property
    def available(self) -> int:
        return self.max_tokens - sum(self.reserved.values())

    def estimate_tokens(self, text: str) -> int:
        """估算文本 Token 数（简化：每 3 字符约 1 token）"""
        return len(text) // 3

    def allocate_for_assets(self, assets: List[ContentUnit]) -> List[ContentUnit]:
        """
        为资产分配 Token 预算

        策略：
        1. 优先使用摘要（如果有）
        2. 超长内容截断
        3. 保留尽可能多的资产
        """
        selected = []
        used_tokens = 0

        for asset in assets:
            # 优先使用摘要
            text = asset.summary or asset.extracted_text or ""
            if not text:
                continue

            estimated = self.estimate_tokens(text)

            if used_tokens + estimated > self.available:
                # 尝试使用摘要替代
                if asset.summary and text != asset.summary:
                    summary_tokens = self.estimate_tokens(asset.summary)
                    if used_tokens + summary_tokens <= self.available:
                        selected.append(asset)
                        used_tokens += summary_tokens
                break

            selected.append(asset)
            used_tokens += estimated

        logger.info(
            "[TokenBudget] Selected %d/%d assets, used %d/%d tokens",
            len(selected), len(assets), used_tokens, self.available
        )
        return selected

    def truncate_history(self, messages: List[Dict[str, str]], max_tokens: int) -> List[Dict[str, str]]:
        """截断历史消息以适应 Token 预算"""
        total = 0
        truncated = []

        # 从后往前遍历，保留最近的消息
        for msg in reversed(messages):
            tokens = self.estimate_tokens(msg.get("content", ""))
            if total + tokens > max_tokens:
                break
            total += tokens
            truncated.insert(0, msg)

        return truncated


# ─────────────────────────── 上下文管理器 ───────────────────────────

class ContextManager:
    """
    上下文管理器

    构建 LLM 上下文消息列表，管理 Token 预算。
    """

    def __init__(self, token_budget: Optional[TokenBudget] = None):
        self.token_budget = token_budget or TokenBudget()

    def build_context(
        self,
        agent: Optional[AgentRole],
        user_message: str,
        selected_assets: Optional[List[ContentUnit]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        tool_results: Optional[List[Dict]] = None,
    ) -> List[Dict[str, str]]:
        """
        构建完整的 LLM 上下文

        上下文层级：
        L1: System Context (Agent 角色定义 + 工具列表)
        L2: Session Context (历史消息)
        L3: Asset Context (选中资产内容)
        L4: Tool Context (工具调用结果)
        """
        messages: List[Dict[str, str]] = []

        # L1: System Context
        system_prompt = self._build_system_prompt(agent)
        messages.append({"role": "system", "content": system_prompt})

        # L3: Asset Context（在系统提示中注入资产信息）
        if selected_assets:
            asset_context = self._build_asset_context(selected_assets)
            if asset_context:
                messages[0]["content"] += f"\n\n{asset_context}"

        # L4: Tool Context（如果有工具结果）
        if tool_results:
            tool_context = self._build_tool_context(tool_results)
            if tool_context:
                messages.append({"role": "system", "content": tool_context})

        # L2: Session Context（历史消息）
        if chat_history:
            # 计算剩余 Token 预算
            system_tokens = self.token_budget.estimate_tokens(messages[0]["content"])
            remaining = self.token_budget.available - system_tokens
            truncated_history = self.token_budget.truncate_history(chat_history, remaining)
            messages.extend(truncated_history)

        # 当前用户消息
        messages.append({"role": "user", "content": user_message})

        return messages

    def _build_system_prompt(self, agent: Optional[AgentRole]) -> str:
        """构建系统提示"""
        if not agent:
            return "你是一个有帮助的 AI 助手。"

        prompt = agent.system_prompt

        # 注入工具列表
        if agent.tools:
            prompt += f"\n\n可用工具列表:\n"
            for tool_name in agent.tools:
                prompt += f"- {tool_name}\n"

        return prompt

    def _build_asset_context(self, assets: List[ContentUnit]) -> str:
        """构建资产上下文描述"""
        if not assets:
            return ""

        # 使用 Token 预算分配
        selected = self.token_budget.allocate_for_assets(assets)

        parts = ["已选中的内容资产:"]
        for i, asset in enumerate(selected, 1):
            text = asset.summary or asset.extracted_text or ""
            # 截断过长内容
            if len(text) > 2000:
                text = text[:2000] + "..."

            parts.append(f"\n[{i}] {asset.title or 'Untitled'}")
            parts.append(f"来源: {asset.source.platform} ({asset.source.url})")
            if asset.type:
                parts.append(f"类型: {asset.type.value}")
            if text:
                parts.append(f"内容:\n{text}")

        return "\n".join(parts)

    def _build_tool_context(self, tool_results: List[Dict]) -> str:
        """构建工具结果上下文"""
        parts = ["最近执行的工具结果:"]
        for result in tool_results:
            parts.append(f"\n工具: {result.get('name', 'unknown')}")
            if result.get('output'):
                output_str = json.dumps(result['output'], ensure_ascii=False)[:500]
                parts.append(f"结果: {output_str}")
            if result.get('error'):
                parts.append(f"错误: {result['error']}")
        return "\n".join(parts)


# ─────────────────────────── 使用示例 ───────────────────────────

if __name__ == "__main__":
    from contentforge.ai.agent import AgentRegistry

    registry = AgentRegistry()
    agent = registry.get_agent("content_analyst")

    manager = ContextManager()

    # 模拟资产
    assets = [
        ContentUnit(
            id="test-1",
            source=__import__("contentforge.models", fromlist=["SourceInfo"]).SourceInfo(platform="youtube", url="https://youtube.com/test"),
            type=__import__("contentforge.models", fromlist=["ContentType"]).ContentType.VIDEO,
            title="AI 发展趋势分析",
            extracted_text="人工智能正在快速发展..." * 100,  # 长文本
            summary="本文分析了 AI 发展的三大趋势...",
        )
    ]

    context = manager.build_context(
        agent=agent,
        user_message="分析这个视频的核心观点",
        selected_assets=assets,
    )

    print("=== 上下文消息 ===")
    for i, msg in enumerate(context):
        print(f"\n[{i}] {msg['role']}:")
        print(msg['content'][:200] + "..." if len(msg['content']) > 200 else msg['content'])

    print(f"\n总消息数: {len(context)}")
    print(f"系统提示 Token 估算: {manager.token_budget.estimate_tokens(context[0]['content'])}")
