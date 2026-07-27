"""Pipeline Engine — 流水线执行引擎

支持 DAG 步骤执行、重试、超时、条件判断。
基于状态机驱动，每个步骤可配置重试策略和超时。

使用示例：
    engine = PipelineEngine()
    result = engine.run(pipeline, inputs=[unit])
    print(result.status)
"""
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional

from contentforge.models import (
    ContentUnit,
    Pipeline,
    PipelineRun,
    PipelineStatus,
    PipelineStep,
)

logger = logging.getLogger(__name__)


# ─────────────────────────── Step Handlers ───────────────────────────

class StepHandler(ABC):
    """流水线步骤处理器抽象基类。"""

    @abstractmethod
    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        """执行步骤，返回输出 ContentUnit 列表。"""
        pass

    @property
    @abstractmethod
    def step_type(self) -> str:
        """返回该处理器支持的步骤类型。"""
        pass


class IngestionHandler(StepHandler):
    """采集步骤处理器。"""

    @property
    def step_type(self) -> str:
        return "ingest"

    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        from contentforge.ingestion.agent_reach import AgentReachCollector
        
        source_url = step.config.get("url", "")
        platform = step.config.get("platform", "auto")
        
        collector = AgentReachCollector(
            proxy=context.get("proxy"),
        )
        
        if platform == "twitter":
            unit = collector.fetch_twitter(source_url)
        elif platform == "youtube":
            unit = collector.fetch_youtube(source_url)
        elif platform == "rss":
            units = collector.fetch_rss(source_url, limit=step.config.get("limit", 5))
            return units
        elif platform == "web":
            unit = collector.fetch_webpage(source_url)
        else:
            unit = collector.fetch_auto(source_url)
        
        return [unit]


class SummarizeHandler(StepHandler):
    """摘要步骤处理器。"""

    @property
    def step_type(self) -> str:
        return "summarize"

    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        from contentforge.processing.summarizer import Summarizer
        from contentforge.processing.ai_engine import AIEngine
        
        style = step.config.get("style", "structured")
        ai_config = context.get("ai_config", {})
        engine = AIEngine.from_config(ai_config) if ai_config else None
        summarizer = Summarizer(engine=engine)
        
        results = []
        for unit in inputs:
            try:
                summarizer.summarize(unit, style=style)
                results.append(unit)
            except Exception as e:
                logger.error(f"[SummarizeHandler] Failed for {unit.id}: {e}")
                unit.error = str(e)
                results.append(unit)
        
        return results


class RewriteHandler(StepHandler):
    """改写步骤处理器。"""

    @property
    def step_type(self) -> str:
        return "rewrite"

    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        from contentforge.processing.ai_engine import AIEngine
        
        tone = step.config.get("tone", "neutral")
        length = step.config.get("length", "same")
        style = step.config.get("style", "natural")
        ai_config = context.get("ai_config", {})
        engine = AIEngine.from_config(ai_config) if ai_config else None
        
        if not engine:
            raise PipelineEngineError("No AI engine for rewrite step")
        
        for unit in inputs:
            text = unit.extracted_text or unit.summary or unit.description
            if text:
                unit.rewritten_text = engine.rewrite(text, tone=tone, length=length, style=style)
        
        return inputs


class XiaohongshuHandler(StepHandler):
    """小红书转换步骤处理器。"""

    @property
    def step_type(self) -> str:
        return "xiaohongshu"

    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        from contentforge.processing.xiaohongshu_converter import XiaohongshuConverter
        from contentforge.processing.ai_engine import AIEngine
        
        max_length = step.config.get("max_length", 800)
        ai_config = context.get("ai_config", {})
        engine = AIEngine.from_config(ai_config) if ai_config else None
        converter = XiaohongshuConverter(engine=engine)
        
        for unit in inputs:
            try:
                converter.convert(unit, max_length=max_length)
            except Exception as e:
                logger.error(f"[XiaohongshuHandler] Failed for {unit.id}: {e}")
                unit.error = str(e)
        
        return inputs


class TranslateHandler(StepHandler):
    """翻译步骤处理器。"""

    @property
    def step_type(self) -> str:
        return "translate"

    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        from contentforge.processing.translator import Translator
        from contentforge.processing.ai_engine import AIEngine
        
        target_language = step.config.get("target_language", "zh")
        ai_config = context.get("ai_config", {})
        engine = AIEngine.from_config(ai_config) if ai_config else None
        translator = Translator(engine=engine)
        
        for unit in inputs:
            try:
                translator.translate(unit, target_language=target_language)
            except Exception as e:
                logger.error(f"[TranslateHandler] Failed for {unit.id}: {e}")
                unit.error = str(e)
        
        return inputs


class AnalyzeHandler(StepHandler):
    """分析步骤处理器。"""

    @property
    def step_type(self) -> str:
        return "analyze"

    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        from contentforge.processing.analyzer import Analyzer
        from contentforge.processing.ai_engine import AIEngine
        
        mode = step.config.get("mode", "quick")
        ai_config = context.get("ai_config", {})
        engine = AIEngine.from_config(ai_config) if ai_config else None
        analyzer = Analyzer(engine=engine)
        
        for unit in inputs:
            try:
                result = analyzer.analyze(unit, mode=mode)
                unit.topics = result.topics
                unit.sentiment = result.sentiment_label
            except Exception as e:
                logger.error(f"[AnalyzeHandler] Failed for {unit.id}: {e}")
                unit.error = str(e)
        
        return inputs


