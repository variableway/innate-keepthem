"""
ContentForge Agent 系统 — Agent 定义、注册、路由

职责：
- Agent 角色定义与注册
- 基于意图的自动路由
- Agent 生命周期管理

设计原则：
- 自研轻量框架，不复用 LangChain
- 基于 ReAct 模式
- 与现有 AIEngine 复用
"""

import json
import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Callable

logger = logging.getLogger(__name__)


# ─────────────────────────── 枚举定义 ───────────────────────────

class AgentCapability(str, Enum):
    """Agent 能力枚举"""
    ANALYZE = "analyze"
    SUMMARIZE = "summarize"
    REWRITE = "rewrite"
    TRANSLATE = "translate"
    PUBLISH = "publish"
    PIPELINE = "pipeline"
    SEARCH = "search"
    GENERAL = "general"


# ─────────────────────────── Agent 角色定义 ───────────────────────────

@dataclass
class AgentRole:
    """Agent 角色定义"""
    id: str
    name: str
    description: str
    system_prompt: str
    capabilities: List[AgentCapability]
    tools: List[str]
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 4000
    context_window: int = 128000
    icon: str = "bot"
    color: str = "#6366f1"
    auto_switch: bool = False
    streaming: bool = True
    requires_context: bool = True
    order: int = 0

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "system_prompt": self.system_prompt,
            "capabilities": [c.value for c in self.capabilities],
            "tools": self.tools,
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "context_window": self.context_window,
            "icon": self.icon,
            "color": self.color,
            "auto_switch": self.auto_switch,
            "streaming": self.streaming,
            "requires_context": self.requires_context,
            "order": self.order,
        }


# ─────────────────────────── 内置 Agent 定义 ───────────────────────────

