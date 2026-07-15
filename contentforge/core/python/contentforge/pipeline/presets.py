"""Pipeline Presets — 预设流水线定义

内置常用流水线模板：
- Twitter → 小红书文案
- YouTube → 笔记
- RSS → 摘要
- 通用网页 → 结构化摘要

使用示例：
    preset = get_preset("twitter_to_xiaohongshu")
    pipeline = preset.to_pipeline()
"""
import logging
import uuid
from typing import Dict, List, Optional

from contentforge.models import Pipeline, PipelineStep

logger = logging.getLogger(__name__)


class PipelinePreset:
    """预设流水线模板。

    提供预配置的步骤序列，可基于模板创建 Pipeline 实例。
    """

    def __init__(
        self,
        name: str,
        description: str,
        steps: List[Dict],
        input_config: Optional[Dict] = None,
        output_config: Optional[Dict] = None,
    ):
        self.name = name
        self.description = description
        self.steps = steps
        self.input_config = input_config or {}
        self.output_config = output_config or {}

    def to_pipeline(self, pipeline_id: Optional[str] = None) -> Pipeline:
        """将预设转换为可执行的 Pipeline 实例。"""
        pipeline_steps = []
        for i, step_def in enumerate(self.steps):
            step = PipelineStep(
                id=step_def.get("id", f"step_{i+1}"),
                type=step_def["type"],
                config=step_def.get("config", {}),
                input_mapping=step_def.get("input_mapping", {}),
                output_mapping=step_def.get("output_mapping", {}),
                max_retries=step_def.get("max_retries", 3),
                backoff=step_def.get("backoff", "exponential"),
                delay_ms=step_def.get("delay_ms", 1000),
                condition=step_def.get("condition"),
                timeout_ms=step_def.get("timeout_ms", 30000),
            )
            pipeline_steps.append(step)
        
        return Pipeline(
            id=pipeline_id or str(uuid.uuid4()),
            name=self.name,
            description=self.description,
            steps=pipeline_steps,
            input_config=self.input_config,
            output_config=self.output_config,
        )

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "description": self.description,
            "steps": self.steps,
            "input_config": self.input_config,
            "output_config": self.output_config,
        }


# ─────────────────────────── 预设定义 ───────────────────────────

PRESETS: Dict[str, PipelinePreset] = {}


def _register_preset(preset: PipelinePreset) -> None:
    """注册预设。"""
    PRESETS[preset.name] = preset
    logger.info(f"[Presets] Registered preset: {preset.name}")


def get_preset(name: str) -> PipelinePreset:
    """获取指定名称的预设。"""
    if name not in PRESETS:
        raise PresetError(f"Preset '{name}' not found. Available: {list(PRESETS.keys())}")
    return PRESETS[name]


def list_presets() -> List[str]:
    """列出所有可用预设名称。"""
    return list(PRESETS.keys())


# ────────── Preset 1: Twitter → 小红书 ──────────

_register_preset(PipelinePreset(
    name="twitter_to_xiaohongshu",
    description="抓取 Twitter/X 内容，自动翻译并改写为小红书风格文案",
    steps=[
        {
            "id": "ingest",
            "type": "ingest",
            "config": {"platform": "twitter"},
            "timeout_ms": 60000,
        },
        {
            "id": "translate",
            "type": "translate",
            "config": {"target_language": "zh"},
            "condition": "context.get('auto_translate', True)",
            "timeout_ms": 120000,
        },
        {
            "id": "summarize",
            "type": "summarize",
            "config": {"style": "structured"},
            "timeout_ms": 120000,
        },
        {
            "id": "xiaohongshu",
            "type": "xiaohongshu",
            "config": {"max_length": 800},
            "timeout_ms": 120000,
        },
        {
            "id": "analyze",
            "type": "analyze",
            "config": {"mode": "quick"},
            "timeout_ms": 60000,
        },
    ],
    input_config={
        "required_params": ["url"],
        "auto_translate": True,
    },
    output_config={
        "format": "markdown",
        "fields": ["rewritten_text", "summary", "topics", "tags"],
    },
))

# ────────── Preset 2: YouTube → 笔记 ──────────