class FilterHandler(StepHandler):
    """过滤步骤处理器。"""

    @property
    def step_type(self) -> str:
        return "filter"

    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        min_length = step.config.get("min_length", 0)
        max_length = step.config.get("max_length", 0)
        required_topics = step.config.get("required_topics", [])
        exclude_sentiment = step.config.get("exclude_sentiment", [])
        
        results = []
        for unit in inputs:
            text = unit.extracted_text or unit.description
            
            # 长度过滤
            if min_length and len(text) < min_length:
                continue
            if max_length and len(text) > max_length:
                continue
            
            # 主题过滤
            if required_topics and not any(t in unit.topics for t in required_topics):
                continue
            
            # 情感过滤
            if exclude_sentiment and unit.sentiment in exclude_sentiment:
                continue
            
            results.append(unit)
        
        logger.info(f"[FilterHandler] Filtered {len(inputs)} -> {len(results)} units")
        return results


class CustomHandler(StepHandler):
    """自定义步骤处理器（通过 Python 函数）。"""

    @property
    def step_type(self) -> str:
        return "custom"

    def execute(self, step: PipelineStep, inputs: List[ContentUnit], context: Dict) -> List[ContentUnit]:
        # 从配置中获取自定义函数路径
        function_path = step.config.get("function", "")
        if not function_path:
            raise PipelineEngineError("Custom step requires 'function' config")
        
        # 动态导入函数（简化实现，实际可扩展）
        # function = import_function(function_path)
        # return function(inputs, step.config, context)
        
        logger.warning(f"[CustomHandler] Custom function {function_path} not executed (dynamic import not implemented)")
        return inputs


# ─────────────────────────── Pipeline Engine ───────────────────────────