BUILTIN_AGENTS: List[AgentRole] = [
    AgentRole(
        id="general",
        name="通用助手",
        description="ContentForge 通用助手，帮助用户管理和处理内容",
        system_prompt="""你是 ContentForge 的通用助手。你帮助用户管理内容资产、执行内容处理任务、导航应用功能。

当用户请求需要专业分析时，你会建议切换到对应的专家 Agent。

可用工具：
- search_assets: 搜索内容资产库
- get_asset_detail: 获取内容资产详情
- list_sessions: 列出会话列表

工作原则：
1. 友好、简洁地回答用户问题
2. 主动推荐相关功能
3. 识别用户意图并建议合适的专家 Agent""",
        capabilities=[AgentCapability.GENERAL, AgentCapability.SEARCH],
        tools=["search_assets", "get_asset_detail", "list_sessions"],
        model="gpt-4o-mini",
        temperature=0.7,
        icon="bot",
        color="#6366f1",
        auto_switch=False,
        requires_context=False,
        order=0,
    ),
    AgentRole(
        id="content_analyst",
        name="内容分析师",
        description="分析内容结构、提取要点、情感分析",
        system_prompt="""你是内容分析专家，擅长从文本/视频中提取结构化洞察。

你能分析：
- 主题与话题
- 关键词与实体
- 情感倾向（正面/负面/中性）
- 内容质量评分
- 语言检测

可用工具：
- analyze: 分析内容并提取主题、关键词、情感
- extract_keywords: 提取关键词
- detect_language: 检测语言
- search_assets: 搜索内容资产
- get_asset_detail: 获取资产详情

输出格式：
请使用结构化格式输出分析结果，包含：
1. 核心主题
2. 关键要点
3. 情感分析
4. 关键词列表
5. 改进建议（如有）""",
        capabilities=[AgentCapability.ANALYZE, AgentCapability.SEARCH],
        tools=["analyze", "extract_keywords", "detect_language", "search_assets", "get_asset_detail"],
        model="gpt-4o",
        temperature=0.3,
        icon="microscope",
        color="#0ea5e9",
        auto_switch=True,
        requires_context=True,
        order=1,
    ),
    AgentRole(
        id="summarizer",
        name="摘要专家",
        description="生成多风格摘要",
        system_prompt="""你是摘要专家，擅长将长内容转化为精炼的要点。

支持风格：
- structured: 结构化摘要（分点列出）
- concise: 简洁摘要（一句话概括）
- detailed: 详细摘要（保留关键细节）
- bullets: 要点列表
- executive: 执行摘要（面向决策者）

可用工具：
- summarize: 生成内容摘要
- chunk_text: 长文本分块
- search_assets: 搜索内容资产
- get_asset_detail: 获取资产详情

工作原则：
1. 保持原意不变
2. 去除冗余信息
3. 保留关键数据和观点
4. 根据用户要求调整长度""",
        capabilities=[AgentCapability.SUMMARIZE, AgentCapability.SEARCH],
        tools=["summarize", "chunk_text", "search_assets", "get_asset_detail"],
        model="gpt-4o-mini",
        temperature=0.5,
        icon="scroll-text",
        color="#8b5cf6",
        auto_switch=True,
        requires_context=True,
        order=2,
    ),
    AgentRole(
        id="rewriter",
        name="改写专家",
        description="改写风格、翻译、润色",
        system_prompt="""你是文案改写专家，能根据不同平台调性调整内容。

支持风格：
- professional: 专业正式
- casual: 轻松随意
- humorous: 幽默风趣
- academic: 学术严谨
- marketing: 营销文案
- xiaohongshu: 小红书风格

支持翻译：
- 中文 ↔ 英文
- 中文 ↔ 日文
- 中文 ↔ 韩文

可用工具：
- rewrite: 改写内容风格
- translate: 翻译内容
- xiaohongshu_convert: 转换为小红书文案
- search_assets: 搜索内容资产
- get_asset_detail: 获取资产详情

工作原则：
1. 保持原意不变
2. 适配目标平台调性
3. 注意语言地道性
4. 保留关键信息""",
        capabilities=[AgentCapability.REWRITE, AgentCapability.TRANSLATE, AgentCapability.SEARCH],
        tools=["rewrite", "translate", "xiaohongshu_convert", "search_assets", "get_asset_detail"],
        model="gpt-4o",
        temperature=0.8,
        icon="pen-tool",
        color="#ec4899",
        auto_switch=True,
        requires_context=True,
        order=3,
    ),
    AgentRole(
        id="publisher",
        name="发布助手",
        description="格式转换、发布准备",
        system_prompt="""你是发布专家，负责将内容转化为各平台可用格式。

支持格式：
- markdown: Markdown 文档
- xiaohongshu: 小红书文案（含表情、标签）
- json: JSON 结构化数据
- plain: 纯文本

可用工具：
- publish: 导出内容到指定格式
- generate_markdown: 生成 Markdown
- generate_xhs: 生成小红书文案
- search_assets: 搜索内容资产
- get_asset_detail: 获取资产详情

工作原则：
1. 确保格式符合平台规范
2. 优化标题和标签
3. 检查内容长度限制
4. 提供发布建议""",
        capabilities=[AgentCapability.PUBLISH, AgentCapability.SEARCH],
        tools=["publish", "generate_markdown", "generate_xhs", "search_assets", "get_asset_detail"],
        model="gpt-4o-mini",
        temperature=0.6,
        icon="send",
        color="#10b981",
        auto_switch=True,
        requires_context=True,
        order=4,
    ),
    AgentRole(
        id="pipeline_runner",
        name="流水线执行器",
        description="执行预设 Pipeline",
        system_prompt="""你是流水线调度员，负责执行和管理内容处理 Pipeline。

可用预设：
- twitter_to_xiaohongshu: Twitter 内容转小红书
- youtube_to_notes: YouTube 视频转笔记
- rss_to_digest: RSS 聚合转摘要
- web_to_summary: 网页内容转摘要

可用工具：
- run_pipeline: 执行预设流水线
- list_presets: 列出所有预设
- search_assets: 搜索内容资产
- get_asset_detail: 获取资产详情

工作原则：
1. 根据用户需求选择最佳流程
2. 解释 Pipeline 执行步骤
3. 报告执行结果和错误
4. 建议优化方案""",
        capabilities=[AgentCapability.PIPELINE, AgentCapability.SEARCH],
        tools=["run_pipeline", "list_presets", "search_assets", "get_asset_detail"],
        model="gpt-4o-mini",
        temperature=0.3,
        icon="workflow",
        color="#f59e0b",
        auto_switch=True,
        requires_context=True,
        order=5,
    ),
]


# ─────────────────────────── Agent 注册表 ───────────────────────────