_register_preset(PipelinePreset(
    name="youtube_to_notes",
    description="下载 YouTube 视频字幕，提取关键信息生成结构化笔记",
    steps=[
        {
            "id": "ingest",
            "type": "ingest",
            "config": {"platform": "youtube", "extract_subtitles": True},
            "timeout_ms": 180000,
        },
        {
            "id": "translate",
            "type": "translate",
            "config": {"target_language": "zh"},
            "condition": "context.get('auto_translate', False)",
            "timeout_ms": 120000,
        },
        {
            "id": "summarize",
            "type": "summarize",
            "config": {"style": "structured"},
            "timeout_ms": 120000,
        },
        {
            "id": "analyze",
            "type": "analyze",
            "config": {"mode": "ai"},
            "timeout_ms": 60000,
        },
        {
            "id": "rewrite",
            "type": "rewrite",
            "config": {"tone": "educational", "length": "same", "style": "structured"},
            "timeout_ms": 120000,
        },
    ],
    input_config={
        "required_params": ["url"],
        "auto_translate": False,
    },
    output_config={
        "format": "markdown",
        "fields": ["summary", "key_points", "topics", "rewritten_text"],
    },
))

# ────────── Preset 3: RSS → 摘要 ──────────

_register_preset(PipelinePreset(
    name="rss_to_digest",
    description="抓取 RSS 订阅源，批量生成摘要和结构化报告",
    steps=[
        {
            "id": "ingest",
            "type": "ingest",
            "config": {"platform": "rss", "limit": 10},
            "timeout_ms": 60000,
        },
        {
            "id": "filter",
            "type": "filter",
            "config": {"min_length": 100, "exclude_sentiment": ["negative"]},
            "timeout_ms": 10000,
        },
        {
            "id": "summarize",
            "type": "summarize",
            "config": {"style": "concise"},
            "timeout_ms": 120000,
        },
        {
            "id": "analyze",
            "type": "analyze",
            "config": {"mode": "quick"},
            "timeout_ms": 30000,
        },
    ],
    input_config={
        "required_params": ["url"],
        "batch_mode": True,
    },
    output_config={
        "format": "json",
        "fields": ["summary", "topics", "sentiment", "source"],
        "aggregate": True,
    },
))

# ────────── Preset 4: 网页 → 结构化摘要 ──────────

_register_preset(PipelinePreset(
    name="web_to_summary",
    description="抓取任意网页，提取内容并生成结构化摘要",
    steps=[
        {
            "id": "ingest",
            "type": "ingest",
            "config": {"platform": "web"},
            "timeout_ms": 60000,
        },
        {
            "id": "summarize",
            "type": "summarize",
            "config": {"style": "structured"},
            "timeout_ms": 120000,
        },
        {
            "id": "analyze",
            "type": "analyze",
            "config": {"mode": "quick"},
            "timeout_ms": 30000,
        },
        {
            "id": "translate",
            "type": "translate",
            "config": {"target_language": "zh"},
            "condition": "context.get('auto_translate', False)",
            "timeout_ms": 120000,
        },
    ],
    input_config={
        "required_params": ["url"],
    },
    output_config={
        "format": "markdown",
        "fields": ["summary", "topics", "key_points", "sentiment"],
    },
))

# ────────── Preset 5: 通用 AI 处理 ──────────

_register_preset(PipelinePreset(
    name="ai_processing",
    description="对已有内容执行完整的 AI 处理流程：分析→摘要→改写→小红书",
    steps=[
        {
            "id": "analyze",
            "type": "analyze",
            "config": {"mode": "ai"},
            "timeout_ms": 60000,
        },
        {
            "id": "summarize",
            "type": "summarize",
            "config": {"style": "structured"},
            "timeout_ms": 120000,
        },
        {
            "id": "rewrite",
            "type": "rewrite",
            "config": {"tone": "engaging", "length": "same", "style": "natural"},
            "timeout_ms": 120000,
        },
        {
            "id": "xiaohongshu",
            "type": "xiaohongshu",
            "config": {"max_length": 800},
            "condition": "context.get('generate_xiaohongshu', False)",
            "timeout_ms": 120000,
        },
        {
            "id": "translate",
            "type": "translate",
            "config": {"target_language": "zh"},
            "condition": "context.get('auto_translate', False)",
            "timeout_ms": 120000,
        },
    ],
    input_config={
        "required_params": [],
        "accepts_existing_content": True,
    },
    output_config={
        "format": "markdown",
        "fields": ["summary", "rewritten_text", "topics", "sentiment", "tags"],
    },
))


class PresetError(Exception):
    """预设错误。"""
    pass


class PresetRegistry:
    """预设注册表（Go CLI 兼容）。"""

    def list_all(self) -> List[Dict]:
        """返回所有预设列表。"""
        return list_presets()

    def register(self, pipeline: Dict) -> Dict:
        """注册新预设（简化实现）。"""
        return {"status": "ok", "id": pipeline.get("id", "")}