class PipelineEngine:
    """流水线执行引擎。

    特性：
    - DAG 步骤执行（按顺序执行 steps）
    - 重试机制（exponential / linear backoff）
    - 超时控制（per-step timeout）
    - 条件判断（skip step based on condition）
    - 错误处理（fail fast / continue on error）

    使用示例：
        engine = PipelineEngine()
        engine.register_handler(MyCustomHandler())
        result = engine.run(pipeline, inputs=[unit], context={"ai_config": {...}})
    """

    def __init__(self):
        self.handlers: Dict[str, StepHandler] = {}
        self._register_builtin_handlers()

    def _register_builtin_handlers(self) -> None:
        """注册内置处理器。"""
        handlers = [
            IngestionHandler(),
            SummarizeHandler(),
            RewriteHandler(),
            XiaohongshuHandler(),
            TranslateHandler(),
            AnalyzeHandler(),
            FilterHandler(),
            CustomHandler(),
        ]
        for h in handlers:
            self.handlers[h.step_type] = h

    def register_handler(self, handler: StepHandler) -> None:
        """注册自定义步骤处理器。"""
        self.handlers[handler.step_type] = handler
        logger.info(f"[PipelineEngine] Registered handler: {handler.step_type}")

    def run(
        self,
        pipeline: Pipeline,
        inputs: List[ContentUnit],
        context: Optional[Dict] = None,
        fail_fast: bool = False,
    ) -> PipelineRun:
        """执行流水线。

        Args:
            pipeline: 要执行的 Pipeline 定义
            inputs: 输入 ContentUnit 列表
            context: 执行上下文（如 AI config, proxy 等）
            fail_fast: 遇到错误时是否立即停止

        Returns:
            PipelineRun 执行结果
        """
        import uuid
        
        run_id = str(uuid.uuid4())
        run = PipelineRun(
            id=run_id,
            pipeline_id=pipeline.id,
            status=PipelineStatus.RUNNING,
            input_unit_ids=[u.id for u in inputs],
        )
        
        context = context or {}
        current_inputs = inputs[:]
        
        logger.info(f"[PipelineEngine] Starting pipeline '{pipeline.name}' (run={run_id})")
        logger.info(f"[PipelineEngine] {len(pipeline.steps)} steps, {len(inputs)} input units")
        
        for i, step in enumerate(pipeline.steps):
            step_result = self._execute_step(step, current_inputs, context, fail_fast)
            
            run.steps.append({
                "step_id": step.id,
                "type": step.type,
                "status": step_result["status"],
                "error": step_result.get("error"),
                "duration_ms": step_result.get("duration_ms", 0),
            })
            
            run.logs.append(f"Step {i+1}/{len(pipeline.steps)} '{step.id}' ({step.type}): {step_result['status']}")
            
            if step_result["status"] == "completed":
                current_inputs = step_result["outputs"]
            elif step_result["status"] == "failed":
                if fail_fast:
                    run.status = PipelineStatus.FAILED
                    run.error = f"Step '{step.id}' failed: {step_result.get('error')}"
                    run.completed_at = time.time()
                    logger.error(f"[PipelineEngine] Pipeline failed at step '{step.id}'")
                    return run
                else:
                    logger.warning(f"[PipelineEngine] Step '{step.id}' failed, continuing with remaining inputs")
                    # 保留未失败的输入
                    current_inputs = [u for u in current_inputs if not u.error]
            
            run.output_unit_ids = [u.id for u in current_inputs]
        
        # 检查整体状态
        all_failed = all(u.error for u in current_inputs) if current_inputs else False
        some_failed = any(u.error for u in current_inputs) if current_inputs else False
        
        if all_failed:
            run.status = PipelineStatus.FAILED
        elif some_failed:
            run.status = PipelineStatus.PARTIAL
        else:
            run.status = PipelineStatus.COMPLETED
        
        run.completed_at = time.time()
        logger.info(f"[PipelineEngine] Pipeline completed: {run.status.value}")
        
        return run

    def _execute_step(
        self,
        step: PipelineStep,
        inputs: List[ContentUnit],
        context: Dict,
        fail_fast: bool,
    ) -> Dict[str, Any]:
        """执行单个步骤，支持重试和超时。"""
        handler = self.handlers.get(step.type)
        if not handler:
            return {
                "status": "failed",
                "error": f"No handler registered for step type '{step.type}'",
                "outputs": inputs,
                "duration_ms": 0,
            }
        
        # 条件判断
        if step.condition and not self._evaluate_condition(step.condition, inputs, context):
            logger.info(f"[PipelineEngine] Step '{step.id}' skipped (condition not met)")
            return {
                "status": "skipped",
                "outputs": inputs,
                "duration_ms": 0,
            }
        
        start_time = time.time()
        last_error = None
        
        for attempt in range(1, step.max_retries + 1):
            try:
                logger.info(f"[PipelineEngine] Step '{step.id}' attempt {attempt}/{step.max_retries}")
                
                # 使用超时执行
                outputs = self._run_with_timeout(
                    handler.execute,
                    step=step,
                    inputs=inputs,
                    context=context,
                    timeout_ms=step.timeout_ms,
                )
                
                duration_ms = int((time.time() - start_time) * 1000)
                logger.info(f"[PipelineEngine] Step '{step.id}' completed in {duration_ms}ms")
                
                return {
                    "status": "completed",
                    "outputs": outputs,
                    "duration_ms": duration_ms,
                }
            
            except TimeoutError:
                last_error = f"Timeout after {step.timeout_ms}ms"
                logger.warning(f"[PipelineEngine] Step '{step.id}' timeout on attempt {attempt}")
            
            except Exception as e:
                last_error = str(e)
                logger.warning(f"[PipelineEngine] Step '{step.id}' failed on attempt {attempt}: {e}")
            
            # 计算重试延迟
            if attempt < step.max_retries:
                delay = self._calculate_backoff(step, attempt)
                logger.info(f"[PipelineEngine] Retrying in {delay}ms")
                time.sleep(delay / 1000)
        
        # 所有重试失败
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"[PipelineEngine] Step '{step.id}' failed after {step.max_retries} attempts")
        
        return {
            "status": "failed",
            "error": last_error,
            "outputs": inputs,
            "duration_ms": duration_ms,
        }

    def _run_with_timeout(
        self,
        func: Callable,
        step: PipelineStep,
        inputs: List[ContentUnit],
        context: Dict,
        timeout_ms: int,
    ) -> List[ContentUnit]:
        """在超时限制内执行函数。"""
        import threading
        
        result = [None]
        exception = [None]
        
        def target():
            try:
                result[0] = func(step, inputs, context)
            except Exception as e:
                exception[0] = e
        
        thread = threading.Thread(target=target)
        thread.start()
        thread.join(timeout=timeout_ms / 1000)
        
        if thread.is_alive():
            raise TimeoutError(f"Step execution exceeded {timeout_ms}ms")
        
        if exception[0]:
            raise exception[0]
        
        return result[0]

    def _calculate_backoff(self, step: PipelineStep, attempt: int) -> int:
        """计算重试延迟。"""
        if step.backoff == "exponential":
            return step.delay_ms * (2 ** (attempt - 1))
        elif step.backoff == "linear":
            return step.delay_ms * attempt
        else:
            return step.delay_ms

    def _evaluate_condition(self, condition: str, inputs: List[ContentUnit], context: Dict) -> bool:
        """评估步骤条件表达式。

        支持简单条件：
        - "inputs.length > 0"
        - "context.ai_config.provider == 'openai'"
        """
        # 简化实现：安全评估
        try:
            # 构建安全命名空间
            namespace = {
                "inputs": inputs,
                "context": context,
                "len": len,
                "any": any,
                "all": all,
            }
            return eval(condition, {"__builtins__": {}}, namespace)
        except Exception as e:
            logger.warning(f"[PipelineEngine] Condition evaluation failed: {e}")
            return True  # 条件失败时默认执行


class PipelineEngineError(Exception):
    """流水线引擎错误。"""
    pass
