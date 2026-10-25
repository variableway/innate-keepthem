"""Process handler — 处理来自 Go CLI 的 AI 处理请求"""

import json
import logging
from typing import Any, Dict

from contentforge.models import ContentUnit
from contentforge.processing.ai_engine import AIEngine
from contentforge.processing.summarizer import Summarizer
from contentforge.processing.analyzer import Analyzer
from contentforge.processing.translator import Translator
from contentforge.processing.xiaohongshu_converter import XiaohongshuConverter

logger = logging.getLogger(__name__)


def handle_process(payload: Dict[str, Any]) -> Dict[str, Any]:
    """处理 process 请求"""
    action = payload.get("action", "summarize")
    input_data = payload.get("input_data", "")
    lang = payload.get("lang", "zh")
    style = payload.get("style", "professional")
    max_words = payload.get("max_words", 300)
    num_topics = payload.get("num_topics", 5)
    num_keywords = payload.get("num_keywords", 10)

    try:
        # Parse input as ContentUnit
        unit = _parse_input(input_data)
        engine = AIEngine()

        if action == "summarize":
            summarizer = Summarizer(engine)
            summarizer.summarize(unit, max_words=max_words, language=lang)
        elif action == "rewrite":
            rewritten = engine.rewrite(unit.extracted_text, style=style, language=lang)
            unit.rewritten_text = rewritten
        elif action == "analyze":
            analyzer = Analyzer(engine)
            analyzer.analyze(unit, extract_topics=num_topics, extract_keywords=num_keywords)
        elif action == "translate":
            translator = Translator(engine)
            translator.translate(unit, target_language=lang)
        elif action == "xiaohongshu":
            converter = XiaohongshuConverter(engine)
            converter.convert(unit, tone=style)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

        return {"success": True, "data": unit.to_dict()}
    except Exception as exc:
        logger.exception("Process error: %s", exc)
        return {"success": False, "error": str(exc)}


def _parse_input(data: Any) -> ContentUnit:
    if isinstance(data, str):
        if data.strip().startswith("{"):
            return ContentUnit.from_dict(json.loads(data))
        # Treat as raw text
        from contentforge.models import SourceInfo, ContentType
        return ContentUnit(
            id="tmp",
            source=SourceInfo(platform="raw", url=""),
            type=ContentType.ARTICLE,
            extracted_text=data,
        )
    if isinstance(data, dict):
        return ContentUnit.from_dict(data)
    raise ValueError(f"Unsupported input type: {type(data)}")
