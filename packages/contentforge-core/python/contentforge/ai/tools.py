"""
ContentForge Tool 系统 — 工具注册、执行、Schema 定义

职责：
- 工具注册与发现
- Function Calling Schema 定义
- 工具执行与结果格式化
- 与 ContentForge Core 模块集成

设计原则：
- 采用 OpenAI Function Calling Schema 标准
- 与现有 PipelineEngine 复用
- 支持同步/异步执行
"""

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Union
from functools import wraps

logger = logging.getLogger(__name__)


# ─────────────────────────── 工具定义 ───────────────────────────

@dataclass
class ToolParameter:
    """工具参数定义"""
    name: str
    type: str
    description: str
    required: bool = False
    enum: Optional[List[str]] = None
    default: Any = None

    def to_schema(self) -> Dict:
        schema = {
            "type": self.type,
            "description": self.description,
        }
        if self.enum:
            schema["enum"] = self.enum
        if self.default is not None:
            schema["default"] = self.default
        return schema


@dataclass
class ToolDefinition:
    """工具定义（Function Calling Schema）"""
    name: str
    description: str
    parameters: List[ToolParameter]
    handler: Callable
    requires_confirmation: bool = False
    async_handler: bool = False
    category: str = "general"
    icon: str = "wrench"

    def to_openai_schema(self) -> Dict:
        """转换为 OpenAI Function Calling Schema"""
        properties = {}
        required = []

        for param in self.parameters:
            properties[param.name] = param.to_schema()
            if param.required:
                required.append(param.name)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        }

    def to_claude_schema(self) -> Dict:
        """转换为 Claude Tool Use Schema"""
        return self.to_openai_schema()


# ─────────────────────────── 工具执行结果 ───────────────────────────

@dataclass
class ToolExecutionResult:
    """工具执行结果"""
    success: bool
    output: Any
    error: Optional[str] = None
    duration_ms: int = 0
    metadata: Dict[str, Any] = None

    def to_dict(self) -> Dict:
        return {
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "metadata": self.metadata or {},
        }


# ─────────────────────────── 工具执行器 ───────────────────────────

