"""Pipeline Runner — 流水线运行器

管理 PipelineRun 状态、日志、错误处理。
提供持久化、重放、进度追踪等生命周期管理功能。

使用示例：
    runner = PipelineRunner(storage_dir="~/.contentforge/runs")
    run = runner.start(pipeline, inputs=[unit])
    runner.wait(run.id)
    print(runner.get_status(run.id))
"""
import json
import logging
import os
import time
from typing import Dict, List, Optional

from contentforge.models import (
    ContentUnit,
    Pipeline,
    PipelineRun,
    PipelineStatus,
)
from contentforge.pipeline.engine import PipelineEngine
from contentforge.pipeline.presets import get_preset

logger = logging.getLogger(__name__)


class PipelineRunner:
    """流水线运行器。

    特性：
    - PipelineRun 生命周期管理（创建→执行→完成）
    - 执行日志持久化（JSONL 格式）
    - 状态查询和进度追踪
    - 失败运行重放
    - 历史记录检索

    使用示例：
        runner = PipelineRunner(storage_dir="~/.contentforge/runs")
        
        # 使用预设
        run = runner.run_preset("twitter_to_xiaohongshu", url="https://x.com/...")
        
        # 使用自定义 Pipeline
        run = runner.run(pipeline, inputs=[unit])
        
        # 查询状态
        status = runner.get_status(run.id)
    """

    def __init__(self, storage_dir: Optional[str] = None, engine: Optional[PipelineEngine] = None):
        self.storage_dir = os.path.expanduser(storage_dir or "~/.config/contentforge/runs")
        self.engine = engine or PipelineEngine()
        self._runs: Dict[str, PipelineRun] = {}
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        """确保存储目录存在。"""
        os.makedirs(self.storage_dir, exist_ok=True)
        os.makedirs(os.path.join(self.storage_dir, "logs"), exist_ok=True)
        os.makedirs(os.path.join(self.storage_dir, "outputs"), exist_ok=True)

    # ─────────────────────────── 核心运行方法 ───────────────────────────

    def run(
        self,
        pipeline: Optional[Pipeline] = None,
        inputs: Optional[List[ContentUnit]] = None,
        context: Optional[Dict] = None,
        fail_fast: bool = False,
        pipeline_id: Optional[str] = None,
        input: Optional[Dict] = None,
    ) -> PipelineRun:
        """执行流水线并管理生命周期。

        支持两种调用方式：
        - 直接传入 pipeline 对象
        - 通过 pipeline_id 从预设加载
        """
        # 从预设加载 pipeline
        if pipeline_id is not None and pipeline is None:
            preset = get_preset(pipeline_id)
            pipeline = preset

        if pipeline is None:
            raise ValueError("必须提供 pipeline 或 pipeline_id")

        # 兼容 input 参数（Go CLI 传入的是单个 dict）
        if inputs is None:
            inputs = []
        if input is not None and isinstance(input, dict):
            # 将 input 字典转换为 ContentUnit
            from contentforge.models import ContentUnit, SourceInfo
            unit = ContentUnit(
                id=input.get("id", ""),
                source=SourceInfo(
                    platform=input.get("platform", "unknown"),
                    url=input.get("url", ""),
                ),
                type=input.get("type", "article"),
                title=input.get("title", ""),
                extracted_text=input.get("extracted_text", input.get("text", "")),
            )
            inputs = [unit]

        run_id = self._create_run(pipeline, inputs)
        run = self._runs[run_id]
        
        logger.info(f"[Runner] Starting pipeline '{pipeline.name}' (run={run_id})")
        
        try:
            # 执行流水线
            result = self.engine.run(
                pipeline=pipeline,
                inputs=inputs,
                context=context,
                fail_fast=fail_fast,
            )
            
            # 更新运行状态
            run.status = result.status
            run.steps = result.steps
            run.output_unit_ids = result.output_unit_ids
            run.logs = result.logs
            run.error = result.error
            run.completed_at = result.completed_at
            
        except Exception as e:
            logger.exception(f"[Runner] Pipeline execution failed: {e}")
            run.status = PipelineStatus.FAILED
            run.error = str(e)
            run.completed_at = time.time()
        
        # 持久化
        self._persist_run(run)
        self._persist_outputs(run, inputs)
        
        logger.info(f"[Runner] Pipeline completed: {run.status.value}")
        return run

    def run_preset(
        self,
        preset_name: str,
        context: Optional[Dict] = None,
        **input_params,
    ) -> PipelineRun:
        """使用预设执行流水线。

        Args:
            preset_name: 预设名称（如 "twitter_to_xiaohongshu"）
            context: 执行上下文
            **input_params: 输入参数（如 url="..."）
        """
        preset = get_preset(preset_name)
        pipeline = preset.to_pipeline()
        
        # 构建输入
        context = context or {}
        context["input_params"] = input_params
        
        # 将输入参数注入到第一个 ingest 步骤
        for step in pipeline.steps:
            if step.type == "ingest":
                if "url" in input_params:
                    step.config["url"] = input_params["url"]
                if "platform" in input_params:
                    step.config["platform"] = input_params["platform"]
                if "limit" in input_params:
                    step.config["limit"] = input_params["limit"]
        
        # 创建空输入列表（ingest 步骤会生成内容）
        inputs: List[ContentUnit] = []
        
        return self.run(pipeline, inputs=inputs, context=context)

    def run_by_id(self, pipeline_id: str, inputs: List[ContentUnit], context: Optional[Dict] = None) -> Optional[PipelineRun]:
        """通过 pipeline ID 执行（需要从存储加载 Pipeline 定义）。"""
        # 简化实现：实际应从存储加载
        logger.warning("[Runner] run_by_id not fully implemented - requires Pipeline storage")
        return None

    # ─────────────────────────── 状态管理 ───────────────────────────

    def get_status(self, run_id: str) -> Optional[Dict]:
        """获取运行状态。"""
        run = self._runs.get(run_id)
        if not run:
            run = self._load_run(run_id)
        
        if not run:
            return None
        
        return {
            "id": run.id,
            "pipeline_id": run.pipeline_id,
            "status": run.status.value,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
            "step_count": len(run.steps),
            "completed_steps": sum(1 for s in run.steps if s.get("status") == "completed"),
            "failed_steps": sum(1 for s in run.steps if s.get("status") == "failed"),
            "error": run.error,
        }

    def get_logs(self, run_id: str) -> List[str]:
        """获取运行日志。"""
        run = self._runs.get(run_id) or self._load_run(run_id)
        if run:
            return run.logs
        return []

    def get_outputs(self, run_id: str) -> List[ContentUnit]:
        """获取运行输出。"""
        # 从文件加载输出
        output_path = os.path.join(self.storage_dir, "outputs", f"{run_id}.json")
        if os.path.exists(output_path):
            with open(output_path, "r") as f:
                data = json.load(f)
                return [ContentUnit.from_dict(u) for u in data]
        return []

    def list_runs(self, pipeline_id: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """列出历史运行记录。"""
        runs = []
        
        # 扫描存储目录
        for filename in os.listdir(self.storage_dir):
            if filename.endswith(".json") and not filename.startswith("_"):
                run_id = filename[:-5]
                run = self._load_run(run_id)
                if run:
                    if pipeline_id is None or run.pipeline_id == pipeline_id:
                        runs.append({
                            "id": run.id,
                            "pipeline_id": run.pipeline_id,
                            "status": run.status.value,
                            "started_at": run.started_at,
                            "completed_at": run.completed_at,
                        })
        
        # 按时间排序，取最新
        runs.sort(key=lambda r: r.get("started_at", 0), reverse=True)
        return runs[:limit]

    def cancel(self, run_id: str) -> bool:
        """取消运行中的流水线（尽力而为）。"""
        run = self._runs.get(run_id)
        if run and run.status == PipelineStatus.RUNNING:
            run.status = PipelineStatus.CANCELLED
            run.completed_at = time.time()
            run.logs.append("Run cancelled by user")
            self._persist_run(run)
            logger.info(f"[Runner] Run {run_id} cancelled")
            return True
        return False

    def retry(self, run_id: str, context: Optional[Dict] = None) -> Optional[PipelineRun]:
        """重试失败的运行。

        从持久化存储恢复原始输入和 Pipeline，重新执行。
        """
        run = self._runs.get(run_id) or self._load_run(run_id)
        if not run:
            logger.error(f"[Runner] Run {run_id} not found for retry")
            return None
        
        # 加载 Pipeline 定义
        pipeline_data = self._load_pipeline_data(run.pipeline_id)
        if not pipeline_data:
            logger.error(f"[Runner] Pipeline {run.pipeline_id} not found for retry")
            return None
        
        # 恢复输入（简化：实际应存储原始输入）
        inputs = self._load_inputs(run_id) or []
        
        pipeline = Pipeline(
            id=pipeline_data["id"],
            name=pipeline_data["name"],
            description=pipeline_data.get("description", ""),
            steps=[],  # 需要从完整存储恢复
        )
        
        logger.info(f"[Runner] Retrying run {run_id}")
        return self.run(pipeline, inputs=inputs, context=context)

    # ─────────────────────────── 内部方法 ───────────────────────────

    def _create_run(self, pipeline: Pipeline, inputs: List[ContentUnit]) -> str:
        """创建新的 PipelineRun 记录。"""
        import uuid
        
        run_id = str(uuid.uuid4())
        run = PipelineRun(
            id=run_id,
            pipeline_id=pipeline.id,
            status=PipelineStatus.PENDING,
            input_unit_ids=[u.id for u in inputs],
        )
        self._runs[run_id] = run
        return run_id

    def _persist_run(self, run: PipelineRun) -> None:
        """持久化运行记录到磁盘。"""
        filepath = os.path.join(self.storage_dir, f"{run.id}.json")
        with open(filepath, "w") as f:
            json.dump(run.to_dict(), f, indent=2, ensure_ascii=False, default=str)
        
        # 同时写入日志文件
        log_path = os.path.join(self.storage_dir, "logs", f"{run.id}.log")
        with open(log_path, "a") as f:
            for log in run.logs:
                f.write(f"{time.time():.3f} | {log}\n")

    def _persist_outputs(self, run: PipelineRun, outputs: List[ContentUnit]) -> None:
        """持久化输出 ContentUnit。"""
        output_path = os.path.join(self.storage_dir, "outputs", f"{run.id}.json")
        with open(output_path, "w") as f:
            json.dump([u.to_dict() for u in outputs], f, indent=2, ensure_ascii=False, default=str)

    def _load_run(self, run_id: str) -> Optional[PipelineRun]:
        """从磁盘加载运行记录。"""
        filepath = os.path.join(self.storage_dir, f"{run_id}.json")
        if not os.path.exists(filepath):
            return None
        
        try:
            with open(filepath, "r") as f:
                data = json.load(f)
            
            run = PipelineRun(
                id=data["id"],
                pipeline_id=data["pipeline_id"],
                status=PipelineStatus(data["status"]),
                started_at=data.get("started_at", time.time()),
                completed_at=data.get("completed_at"),
                steps=data.get("steps", []),
                input_unit_ids=data.get("input_unit_ids", []),
                output_unit_ids=data.get("output_unit_ids", []),
                logs=data.get("logs", []),
                error=data.get("error"),
            )
            self._runs[run_id] = run
            return run
        except Exception as e:
            logger.error(f"[Runner] Failed to load run {run_id}: {e}")
            return None

    def _load_pipeline_data(self, pipeline_id: str) -> Optional[Dict]:
        """加载 Pipeline 定义。"""
        # 简化实现：实际应从 Pipeline 存储加载
        filepath = os.path.join(self.storage_dir, "..", "pipelines", f"{pipeline_id}.json")
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                return json.load(f)
        return None

    def _load_inputs(self, run_id: str) -> Optional[List[ContentUnit]]:
        """加载运行输入。"""
        # 简化实现
        return None

    def cleanup(self, max_age_days: int = 30) -> int:
        """清理旧运行记录。"""
        cutoff = time.time() - (max_age_days * 24 * 60 * 60)
        removed = 0
        
        for filename in os.listdir(self.storage_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.storage_dir, filename)
                try:
                    if os.path.getmtime(filepath) < cutoff:
                        os.remove(filepath)
                        removed += 1
                        
                        # 同时删除日志
                        log_path = os.path.join(self.storage_dir, "logs", filename.replace(".json", ".log"))
                        if os.path.exists(log_path):
                            os.remove(log_path)
                except Exception as e:
                    logger.warning(f"[Runner] Cleanup failed for {filename}: {e}")
        
        logger.info(f"[Runner] Cleaned up {removed} old runs")
        return removed


    def load_run(self, run_id: str) -> Optional[Dict]:
        """加载运行状态（Go CLI 兼容）。"""
        return self.get_status(run_id)

class PipelineRunnerError(Exception):
    """运行器错误。"""
    pass