class AgentRegistry:
    """Agent 注册表 — 管理 Agent 注册、发现、路由"""

    def __init__(self):
        self.agents: Dict[str, AgentRole] = {}
        self._register_builtin_agents()

    def _register_builtin_agents(self) -> None:
        """注册内置 Agent"""
        for agent in BUILTIN_AGENTS:
            self.register(agent)
        logger.info("[AgentRegistry] Registered %d built-in agents", len(BUILTIN_AGENTS))

    def register(self, agent: AgentRole) -> None:
        """注册 Agent"""
        self.agents[agent.id] = agent
        logger.info("[AgentRegistry] Registered agent: %s", agent.id)

    def unregister(self, agent_id: str) -> None:
        """注销 Agent"""
        if agent_id in self.agents:
            del self.agents[agent_id]
            logger.info("[AgentRegistry] Unregistered agent: %s", agent_id)

    def get_agent(self, agent_id: str) -> Optional[AgentRole]:
        """获取 Agent"""
        return self.agents.get(agent_id)

    def list_agents(self) -> List[AgentRole]:
        """列出所有 Agent"""
        return sorted(self.agents.values(), key=lambda a: a.order)

    def get_by_capability(self, capability: AgentCapability) -> Optional[AgentRole]:
        """按能力查找 Agent"""
        for agent in self.agents.values():
            if capability in agent.capabilities:
                return agent
        return None

    # ─────────────────── 意图路由 ───────────────────

    # 意图匹配模式
    INTENT_PATTERNS: Dict[AgentCapability, List[str]] = {
        AgentCapability.ANALYZE: [
            r"分析.*内容",
            r"提取.*要点",
            r"主题.*是什么",
            r"情感.*如何",
            r"关键词",
            r"核心.*观点",
            r"analyze",
            r"extract.*key",
            r"sentiment",
            r"topics",
            r"质量.*如何",
            r"评价.*内容",
        ],
        AgentCapability.SUMMARIZE: [
            r"总结",
            r"摘要",
            r"概括",
            r"提炼",
            r"summarize",
            r"summary",
            r"tl;dr",
            r"太长.*不看",
        ],
        AgentCapability.REWRITE: [
            r"改写",
            r"重写",
            r"润色",
            r"调整.*风格",
            r"rewrite",
            r"rephrase",
            r"polish",
            r"change.*tone",
            r"小红书",
            r"xhs",
        ],
        AgentCapability.TRANSLATE: [
            r"翻译",
            r"translate",
            r"转成.*文",
            r"英文",
            r"中文",
            r"日文",
            r"韩文",
        ],
        AgentCapability.PUBLISH: [
            r"发布",
            r"导出",
            r"生成.*格式",
            r"publish",
            r"export",
            r"generate.*format",
            r"markdown",
            r"json",
        ],
        AgentCapability.PIPELINE: [
            r"运行.*流水线",
            r"执行.*预设",
            r"pipeline",
            r"run.*preset",
            r"batch.*process",
            r"批量.*处理",
            r"自动化",
        ],
    }

    # Agent 显式提及模式
    AGENT_MENTIONS: Dict[str, List[str]] = {
        "content_analyst": [r"分析师", r"analyst", r"分析.*专家"],
        "summarizer": [r"摘要", r"summarizer", r"总结.*专家"],
        "rewriter": [r"改写", r"rewriter", r"改写.*专家", r"文案"],
        "publisher": [r"发布", r"publisher", r"发布.*专家"],
        "pipeline_runner": [r"流水线", r"pipeline", r"调度"],
    }

    def route_by_intent(
        self,
        message: str,
        selected_asset_ids: Optional[List[str]] = None,
        current_agent_id: str = "general",
    ) -> str:
        """
        基于意图路由到合适的 Agent

        Args:
            message: 用户消息
            selected_asset_ids: 选中的资产ID
            current_agent_id: 当前 Agent ID

        Returns:
            目标 Agent ID
        """
        # 1. 检查是否显式提及 Agent
        for agent_id, patterns in self.AGENT_MENTIONS.items():
            if any(re.search(p, message, re.IGNORECASE) for p in patterns):
                logger.info("[AgentRouter] Explicit mention: %s -> %s", message[:50], agent_id)
                return agent_id

        # 2. 基于意图模式匹配
        capability_scores: Dict[AgentCapability, int] = {
            cap: 0 for cap in AgentCapability
        }

        for capability, patterns in self.INTENT_PATTERNS.items():
            score = sum(
                1 for p in patterns
                if re.search(p, message, re.IGNORECASE)
            )
            capability_scores[capability] = score

        # 3. 选择最高分的 capability
        sorted_caps = sorted(
            capability_scores.items(),
            key=lambda x: x[1],
            reverse=True,
        )

        top_capability, top_score = sorted_caps[0]
        if top_score > 0:
            agent = self.get_by_capability(top_capability)
            if agent:
                logger.info(
                    "[AgentRouter] Intent match: %s -> %s (capability=%s, score=%d)",
                    message[:50], agent.id, top_capability.value, top_score
                )
                return agent.id

        # 4. 无明确意图，保持当前 Agent
        logger.info("[AgentRouter] No clear intent, keeping: %s", current_agent_id)
        return current_agent_id


# ─────────────────────────── 使用示例 ───────────────────────────

if __name__ == "__main__":
    registry = AgentRegistry()

    # 测试路由
    test_messages = [
        "分析这个视频的核心观点",
        "总结这篇文章",
        "改写成小红书风格",
        "翻译成英文",
        "发布到小红书",
        "运行 twitter_to_xiaohongshu 预设",
        "你好",
    ]

    for msg in test_messages:
        agent_id = registry.route_by_intent(msg)
        agent = registry.get_agent(agent_id)
        print(f"'{msg[:30]}...' -> {agent.name} ({agent_id})")
