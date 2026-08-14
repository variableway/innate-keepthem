"""Pipeline handler — 处理来自 Go CLI 的流水线请求"""

import json
import logging
from pathlib import Path
from typing import Any, Dict

from contentforge.models import ContentUnit, PipelineStatus
from contentforge.pipeline.engine import PipelineEngine, register_step
from contentforge.pipeline.presets import PipelinePresets
from contentforge.pipeline.runner import PipelineRunner
from contentforge.processing.ai_engine import AIEngine
from contentforge.processing.summarizer import Summarizer
from contentforge.processing.analyzer import Analyzer
from contentforge.processing.translator import Translator
from contentforge.processing.xiaohongshu_converter import XiaohongshuConverter
from contentforge.ingestion.transcriber import Transcriber

logger = logging.getLogger(__name__)


# 注册步骤处理器
def _register_all_handlers() -> None:
    engine = AIEngine()

    def _summarize(unit: ContentUnit, config: Dict) -> ContentUnit:
        s = Summarizer(engine)
        return s.summarize(unit, **{k: v for k, v in config.items() if k in ("max_words", "language")})

    def _analyze(unit: ContentUnit, config: Dict) -> ContentUnit:
        a = Analyzer(engine)
        return a.analyze(unit, **{k: v for k, v in config.items() if k in ("num_topics", "num_keywords")})

    def _translate(unit: ContentUnit, config: Dict) -> ContentUnit:
        t = Translator(engine)
        return t.translate(unit, target_language=config.get("target_language", "zh"))

    def _xiaohongshu(unit: ContentUnit, config: Dict) -> ContentUnit:
        c = XiaohongshuConverter(engine)
        return c.convert(unit, tone=config.get("tone", "friendly"))

    def _transcribe(unit: ContentUnit, config: Dict) -> ContentUnit:
        t = Transcriber()
        return t.transcribe(unit.source.url, language=config.get("language"))

    register_step("summarize", _summarize)
    register_step("analyze", _analyze)
    register_step("translate", _translate)
    register_step("xiaohongshu_convert", _xiaohongshu)
    register_step("transcribe", _transcribe)


def handle_pipeline(payload: Dict[str, Any]) -> Dict[str, Any]:
    """处理 pipeline 请求"""
    action = payload.get("action", "list")

    try:
        _register_all_handlers()

        if action == "list":
            presets = PipelinePresets()
            return {"success": True, "data": presets.list_presets()}

        elif action == "run":
            preset_name = payload.get("preset", "")
            input_data = payload.get("input_data", "")

            if not preset_name:
                return {"success": False, "error": "Missing 'preset' in payload"}

            presets = PipelinePresets()
            pipeline = presets.get(preset_name)

            # Parse input units
            if isinstance(input_data, str):
                input_data = json.loads(input_data)
            if isinstance(input_data, dict):
                units = [ContentUnit.from_dict(input_data)]
            elif isinstance(input_data, list):
                units = [ContentUnit.from_dict(u) for u in input_data]
            else:
                return {"success": False, "error": f"Invalid input_data type: {type(input_data)}"}

            runner = PipelineRunner()
            import asyncio
            run = asyncio.run(runner.run_preset(preset_name, units))
            return {"success": True, "data": run.to_dict()}

        elif action == "create":
            pipeline_json = payload.get("pipeline", "")
            if isinstance(pipeline_json, str):
                pipeline_def = json.loads(pipeline_json)
            else:
                pipeline_def = pipeline_json
            # Save to presets dir
            # repo layout: <root>/packages/contentforge-core/{python,scripts}
            presets_dir = str(Path(__file__).resolve().parents[3] / "scripts" / "presets")
            presets = PipelinePresets(presets_dir)
            # Re-save to persist
            name = pipeline_def.get("id", "custom")
            presets.save(name, f"{presets_dir}/{name}.json")
            return {"success": True, "data": {"created": name}}

        else:
            return {"success": False, "error": f"Unknown pipeline action: {action}"}

    except Exception as exc:
        logger.exception("Pipeline error: %s", exc)
        return {"success": False, "error": str(exc)}
