"""SkillContext — Skill 执行上下文。

提供本地内容访问能力：
- ContentAccess: 读取 SQLite 中的 ContentUnit、PipelineRun 等数据
- FileAccess: 读取本地文件、视频元数据
- ToolRegistry: 工具注册与调用

与现有模块集成：
- models.py: ContentUnit, Pipeline, PipelineRun
- config.py: ContentForgeConfig
- processing/ai_engine.py: AIEngine
"""

import json
import logging
import os
import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Generator, List, Optional, Tuple, Union

from contentforge.models import ContentUnit, ContentStatus, PipelineRun

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Content Access — SQLite 数据访问
# ------------------------------------------------------------------------------


DEFAULT_DB_PATH = Path.home() / ".contentforge" / "contentforge.db"


class ContentAccess:
    """内容资产访问层 — 通过 SQLite 读取 ContentUnit 等数据。"""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self._ensure_db()

    def _ensure_db(self) -> None:
        """确保数据库文件存在。"""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self) -> sqlite3.Connection:
        """获取数据库连接。"""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------------
    # ContentUnit Queries
    # ------------------------------------------------------------------

    def get_content_unit(self, unit_id: str) -> Optional[ContentUnit]:
        """根据 ID 获取 ContentUnit。"""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM content_units WHERE id = ?", (unit_id,)
                )
                row = cursor.fetchone()
                if row:
                    return self._row_to_unit(row)
                return None
        except sqlite3.Error as e:
            logger.error("[ContentAccess] Failed to get unit %s: %s", unit_id, e)
            return None

    def list_content_units(
        self,
        status: Optional[str] = None,
        content_type: Optional[str] = None,
        tags: Optional[List[str]] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ContentUnit]:
        """列出 ContentUnit，支持过滤。"""
        query = "SELECT * FROM content_units WHERE 1=1"
        params = []

        if status:
            query += " AND status = ?"
            params.append(status)
        if content_type:
            query += " AND type = ?"
            params.append(content_type)
        if tags:
            # 简单实现：匹配任意标签（JSON 包含）
            query += " AND (" + " OR ".join(["tags LIKE ?"] * len(tags)) + ")"
            params.extend([f'%"{tag}"%' for tag in tags])

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        try:
            with self._get_connection() as conn:
                cursor = conn.execute(query, params)
                return [self._row_to_unit(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logger.error("[ContentAccess] Failed to list units: %s", e)
            return []

    def search_content_units(self, query_text: str, limit: int = 20) -> List[ContentUnit]:
        """搜索 ContentUnit（标题、描述、文本内容）。"""
        search_pattern = f"%{query_text}%"
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    """SELECT * FROM content_units 
                       WHERE title LIKE ? OR description LIKE ? OR extracted_text LIKE ?
                       ORDER BY created_at DESC LIMIT ?""",
                    (search_pattern, search_pattern, search_pattern, limit),
                )
                return [self._row_to_unit(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logger.error("[ContentAccess] Failed to search units: %s", e)
            return []

    def get_recent_content(self, limit: int = 10) -> List[ContentUnit]:
        """获取最近的内容。"""
        return self.list_content_units(limit=limit)

    def get_content_by_pipeline(self, pipeline_id: str) -> List[ContentUnit]:
        """获取 Pipeline 关联的内容。"""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM content_units WHERE pipeline_id = ? ORDER BY created_at DESC",
                    (pipeline_id,),
                )
                return [self._row_to_unit(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logger.error("[ContentAccess] Failed to get pipeline content: %s", e)
            return []

    # ------------------------------------------------------------------
    # PipelineRun Queries
    # ------------------------------------------------------------------

    def get_pipeline_run(self, run_id: str) -> Optional[PipelineRun]:
        """获取 PipelineRun。"""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM pipeline_runs WHERE id = ?", (run_id,)
                )
                row = cursor.fetchone()
                if row:
                    return self._row_to_pipeline_run(row)
                return None
        except sqlite3.Error as e:
            logger.error("[ContentAccess] Failed to get run %s: %s", run_id, e)
            return None

    def list_pipeline_runs(
        self,
        pipeline_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 20,
    ) -> List[PipelineRun]:
        """列出 PipelineRun。"""
        query = "SELECT * FROM pipeline_runs WHERE 1=1"
        params = []

        if pipeline_id:
            query += " AND pipeline_id = ?"
            params.append(pipeline_id)
        if status:
            query += " AND status = ?"
            params.append(status)

        query += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)

        try:
            with self._get_connection() as conn:
                cursor = conn.execute(query, params)
                return [self._row_to_pipeline_run(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logger.error("[ContentAccess] Failed to list runs: %s", e)
            return []

    # ------------------------------------------------------------------
    # Statistics
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        """获取内容统计。"""
        try:
            with self._get_connection() as conn:
                # 内容统计
                total = conn.execute("SELECT COUNT(*) FROM content_units").fetchone()[0]
                by_status = {}
                for row in conn.execute("SELECT status, COUNT(*) FROM content_units GROUP BY status"):
                    by_status[row[0]] = row[1]

                # Pipeline 统计
                pipeline_total = conn.execute("SELECT COUNT(*) FROM pipeline_runs").fetchone()[0]
                by_run_status = {}
                for row in conn.execute("SELECT status, COUNT(*) FROM pipeline_runs GROUP BY status"):
                    by_run_status[row[0]] = row[1]

                return {
                    "content_units": {
                        "total": total,
                        "by_status": by_status,
                    },
                    "pipeline_runs": {
                        "total": pipeline_total,
                        "by_status": by_run_status,
                    },
                }
        except sqlite3.Error as e:
            logger.error("[ContentAccess] Failed to get stats: %s", e)
            return {}

    # ------------------------------------------------------------------
    # Serialization Helpers
    # ------------------------------------------------------------------

    def _row_to_unit(self, row: sqlite3.Row) -> ContentUnit:
        """将数据库行转换为 ContentUnit。"""
        data = dict(row)
        # 处理 JSON 字段
        for key in ["engagement", "key_points", "topics", "tags", "raw_metadata"]:
            if key in data and isinstance(data[key], str):
                try:
                    data[key] = json.loads(data[key])
                except json.JSONDecodeError:
                    data[key] = []
        
        # 处理 SourceInfo
        from contentforge.models import SourceInfo
        if "source" in data and isinstance(data["source"], str):
            try:
                source_data = json.loads(data["source"])
                data["source"] = SourceInfo(**source_data)
            except (json.JSONDecodeError, TypeError):
                data["source"] = SourceInfo(platform="unknown", url="")
        elif "platform" in data:
            # 扁平化存储的情况
            data["source"] = SourceInfo(
                platform=data.get("platform", "unknown"),
                url=data.get("url", ""),
                author=data.get("author"),
            )
        
        return ContentUnit.from_dict(data)

    def _row_to_pipeline_run(self, row: sqlite3.Row) -> PipelineRun:
        """将数据库行转换为 PipelineRun。"""
        data = dict(row)
        # 处理 JSON 字段
        for key in ["steps", "input_unit_ids", "output_unit_ids", "logs"]:
            if key in data and isinstance(data[key], str):
                try:
                    data[key] = json.loads(data[key])
                except json.JSONDecodeError:
                    data[key] = []
        return PipelineRun.from_dict(data)


# ------------------------------------------------------------------------------
# File Access — 本地文件系统访问
# ------------------------------------------------------------------------------


class FileAccess:
    """文件系统访问层 — 读取本地文件、视频元数据。"""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir) if base_dir else Path.home() / ".contentforge"

    # ------------------------------------------------------------------
    # File Operations
    # ------------------------------------------------------------------

    def read_file(self, path: str, max_size: int = 10 * 1024 * 1024) -> Tuple[bool, Union[str, bytes]]:
        """读取文件内容。
        
        Returns:
            (success, content_or_error)
        """
        try:
            file_path = Path(path)
            if not file_path.exists():
                return False, f"File not found: {path}"
            
            if file_path.stat().st_size > max_size:
                return False, f"File too large: {file_path.stat().st_size} bytes (max {max_size})"
            
            # 文本文件
            text_extensions = {".txt", ".md", ".json", ".yaml", ".yml", ".csv", ".py", ".go", ".ts", ".js"}
            if file_path.suffix.lower() in text_extensions:
                return True, file_path.read_text(encoding="utf-8")
            
            # 二进制文件返回 base64 或元信息
            return True, file_path.read_bytes()
        
        except Exception as e:
            logger.error("[FileAccess] Failed to read %s: %s", path, e)
            return False, str(e)

    def read_text_file(self, path: str) -> Tuple[bool, str]:
        """读取文本文件。"""
        success, content = self.read_file(path)
        if not success:
            return False, content
        if isinstance(content, bytes):
            try:
                return True, content.decode("utf-8")
            except UnicodeDecodeError:
                return False, "Binary file cannot be decoded as text"
        return True, content

    def list_files(self, directory: str, pattern: str = "*") -> List[Dict[str, Any]]:
        """列出目录中的文件。"""
        try:
            dir_path = Path(directory)
            if not dir_path.exists():
                return []
            
            files = []
            for file_path in dir_path.glob(pattern):
                if file_path.is_file():
                    stat = file_path.stat()
                    files.append({
                        "name": file_path.name,
                        "path": str(file_path),
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                        "extension": file_path.suffix,
                    })
            return sorted(files, key=lambda x: x["modified"], reverse=True)
        except Exception as e:
            logger.error("[FileAccess] Failed to list files in %s: %s", directory, e)
            return []

    def file_exists(self, path: str) -> bool:
        """检查文件是否存在。"""
        return Path(path).exists()

    # ------------------------------------------------------------------
    # Video Metadata
    # ------------------------------------------------------------------

    def get_video_metadata(self, video_path: str) -> Dict[str, Any]:
        """获取视频元数据（使用 ffprobe 或 mediainfo）。"""
        import subprocess

        if not Path(video_path).exists():
            return {"error": f"Video file not found: {video_path}"}

        try:
            # 尝试使用 ffprobe
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v", "quiet",
                    "-print_format", "json",
                    "-show_format",
                    "-show_streams",
                    video_path,
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0:
                metadata = json.loads(result.stdout)
                return self._extract_video_info(metadata)
        except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
            pass

        # 回退：基本文件信息
        stat = Path(video_path).stat()
        return {
            "path": video_path,
            "size": stat.st_size,
            "modified": stat.st_mtime,
            "format": Path(video_path).suffix,
        }

    def _extract_video_info(self, ffprobe_output: Dict) -> Dict[str, Any]:
        """从 ffprobe JSON 提取关键信息。"""
        info = {
            "format": ffprobe_output.get("format", {}).get("format_name", ""),
            "duration": float(ffprobe_output.get("format", {}).get("duration", 0)),
            "size": int(ffprobe_output.get("format", {}).get("size", 0)),
            "bitrate": int(ffprobe_output.get("format", {}).get("bit_rate", 0)),
            "streams": [],
        }

        for stream in ffprobe_output.get("streams", []):
            stream_info = {
                "type": stream.get("codec_type", ""),
                "codec": stream.get("codec_name", ""),
                "width": stream.get("width"),
                "height": stream.get("height"),
                "fps": stream.get("r_frame_rate"),
                "language": stream.get("tags", {}).get("language", ""),
            }
            info["streams"].append(stream_info)

        # 提取视频流信息
        video_streams = [s for s in info["streams"] if s["type"] == "video"]
        if video_streams:
            info["video"] = video_streams[0]
            info["resolution"] = f"{video_streams[0].get('width', '?')}x{video_streams[0].get('height', '?')}"

        # 提取音频流信息
        audio_streams = [s for s in info["streams"] if s["type"] == "audio"]
        if audio_streams:
            info["audio"] = audio_streams[0]

        return info

    # ------------------------------------------------------------------
    # ContentForge Output Directory
    # ------------------------------------------------------------------

    def get_output_files(self, output_dir: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取输出目录中的文件。"""
        dir_path = Path(output_dir) if output_dir else self.base_dir / "output"
        if not dir_path.exists():
            return []
        return self.list_files(str(dir_path))

    def read_content_unit_file(self, unit: ContentUnit) -> Tuple[bool, str]:
        """读取 ContentUnit 关联的文件。"""
        if unit.file_path and Path(unit.file_path).exists():
            return self.read_text_file(unit.file_path)
        return False, "No file associated with this content unit"


# ------------------------------------------------------------------------------
# Tool Registry — 工具注册与调用
# ------------------------------------------------------------------------------


class ToolRegistry:
    """工具注册表 — 管理 Skill 可调用的工具。

    内置工具：
    - content_search: 搜索本地内容
    - content_read: 读取 ContentUnit
    - file_read: 读取本地文件
    - file_list: 列出文件
    - video_metadata: 获取视频元数据
    - pipeline_run: 执行 Pipeline
    - pipeline_list: 列出 Pipeline
    - ai_generate: 调用 AI Engine 生成内容
    - ai_summarize: 调用 AI Engine 摘要
    """

    def __init__(self, content_access: Optional[ContentAccess] = None, file_access: Optional[FileAccess] = None):
        self.content_access = content_access or ContentAccess()
        self.file_access = file_access or FileAccess()
        self._tools: Dict[str, Callable] = {}
        self._tool_schemas: Dict[str, Dict[str, Any]] = {}
        self._register_builtin_tools()

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, name: str, func: Callable, schema: Optional[Dict[str, Any]] = None) -> None:
        """注册工具。

        Args:
            name: 工具名称
            func: 工具函数，签名应为 func(**kwargs) -> Any
            schema: JSON Schema 描述工具参数
        """
        self._tools[name] = func
        self._tool_schemas[name] = schema or {"type": "object", "properties": {}}
        logger.info("[ToolRegistry] Registered tool: %s", name)

    def unregister(self, name: str) -> bool:
        """注销工具。"""
        if name in self._tools:
            del self._tools[name]
            del self._tool_schemas[name]
            return True
        return False

    def has_tool(self, name: str) -> bool:
        """检查工具是否存在。"""
        return name in self._tools

    def get_tool(self, name: str) -> Optional[Callable]:
        """获取工具函数。"""
        return self._tools.get(name)

    def get_schema(self, name: str) -> Optional[Dict[str, Any]]:
        """获取工具 Schema。"""
        return self._tool_schemas.get(name)

    def list_tools(self) -> List[Dict[str, Any]]:
        """列出所有工具。"""
        return [
            {
                "name": name,
                "schema": schema,
            }
            for name, schema in self._tool_schemas.items()
        ]

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    def call(self, name: str, **kwargs) -> Any:
        """调用工具。"""
        tool = self._tools.get(name)
        if not tool:
            raise ToolNotFoundError(f"Tool not found: {name}")
        
        logger.info("[ToolRegistry] Calling tool: %s with args: %s", name, kwargs)
        try:
            return tool(**kwargs)
        except Exception as e:
            logger.error("[ToolRegistry] Tool %s failed: %s", name, e)
            raise ToolExecutionError(f"Tool {name} execution failed: {e}") from e

    def call_safe(self, name: str, **kwargs) -> Tuple[bool, Any]:
        """安全调用工具，返回 (success, result_or_error)。"""
        try:
            return True, self.call(name, **kwargs)
        except Exception as e:
            return False, str(e)

    # ------------------------------------------------------------------
    # Builtin Tools
    # ------------------------------------------------------------------

    def _register_builtin_tools(self) -> None:
        """注册内置工具。"""
        # 内容搜索
        self.register(
            "content_search",
            self._tool_content_search,
            {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "limit": {"type": "integer", "default": 10},
                },
                "required": ["query"],
            },
        )

        # 内容读取
        self.register(
            "content_read",
            self._tool_content_read,
            {
                "type": "object",
                "properties": {
                    "unit_id": {"type": "string", "description": "ContentUnit ID"},
                },
                "required": ["unit_id"],
            },
        )

        # 内容列表
        self.register(
            "content_list",
            self._tool_content_list,
            {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "过滤状态"},
                    "limit": {"type": "integer", "default": 10},
                },
            },
        )

        # 文件读取
        self.register(
            "file_read",
            self._tool_file_read,
            {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "文件路径"},
                },
                "required": ["path"],
            },
        )

        # 文件列表
        self.register(
            "file_list",
            self._tool_file_list,
            {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "目录路径"},
                    "pattern": {"type": "string", "default": "*"},
                },
            },
        )

        # 视频元数据
        self.register(
            "video_metadata",
            self._tool_video_metadata,
            {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "视频文件路径"},
                },
                "required": ["path"],
            },
        )

        # Pipeline 列表
        self.register(
            "pipeline_list",
            self._tool_pipeline_list,
            {
                "type": "object",
                "properties": {},
            },
        )

        # Pipeline 执行
        self.register(
            "pipeline_run",
            self._tool_pipeline_run,
            {
                "type": "object",
                "properties": {
                    "pipeline_id": {"type": "string", "description": "Pipeline ID"},
                    "input_unit_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["pipeline_id"],
            },
        )

        # AI 生成
        self.register(
            "ai_generate",
            self._tool_ai_generate,
            {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "生成提示"},
                    "system": {"type": "string", "description": "系统提示"},
                    "model": {"type": "string", "description": "模型名称"},
                },
                "required": ["prompt"],
            },
        )

        # AI 摘要
        self.register(
            "ai_summarize",
            self._tool_ai_summarize,
            {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "要摘要的文本"},
                    "max_length": {"type": "integer", "default": 300},
                },
                "required": ["text"],
            },
        )

    # ------------------------------------------------------------------
    # Tool Implementations
    # ------------------------------------------------------------------

    def _tool_content_search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """搜索内容。"""
        units = self.content_access.search_content_units(query, limit=limit)
        return [u.to_dict() for u in units]

    def _tool_content_read(self, unit_id: str) -> Optional[Dict[str, Any]]:
        """读取内容。"""
        unit = self.content_access.get_content_unit(unit_id)
        return unit.to_dict() if unit else None

    def _tool_content_list(self, status: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """列出内容。"""
        units = self.content_access.list_content_units(status=status, limit=limit)
        return [u.to_dict() for u in units]

    def _tool_file_read(self, path: str) -> Dict[str, Any]:
        """读取文件。"""
        success, content = self.file_access.read_text_file(path)
        return {"success": success, "content": content if success else None, "error": None if success else content}

    def _tool_file_list(self, directory: Optional[str] = None, pattern: str = "*") -> List[Dict[str, Any]]:
        """列出文件。"""
        dir_path = directory or str(self.file_access.base_dir)
        return self.file_access.list_files(dir_path, pattern)

    def _tool_video_metadata(self, path: str) -> Dict[str, Any]:
        """获取视频元数据。"""
        return self.file_access.get_video_metadata(path)

    def _tool_pipeline_list(self) -> List[Dict[str, Any]]:
        """列出 PipelineRun。"""
        runs = self.content_access.list_pipeline_runs(limit=20)
        return [r.to_dict() for r in runs]

    def _tool_pipeline_run(self, pipeline_id: str, input_unit_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """执行 Pipeline（简化实现）。"""
        # 实际实现需要 PipelineEngine 实例
        return {"status": "not_implemented", "pipeline_id": pipeline_id, "input_unit_ids": input_unit_ids or []}

    def _tool_ai_generate(self, prompt: str, system: Optional[str] = None, model: Optional[str] = None) -> str:
        """调用 AI 生成。"""
        from contentforge.processing.ai_engine import AIEngine
        from contentforge.config import get_config

        config = get_config()
        ai_config = config.get_ai_provider()
        engine = AIEngine.from_config(ai_config.to_dict())
        return engine.generate(prompt, system=system)

    def _tool_ai_summarize(self, text: str, max_length: int = 300) -> str:
        """调用 AI 摘要。"""
        from contentforge.processing.ai_engine import AIEngine
        from contentforge.config import get_config

        config = get_config()
        ai_config = config.get_ai_provider()
        engine = AIEngine.from_config(ai_config.to_dict())
        return engine.summarize(text, max_length=max_length)


# ------------------------------------------------------------------------------
# SkillContext — 统一执行上下文
# ------------------------------------------------------------------------------


@dataclass
class SkillContext:
    """Skill 执行上下文 — 统一封装所有本地访问能力。

    使用示例：
        context = SkillContext()
        # 搜索内容
        units = context.content.search_content_units("AI")
        # 读取文件
        success, content = context.file.read_text_file("/path/to/file.md")
        # 调用工具
        result = context.tools.call("content_search", query="AI")
    """

    content: ContentAccess = field(default_factory=ContentAccess)
    file: FileAccess = field(default_factory=FileAccess)
    tools: ToolRegistry = field(default_factory=ToolRegistry)

    # 会话状态
    session_id: str = ""
    user_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    # 执行历史
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    messages: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """序列化上下文。"""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "metadata": self.metadata,
            "tool_calls_count": len(self.tool_calls),
            "messages_count": len(self.messages),
        }

    def add_message(self, role: str, content: str) -> None:
        """添加消息到上下文。"""
        self.messages.append({"role": role, "content": content})

    def add_tool_call(self, tool_name: str, args: Dict[str, Any], result: Any) -> None:
        """记录工具调用。"""
        self.tool_calls.append({
            "tool": tool_name,
            "args": args,
            "result": result,
            "timestamp": __import__("time").time(),
        })

    def get_conversation_history(self, limit: int = 10) -> List[Dict[str, str]]:
        """获取最近的对话历史。"""
        return self.messages[-limit:]


class ToolNotFoundError(Exception):
    """工具未找到错误。"""
    pass


class ToolExecutionError(Exception):
    """工具执行错误。"""
    pass