class ToolExecutor:
    """
    工具执行器

    管理所有可用工具，提供注册、发现、执行功能。
    与 ContentForge Core 模块集成。
    """

    def __init__(self):
        self.tools: Dict[str, ToolDefinition] = {}
        self._register_builtin_tools()

    def register(self, tool: ToolDefinition) -> None:
        """注册工具"""
        self.tools[tool.name] = tool
        logger.info("[ToolExecutor] Registered tool: %s", tool.name)

    def unregister(self, name: str) -> None:
        """注销工具"""
        if name in self.tools:
            del self.tools[name]
            logger.info("[ToolExecutor] Unregistered tool: %s", name)

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """获取工具定义"""
        return self.tools.get(name)

    def list_tools(self) -> List[ToolDefinition]:
        """列出所有工具"""
        return list(self.tools.values())

    def describe_tools(self, tool_names: Optional[List[str]] = None) -> str:
        """生成工具描述文本（用于 System Prompt）"""
        names = tool_names or list(self.tools.keys())
        descriptions = []
        for name in names:
            tool = self.tools.get(name)
            if tool:
                params_str = ", ".join([
                    f"{p.name}: {p.type}"
                    for p in tool.parameters
                ])
                descriptions.append(
                    f"- {tool.name}({params_str}): {tool.description}"
                )
        return "\n".join(descriptions)

    def get_schemas_for_llm(self, tool_names: Optional[List[str]] = None) -> List[Dict]:
        """获取 LLM 可用的工具 Schema 列表"""
        names = tool_names or list(self.tools.keys())
        return [
            self.tools[name].to_openai_schema()
            for name in names
            if name in self.tools
        ]

    def execute(self, name: str, args: Dict[str, Any]) -> ToolExecutionResult:
        """执行工具"""
        tool = self.tools.get(name)
        if not tool:
            return ToolExecutionResult(
                success=False,
                output=None,
                error=f"工具 '{name}' 未找到",
            )

        start_time = time.time()
        try:
            # 验证参数
            validated_args = self._validate_args(tool, args)

            # 执行
            if tool.async_handler:
                # 异步执行（简化处理，实际应使用 asyncio）
                result = tool.handler(**validated_args)
            else:
                result = tool.handler(**validated_args)

            duration_ms = int((time.time() - start_time) * 1000)

            return ToolExecutionResult(
                success=True,
                output=result,
                duration_ms=duration_ms,
            )

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error("[ToolExecutor] Tool %s failed: %s", name, e, exc_info=True)
            return ToolExecutionResult(
                success=False,
                output=None,
                error=str(e),
                duration_ms=duration_ms,
            )

    def _validate_args(self, tool: ToolDefinition, args: Dict[str, Any]) -> Dict[str, Any]:
        """验证并填充默认参数"""
        validated = {}
        for param in tool.parameters:
            if param.name in args:
                validated[param.name] = args[param.name]
            elif param.default is not None:
                validated[param.name] = param.default
            elif param.required:
                raise ValueError(f"缺少必需参数: {param.name}")
        return validated

    # ─────────────────── 内置工具注册 ───────────────────

    def _register_builtin_tools(self) -> None:
        """注册 ContentForge 内置工具"""
        tools = [
            self._build_scrape_tool(),
            self._build_analyze_tool(),
            self._build_summarize_tool(),
            self._build_rewrite_tool(),
            self._build_translate_tool(),
            self._build_xiaohongshu_tool(),
            self._build_run_pipeline_tool(),
            self._build_search_assets_tool(),
            self._build_get_asset_tool(),
            self._build_publish_tool(),
        ]
        for tool in tools:
            self.register(tool)

    # ─────────────────── 具体工具定义 ───────────────────

    def _build_scrape_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="scrape",
            description="从 URL 采集内容",
            parameters=[
                ToolParameter("url", "string", "目标 URL", required=True),
                ToolParameter("platform", "string", "平台类型", enum=["auto", "twitter", "youtube", "rss", "web"]),
            ],
            handler=self._handle_scrape,
            category="ingestion",
            icon="download",
        )

    def _build_analyze_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="analyze",
            description="分析内容并提取主题、关键词、情感",
            parameters=[
                ToolParameter("asset_id", "string", "资产 ID", required=True),
                ToolParameter("mode", "string", "分析模式", enum=["quick", "ai", "both"], default="ai"),
            ],
            handler=self._handle_analyze,
            category="processing",
            icon="microscope",
        )

    def _build_summarize_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="summarize",
            description="生成内容摘要",
            parameters=[
                ToolParameter("asset_id", "string", "资产 ID", required=True),
                ToolParameter("style", "string", "摘要风格", enum=["structured", "concise", "detailed", "bullets", "executive"], default="structured"),
            ],
            handler=self._handle_summarize,
            category="processing",
            icon="scroll-text",
        )

    def _build_rewrite_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="rewrite",
            description="改写内容风格",
            parameters=[
                ToolParameter("asset_id", "string", "资产 ID", required=True),
                ToolParameter("tone", "string", "语调", enum=["professional", "casual", "humorous", "academic", "marketing"], required=True),
                ToolParameter("style", "string", "风格描述"),
            ],
            handler=self._handle_rewrite,
            category="processing",
            icon="pen-tool",
        )

    def _build_translate_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="translate",
            description="翻译内容",
            parameters=[
                ToolParameter("asset_id", "string", "资产 ID", required=True),
                ToolParameter("target_language", "string", "目标语言", enum=["zh", "en", "ja", "ko"], required=True),
            ],
            handler=self._handle_translate,
            category="processing",
            icon="languages",
        )

    def _build_xiaohongshu_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="xiaohongshu_convert",
            description="将内容转换为小红书文案格式",
            parameters=[
                ToolParameter("asset_id", "string", "资产 ID", required=True),
                ToolParameter("max_length", "integer", "最大长度", default=800),
            ],
            handler=self._handle_xiaohongshu,
            category="processing",
            icon="heart",
        )

    def _build_run_pipeline_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="run_pipeline",
            description="执行预设流水线",
            parameters=[
                ToolParameter("preset_name", "string", "预设名称", enum=["twitter_to_xiaohongshu", "youtube_to_notes", "rss_to_digest", "web_to_summary"], required=True),
                ToolParameter("input_url", "string", "输入 URL", required=True),
            ],
            handler=self._handle_run_pipeline,
            requires_confirmation=True,
            category="pipeline",
            icon="workflow",
        )

    def _build_search_assets_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="search_assets",
            description="搜索内容资产库",
            parameters=[
                ToolParameter("query", "string", "搜索关键词", required=True),
                ToolParameter("type", "string", "资产类型", enum=["video", "article", "tweet", "audio"]),
                ToolParameter("limit", "integer", "返回数量", default=10),
            ],
            handler=self._handle_search_assets,
            category="asset",
            icon="search",
        )

    def _build_get_asset_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="get_asset_detail",
            description="获取内容资产详情",
            parameters=[
                ToolParameter("asset_id", "string", "资产 ID", required=True),
            ],
            handler=self._handle_get_asset,
            category="asset",
            icon="file-text",
        )

    def _build_publish_tool(self) -> ToolDefinition:
        return ToolDefinition(
            name="publish",
            description="导出内容到指定格式",
            parameters=[
                ToolParameter("asset_id", "string", "资产 ID", required=True),
                ToolParameter("format", "string", "输出格式", enum=["markdown", "xiaohongshu", "json"], required=True),
                ToolParameter("output_path", "string", "输出路径"),
            ],
            handler=self._handle_publish,
            category="publishing",
            icon="send",
        )

    # ─────────────────── 工具处理函数（占位实现） ───────────────────

    def _handle_scrape(self, url: str, platform: str = "auto") -> Dict:
        """采集内容"""
        from contentforge.ingestion.web_scraper import WebScraper
        scraper = WebScraper()
        result = scraper.scrape(url, platform=platform)
        return {"status": "success", "asset_id": result.id, "title": result.title}

    def _handle_analyze(self, asset_id: str, mode: str = "ai") -> Dict:
        """分析内容"""
        from contentforge.processing.analyzer import Analyzer
        from contentforge.processing.ai_engine import AIEngine
        # 简化实现，实际应从数据库获取资产
        return {"status": "success", "asset_id": asset_id, "mode": mode, "topics": [], "sentiment": "neutral"}

    def _handle_summarize(self, asset_id: str, style: str = "structured") -> Dict:
        """生成摘要"""
        from contentforge.processing.summarizer import Summarizer
        return {"status": "success", "asset_id": asset_id, "style": style, "summary": ""}

    def _handle_rewrite(self, asset_id: str, tone: str, style: str = "") -> Dict:
        """改写内容"""
        from contentforge.processing.ai_engine import AIEngine
        return {"status": "success", "asset_id": asset_id, "tone": tone, "rewritten": ""}

    def _handle_translate(self, asset_id: str, target_language: str) -> Dict:
        """翻译内容"""
        from contentforge.processing.translator import Translator
        return {"status": "success", "asset_id": asset_id, "target_language": target_language, "translated": ""}

    def _handle_xiaohongshu(self, asset_id: str, max_length: int = 800) -> Dict:
        """转换为小红书文案"""
        from contentforge.processing.xiaohongshu_converter import XiaohongshuConverter
        return {"status": "success", "asset_id": asset_id, "max_length": max_length, "xhs_content": ""}

    def _handle_run_pipeline(self, preset_name: str, input_url: str) -> Dict:
        """执行 Pipeline"""
        from contentforge.pipeline.engine import PipelineEngine
        from contentforge.pipeline.presets import load_preset
        engine = PipelineEngine()
        pipeline = load_preset(preset_name)
        # 简化实现
        return {"status": "success", "preset": preset_name, "input_url": input_url}

    def _handle_search_assets(self, query: str, type: Optional[str] = None, limit: int = 10) -> Dict:
        """搜索资产"""
        return {"status": "success", "query": query, "results": [], "total": 0}

    def _handle_get_asset(self, asset_id: str) -> Dict:
        """获取资产详情"""
        return {"status": "success", "asset_id": asset_id, "asset": {}}

    def _handle_publish(self, asset_id: str, format: str, output_path: Optional[str] = None) -> Dict:
        """发布内容"""
        return {"status": "success", "asset_id": asset_id, "format": format, "output_path": output_path}


# ─────────────────────────── 使用示例 ───────────────────────────

if __name__ == "__main__":
    executor = ToolExecutor()

    print("=== 注册工具 ===")
    for tool in executor.list_tools():
        print(f"- {tool.name}: {tool.description}")

    print("\n=== OpenAI Schema ===")
    schemas = executor.get_schemas_for_llm()
    print(json.dumps(schemas[:2], indent=2, ensure_ascii=False))

    print("\n=== 工具描述 ===")
    print(executor.describe_tools(["analyze", "summarize", "rewrite"]))
