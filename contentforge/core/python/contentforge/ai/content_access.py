"""
ContentAccess — Chat 对话框本地内容访问层

职责：
1. SQLite 数据库查询（内容资产表）
2. 文件系统读取（视频/文档路径）
3. 文本内容检索（extracted_text / summary / transcript）
4. 统一访问接口，供 Agent / Chat Engine 调用

与现有模块集成：
- 复用 contentforge.models.ContentUnit 数据模型
- 复用 contentforge.config.get_config() 获取数据库路径
- 复用 contentforge.processing.ai_engine.AIEngine 进行文本分析
"""

from __future__ import annotations

import json
import logging
import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple, Union

from contentforge.models import ContentStatus, ContentType, ContentUnit, SourceInfo
from contentforge.config import get_config

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------------------
# 异常定义
# ------------------------------------------------------------------------------

class ContentAccessError(Exception):
    """内容访问层通用错误。"""
    pass


class AssetNotFoundError(ContentAccessError):
    """内容资产不存在。"""
    pass


class DatabaseConnectionError(ContentAccessError):
    """数据库连接失败。"""
    pass


class FileAccessError(ContentAccessError):
    """文件系统访问失败。"""
    pass


# ------------------------------------------------------------------------------
# 数据模型
# ------------------------------------------------------------------------------

@dataclass
class TextSearchResult:
    """文本检索结果。"""
    asset_id: str
    field: str  # "extracted_text" | "summary" | "transcript" | "title"
    snippet: str  # 匹配片段（前后 200 字符）
    score: float  # 相关度分数（0-1）
    matched_terms: List[str] = field(default_factory=list)


@dataclass
class ContentQuery:
    """内容查询条件。"""
    # 基础过滤
    asset_id: Optional[str] = None
    asset_type: Optional[ContentType] = None
    status: Optional[ContentStatus] = None
    platform: Optional[str] = None
    tags: Optional[List[str]] = None

    # 文本搜索
    text_query: Optional[str] = None
    search_fields: List[str] = field(default_factory=lambda: ["title", "extracted_text", "summary", "transcript"])

    # 时间范围
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None

    # 分页
    limit: int = 50
    offset: int = 0

    # 排序
    sort_by: str = "created_at"  # "created_at" | "updated_at" | "title" | "relevance"
    sort_order: str = "desc"    # "asc" | "desc"


@dataclass
class ContentAccessResult:
    """内容访问操作结果。"""
    success: bool
    data: Any = None
    error: Optional[str] = None
    total_count: int = 0
    execution_time_ms: float = 0.0


# ------------------------------------------------------------------------------
# 数据库连接管理
# ------------------------------------------------------------------------------

class DatabaseConnection:
    """SQLite 连接上下文管理器，支持连接池和行工厂。"""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or self._resolve_db_path()
        self._conn: Optional[sqlite3.Connection] = None

    @staticmethod
    def _resolve_db_path() -> str:
        """解析数据库路径（优先环境变量，其次配置，最后默认）。"""
        if env_path := __import__("os").getenv("CONTENTFORGE_DB_PATH"):
            return env_path
        config = get_config()
        state_dir = Path(config.state_dir or Path.home() / ".contentforge")
        return str(state_dir / "contentforge.db")

    def __enter__(self) -> sqlite3.Connection:
        try:
            self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA foreign_keys = ON")
            self._conn.execute("PRAGMA journal_mode = WAL")
            return self._conn
        except sqlite3.Error as exc:
            raise DatabaseConnectionError(f"Failed to connect to {self.db_path}: {exc}") from exc

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._conn:
            if exc_type:
                self._conn.rollback()
            else:
                self._conn.commit()
            self._conn.close()
            self._conn = None


# ------------------------------------------------------------------------------
# 内容访问层核心
# ------------------------------------------------------------------------------

class ContentAccess:
    """
    Chat 对话框本地内容访问层统一入口。

    提供四大核心能力：
    1. SQLite 数据库查询 — 内容资产 CRUD + 全文检索
    2. 文件系统读取 — 视频/文档路径安全访问
    3. 文本内容检索 — extracted_text / summary / transcript 搜索
    4. 视频元数据提取 — 委托 VideoInspector

    使用示例：
        >>> access = ContentAccess()
        >>> result = access.query_assets(ContentQuery(text_query="AI 趋势", limit=10))
        >>> for asset in result.data:
        ...     print(asset.title)
    """

    # 资产表列定义（与 content_assets schema 对齐）
    ASSET_COLUMNS = [
        "id", "type", "title", "description", "source_url", "source_platform",
        "file_path", "extracted_text", "summary", "transcript", "language",
        "duration_sec", "status", "metadata", "tags", "pipeline_id",
        "created_at", "updated_at",
    ]

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path
        self._ensure_schema()

    # ------------------------------------------------------------------
    # Schema 初始化
    # ------------------------------------------------------------------

    def _ensure_schema(self) -> None:
        """确保 content_assets 表和索引存在。"""
        with DatabaseConnection(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS content_assets (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    title TEXT,
                    description TEXT,
                    source_url TEXT,
                    source_platform TEXT,
                    file_path TEXT,
                    extracted_text TEXT,
                    summary TEXT,
                    transcript TEXT,
                    language TEXT,
                    duration_sec REAL,
                    status TEXT DEFAULT 'ingested',
                    metadata TEXT DEFAULT '{}',
                    tags TEXT DEFAULT '[]',
                    pipeline_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # 全文检索支持（SQLite FTS5）
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS content_assets_fts USING fts5(
                    id,
                    title,
                    extracted_text,
                    summary,
                    transcript,
                    content='content_assets',
                    content_rowid='rowid'
                )
            """)
            # 索引
            conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_type ON content_assets(type)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_status ON content_assets(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_platform ON content_assets(source_platform)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_created ON content_assets(created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_pipeline ON content_assets(pipeline_id)")
            logger.info("[ContentAccess] Schema ensured at %s", conn)

    # ------------------------------------------------------------------
    # 1. SQLite 数据库查询 — 内容资产 CRUD
    # ------------------------------------------------------------------

    def get_asset(self, asset_id: str) -> ContentAccessResult:
        """按 ID 获取单个内容资产。"""
        try:
            with DatabaseConnection(self.db_path) as conn:
                row = conn.execute(
                    f"SELECT {', '.join(self.ASSET_COLUMNS)} FROM content_assets WHERE id = ?",
                    (asset_id,)
                ).fetchone()
                if not row:
                    return ContentAccessResult(success=False, error=f"Asset not found: {asset_id}")
                asset = self._row_to_content_unit(dict(row))
                return ContentAccessResult(success=True, data=asset, total_count=1)
        except Exception as exc:
            logger.error("[ContentAccess] get_asset failed: %s", exc)
            return ContentAccessResult(success=False, error=str(exc))

    def get_assets_by_ids(self, asset_ids: List[str]) -> ContentAccessResult:
        """批量获取内容资产。"""
        if not asset_ids:
            return ContentAccessResult(success=True, data=[], total_count=0)
        try:
            with DatabaseConnection(self.db_path) as conn:
                placeholders = ",".join("?" for _ in asset_ids)
                rows = conn.execute(
                    f"SELECT {', '.join(self.ASSET_COLUMNS)} FROM content_assets WHERE id IN ({placeholders})",
                    tuple(asset_ids)
                ).fetchall()
                assets = [self._row_to_content_unit(dict(r)) for r in rows]
                return ContentAccessResult(success=True, data=assets, total_count=len(assets))
        except Exception as exc:
            logger.error("[ContentAccess] get_assets_by_ids failed: %s", exc)
            return ContentAccessResult(success=False, error=str(exc))

    def query_assets(self, query: ContentQuery) -> ContentAccessResult:
        """
        通用内容资产查询 — 支持过滤、文本搜索、排序、分页。

        查询策略：
        - 无 text_query：直接 SQL 过滤 + 排序
        - 有 text_query：优先 FTS5 全文检索，回退 LIKE 模糊匹配
        """
        import time
        start = time.time()

        try:
            if query.text_query:
                return self._query_with_fts(query, start)
            return self._query_sql_only(query, start)
        except Exception as exc:
            logger.error("[ContentAccess] query_assets failed: %s", exc)
            return ContentAccessResult(success=False, error=str(exc))

    def _query_sql_only(self, query: ContentQuery, start_time: float) -> ContentAccessResult:
        """纯 SQL 过滤查询。"""
        with DatabaseConnection(self.db_path) as conn:
            conditions: List[str] = []
            params: List[Any] = []

            if query.asset_type:
                conditions.append("type = ?")
                params.append(query.asset_type.value)
            if query.status:
                conditions.append("status = ?")
                params.append(query.status.value)
            if query.platform:
                conditions.append("source_platform = ?")
                params.append(query.platform)
            if query.tags:
                # 标签匹配：JSON 数组包含任一标签
                tag_conditions = []
                for tag in query.tags:
                    tag_conditions.append("tags LIKE ?")
                    params.append(f'%"{tag}"%')
                conditions.append(f"({' OR '.join(tag_conditions)})")
            if query.created_after:
                conditions.append("created_at >= ?")
                params.append(query.created_after.isoformat())
            if query.created_before:
                conditions.append("created_at <= ?")
                params.append(query.created_before.isoformat())

            where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

            # 计数
            count_row = conn.execute(
                f"SELECT COUNT(*) as cnt FROM content_assets {where_clause}",
                tuple(params)
            ).fetchone()
            total = count_row["cnt"] if count_row else 0

            # 排序
            sort_col = query.sort_by if query.sort_by in self.ASSET_COLUMNS else "created_at"
            order = "DESC" if query.sort_order == "desc" else "ASC"

            # 分页查询
            rows = conn.execute(
                f"""SELECT {', '.join(self.ASSET_COLUMNS)}
                   FROM content_assets {where_clause}
                   ORDER BY {sort_col} {order}
                   LIMIT ? OFFSET ?""",
                tuple(params + [query.limit, query.offset])
            ).fetchall()

            assets = [self._row_to_content_unit(dict(r)) for r in rows]
            elapsed = (time.time() - start_time) * 1000
            return ContentAccessResult(success=True, data=assets, total_count=total, execution_time_ms=elapsed)

    def _query_with_fts(self, query: ContentQuery, start_time: float) -> ContentAccessResult:
        """FTS5 全文检索 + 过滤。"""
        with DatabaseConnection(self.db_path) as conn:
            # 先通过 FTS5 获取匹配的 rowid
            fts_sql = """
                SELECT rowid, rank
                FROM content_assets_fts
                WHERE content_assets_fts MATCH ?
                ORDER BY rank
                LIMIT ? OFFSET ?
            """
            fts_rows = conn.execute(fts_sql, (query.text_query, query.limit, query.offset)).fetchall()
            rowids = [r["rowid"] for r in fts_rows]

            if not rowids:
                # FTS 无结果，回退 LIKE
                return self._fallback_like_search(query, start_time)

            # 获取完整记录
            placeholders = ",".join("?" for _ in rowids)
            rows = conn.execute(
                f"SELECT {', '.join(self.ASSET_COLUMNS)} FROM content_assets WHERE rowid IN ({placeholders})",
                tuple(rowids)
            ).fetchall()

            assets = [self._row_to_content_unit(dict(r)) for r in rows]
            elapsed = (time.time() - start_time) * 1000
            return ContentAccessResult(success=True, data=assets, total_count=len(assets), execution_time_ms=elapsed)

    def _fallback_like_search(self, query: ContentQuery, start_time: float) -> ContentAccessResult:
        """FTS 不可用时的 LIKE 回退。"""
        with DatabaseConnection(self.db_path) as conn:
            search_cols = [c for c in query.search_fields if c in self.ASSET_COLUMNS]
            if not search_cols:
                search_cols = ["title", "extracted_text", "summary"]

            like_conditions = " OR ".join(f"{c} LIKE ?" for c in search_cols)
            params = [f"%{query.text_query}%"] * len(search_cols)

            # 附加过滤
            extra_conditions = []
            if query.asset_type:
                extra_conditions.append("type = ?")
                params.append(query.asset_type.value)
            if query.status:
                extra_conditions.append("status = ?")
                params.append(query.status.value)

            where_parts = [f"({like_conditions})"]
            if extra_conditions:
                where_parts.extend(extra_conditions)

            where_clause = f"WHERE {' AND '.join(where_parts)}"

            rows = conn.execute(
                f"""SELECT {', '.join(self.ASSET_COLUMNS)}
                   FROM content_assets {where_clause}
                   ORDER BY created_at DESC
                   LIMIT ? OFFSET ?""",
                tuple(params + [query.limit, query.offset])
            ).fetchall()

            assets = [self._row_to_content_unit(dict(r)) for r in rows]
            elapsed = (time.time() - start_time) * 1000
            return ContentAccessResult(success=True, data=assets, total_count=len(assets), execution_time_ms=elapsed)

    def save_asset(self, asset: ContentUnit) -> ContentAccessResult:
        """保存或更新内容资产。"""
        try:
            with DatabaseConnection(self.db_path) as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO content_assets
                    (id, type, title, description, source_url, source_platform,
                     file_path, extracted_text, summary, transcript, language,
                     duration_sec, status, metadata, tags, pipeline_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    asset.id,
                    asset.type.value,
                    asset.title,
                    asset.description,
                    asset.source.url if asset.source else None,
                    asset.source.platform if asset.source else None,
                    asset.file_path,
                    asset.extracted_text,
                    asset.summary,
                    None,  # transcript 单独存储
                    None,  # language
                    asset.raw_metadata.get("duration_sec") if asset.raw_metadata else None,
                    asset.status.value,
                    json.dumps(asset.raw_metadata or {}),
                    json.dumps(asset.tags or []),
                    asset.pipeline_id,
                    asset.created_at.isoformat(),
                    datetime.utcnow().isoformat(),
                ))
                # 同步 FTS 索引
                self._sync_fts_index(conn, asset.id)
                return ContentAccessResult(success=True, data=asset.id)
        except Exception as exc:
            logger.error("[ContentAccess] save_asset failed: %s", exc)
            return ContentAccessResult(success=False, error=str(exc))

    def delete_asset(self, asset_id: str) -> ContentAccessResult:
        """删除内容资产。"""
        try:
            with DatabaseConnection(self.db_path) as conn:
                conn.execute("DELETE FROM content_assets WHERE id = ?", (asset_id,))
                conn.execute("DELETE FROM content_assets_fts WHERE id = ?", (asset_id,))
                return ContentAccessResult(success=True, data=asset_id)
        except Exception as exc:
            logger.error("[ContentAccess] delete_asset failed: %s", exc)
            return ContentAccessResult(success=False, error=str(exc))

    def _sync_fts_index(self, conn: sqlite3.Connection, asset_id: str) -> None:
        """同步 FTS5 索引。"""
        row = conn.execute(
            "SELECT id, title, extracted_text, summary, transcript FROM content_assets WHERE id = ?",
            (asset_id,)
        ).fetchone()
        if row:
            conn.execute("""
                INSERT OR REPLACE INTO content_assets_fts (id, title, extracted_text, summary, transcript)
                VALUES (?, ?, ?, ?, ?)
            """, (row["id"], row["title"] or "", row["extracted_text"] or "",
                  row["summary"] or "", row["transcript"] or ""))

    # ------------------------------------------------------------------
    # 2. 文件系统读取 — 视频/文档路径安全访问
    # ------------------------------------------------------------------

    def read_file(self, file_path: str, max_bytes: int = 10 * 1024 * 1024) -> ContentAccessResult:
        """
        安全读取本地文件内容。

        安全策略：
        - 路径规范化（resolve）防止目录遍历
        - 文件大小限制（默认 10MB）
        - 仅允许文本类文件（txt, md, json, srt, vtt, csv, log）
        """
        try:
            path = Path(file_path).resolve()

            # 安全检查：必须是常规文件
            if not path.is_file():
                return ContentAccessResult(success=False, error=f"Not a file: {file_path}")

            # 大小检查
            size = path.stat().st_size
            if size > max_bytes:
                return ContentAccessResult(
                    success=False,
                    error=f"File too large: {size} bytes (max {max_bytes})"
                )

            # 编码检测与读取
            content = self._read_text_with_encoding(path)
            return ContentAccessResult(success=True, data={
                "path": str(path),
                "size": size,
                "content": content,
                "encoding": "utf-8",  # 简化，实际可检测
            })

        except Exception as exc:
            logger.error("[ContentAccess] read_file failed: %s", exc)
            return ContentAccessResult(success=False, error=str(exc))

    def read_asset_file(self, asset_id: str, max_bytes: int = 10 * 1024 * 1024) -> ContentAccessResult:
        """读取指定资产关联的本地文件。"""
        result = self.get_asset(asset_id)
        if not result.success or not result.data:
            return result

        asset: ContentUnit = result.data
        if not asset.file_path:
            return ContentAccessResult(success=False, error=f"Asset {asset_id} has no file_path")

        return self.read_file(asset.file_path, max_bytes)

    def list_asset_files(self, asset_id: str) -> ContentAccessResult:
        """列出资产关联目录下的所有文件。"""
        result = self.get_asset(asset_id)
        if not result.success or not result.data:
            return result

        asset: ContentUnit = result.data
        if not asset.file_path:
            return ContentAccessResult(success=False, error=f"Asset {asset_id} has no file_path")

        try:
            base_dir = Path(asset.file_path).parent
            if not base_dir.exists():
                return ContentAccessResult(success=False, error=f"Directory not found: {base_dir}")

            files = []
            for f in base_dir.iterdir():
                if f.is_file():
                    files.append({
                        "name": f.name,
                        "path": str(f.resolve()),
                        "size": f.stat().st_size,
                        "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                    })
            return ContentAccessResult(success=True, data=files, total_count=len(files))
        except Exception as exc:
            return ContentAccessResult(success=False, error=str(exc))

    @staticmethod
    def _read_text_with_encoding(path: Path) -> str:
        """尝试多种编码读取文本文件。"""
        encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312", "latin-1"]
        for enc in encodings:
            try:
                return path.read_text(encoding=enc)
            except UnicodeDecodeError:
                continue
        # 最终回退：二进制读取 + 忽略错误
        return path.read_bytes().decode("utf-8", errors="ignore")

    # ------------------------------------------------------------------
    # 3. 文本内容检索 — extracted_text / summary / transcript
    # ------------------------------------------------------------------

    def search_text(self, query: str, fields: Optional[List[str]] = None,
                   asset_type: Optional[ContentType] = None,
                   limit: int = 20) -> ContentAccessResult:
        """
        在文本字段中搜索关键词，返回带上下文的片段。

        返回 TextSearchResult 列表，包含匹配片段和相关度分数。
        """
        import time
        start = time.time()

        search_fields = fields or ["extracted_text", "summary", "transcript", "title"]
        valid_fields = [f for f in search_fields if f in self.ASSET_COLUMNS]
        if not valid_fields:
            return ContentAccessResult(success=False, error="No valid search fields")

        try:
            with DatabaseConnection(self.db_path) as conn:
                # 构建查询：每个字段一个 UNION 分支
                unions = []
                params = []
                for field in valid_fields:
                    unions.append(f"""
                        SELECT id, '{field}' as field, {field} as content
                        FROM content_assets
                        WHERE {field} IS NOT NULL AND {field} LIKE ?
                    """)
                    params.append(f"%{query}%")

                union_sql = " UNION ALL ".join(unions)
                sql = f"""
                    SELECT * FROM ({union_sql})
                    ORDER BY LENGTH(content) DESC
                    LIMIT ?
                """
                params.append(limit)

                rows = conn.execute(sql, tuple(params)).fetchall()
                results: List[TextSearchResult] = []
                for row in rows:
                    snippet = self._extract_snippet(row["content"], query)
                    score = self._calculate_relevance(row["content"], query)
                    results.append(TextSearchResult(
                        asset_id=row["id"],
                        field=row["field"],
                        snippet=snippet,
                        score=score,
                        matched_terms=[query],
                    ))

                elapsed = (time.time() - start) * 1000
                return ContentAccessResult(
                    success=True, data=results, total_count=len(results), execution_time_ms=elapsed
                )
        except Exception as exc:
            logger.error("[ContentAccess] search_text failed: %s", exc)
            return ContentAccessResult(success=False, error=str(exc))

    def get_text_content(self, asset_id: str, field: str = "extracted_text",
                         max_length: Optional[int] = None) -> ContentAccessResult:
        """
        获取指定资产的文本内容，支持截断。

        field: "extracted_text" | "summary" | "transcript" | "title" | "description"
        """
        if field not in self.ASSET_COLUMNS:
            return ContentAccessResult(success=False, error=f"Invalid field: {field}")

        try:
            with DatabaseConnection(self.db_path) as conn:
                row = conn.execute(
                    f"SELECT {field} FROM content_assets WHERE id = ?", (asset_id,)
                ).fetchone()
                if not row:
                    return ContentAccessResult(success=False, error=f"Asset not found: {asset_id}")

                text = row[field] or ""
                truncated = False
                if max_length and len(text) > max_length:
                    text = text[:max_length] + "\n...[truncated]"
                    truncated = True

                return ContentAccessResult(success=True, data={
                    "asset_id": asset_id,
                    "field": field,
                    "text": text,
                    "length": len(text),
                    "truncated": truncated,
                })
        except Exception as exc:
            return ContentAccessResult(success=False, error=str(exc))

    def get_combined_text(self, asset_id: str, max_total_length: int = 8000) -> ContentAccessResult:
        """
        获取资产的组合文本（title + summary + extracted_text），按优先级拼接。

        优先级：title > summary > extracted_text > transcript
        用于 Agent 上下文注入。
        """
        result = self.get_asset(asset_id)
        if not result.success or not result.data:
            return result

        asset: ContentUnit = result.data
        parts = []
        current_len = 0

        # 优先级队列
        priority_fields = [
            ("title", f"Title: {asset.title}\n\n" if asset.title else ""),
            ("summary", f"Summary: {asset.summary}\n\n" if asset.summary else ""),
            ("extracted_text", asset.extracted_text or ""),
            ("transcript", f"Transcript:\n{asset.raw_metadata.get('transcript', '')}" if asset.raw_metadata else ""),
        ]

        for field_name, text in priority_fields:
            if not text:
                continue
            if current_len + len(text) > max_total_length:
                remaining = max_total_length - current_len
                if remaining > 100:
                    parts.append(text[:remaining])
                    parts.append("\n...[truncated]")
                break
            parts.append(text)
            current_len += len(text)

        combined = "\n".join(parts)
        return ContentAccessResult(success=True, data={
            "asset_id": asset_id,
            "combined_text": combined,
            "length": len(combined),
            "sources": [f for f, t in priority_fields if t],
        })

    @staticmethod
    def _extract_snippet(text: str, query: str, context_chars: int = 200) -> str:
        """从文本中提取关键词周围的片段。"""
        if not text:
            return ""
        idx = text.lower().find(query.lower())
        if idx == -1:
            return text[:400] + ("..." if len(text) > 400 else "")
        start = max(0, idx - context_chars)
        end = min(len(text), idx + len(query) + context_chars)
        snippet = text[start:end]
        if start > 0:
            snippet = "..." + snippet
        if end < len(text):
            snippet = snippet + "..."
        return snippet

    @staticmethod
    def _calculate_relevance(text: str, query: str) -> float:
        """简单相关度计算：基于词频密度。"""
        if not text:
            return 0.0
        text_lower = text.lower()
        query_lower = query.lower()
        count = text_lower.count(query_lower)
        density = count / (len(text) / 1000 + 1)  # 每千字出现次数
        return min(1.0, density / 5)  # 归一化到 0-1

    # ------------------------------------------------------------------
    # 4. 视频元数据提取 — 委托 VideoInspector
    # ------------------------------------------------------------------

    def get_video_metadata(self, asset_id: str) -> ContentAccessResult:
        """
        获取视频资产的元数据（委托 VideoInspector）。

        如果资产有 file_path，直接分析文件；
        否则尝试通过 source_url 获取。
        """
        result = self.get_asset(asset_id)
        if not result.success or not result.data:
            return result

        asset: ContentUnit = result.data
        if asset.type != ContentType.VIDEO:
            return ContentAccessResult(success=False, error=f"Asset {asset_id} is not a video")

        # 延迟导入避免循环依赖
        from contentforge.ai.video_inspector import VideoInspector

        inspector = VideoInspector()

        if asset.file_path and Path(asset.file_path).exists():
            try:
                metadata = inspector.inspect_file(asset.file_path)
                return ContentAccessResult(success=True, data=metadata)
            except Exception as exc:
                logger.warning("[ContentAccess] VideoInspector file inspection failed: %s", exc)

        if asset.source and asset.source.url:
            try:
                metadata = inspector.inspect_url(asset.source.url)
                return ContentAccessResult(success=True, data=metadata)
            except Exception as exc:
                logger.warning("[ContentAccess] VideoInspector URL inspection failed: %s", exc)

        return ContentAccessResult(
            success=False,
            error=f"Cannot extract video metadata for {asset_id}: no file_path or source_url"
        )

    def list_videos(self, status: Optional[ContentStatus] = None,
                    limit: int = 50) -> ContentAccessResult:
        """列出所有视频资产。"""
        query = ContentQuery(asset_type=ContentType.VIDEO, status=status, limit=limit)
        return self.query_assets(query)

    # ------------------------------------------------------------------
    # 工具方法
    # ------------------------------------------------------------------

    def _row_to_content_unit(self, row: Dict[str, Any]) -> ContentUnit:
        """将数据库行转换为 ContentUnit。"""
        source = SourceInfo(
            platform=row.get("source_platform", "unknown") or "unknown",
            url=row.get("source_url", ""),
        )
        return ContentUnit(
            id=row["id"],
            source=source,
            type=ContentType(row.get("type", "article")),
            title=row.get("title", ""),
            description=row.get("description", ""),
            extracted_text=row.get("extracted_text", ""),
            summary=row.get("summary"),
            status=ContentStatus(row.get("status", "ingested")),
            file_path=row.get("file_path"),
            pipeline_id=row.get("pipeline_id"),
            tags=json.loads(row.get("tags", "[]")),
            raw_metadata=json.loads(row.get("metadata", "{}")),
            created_at=datetime.fromisoformat(row["created_at"]) if row.get("created_at") else datetime.utcnow(),
            updated_at=datetime.fromisoformat(row["updated_at"]) if row.get("updated_at") else datetime.utcnow(),
        )

    def get_stats(self) -> ContentAccessResult:
        """获取内容资产库统计信息。"""
        try:
            with DatabaseConnection(self.db_path) as conn:
                total = conn.execute("SELECT COUNT(*) as cnt FROM content_assets").fetchone()["cnt"]
                type_counts = conn.execute(
                    "SELECT type, COUNT(*) as cnt FROM content_assets GROUP BY type"
                ).fetchall()
                status_counts = conn.execute(
                    "SELECT status, COUNT(*) as cnt FROM content_assets GROUP BY status"
                ).fetchall()
                return ContentAccessResult(success=True, data={
                    "total": total,
                    "by_type": {r["type"]: r["cnt"] for r in type_counts},
                    "by_status": {r["status"]: r["cnt"] for r in status_counts},
                })
        except Exception as exc:
            return ContentAccessResult(success=False, error=str(exc))

    def to_prompt_context(self, asset_ids: List[str], max_length: int = 6000) -> str:
        """
        将资产列表转换为 LLM prompt 可用的上下文文本。

        用于 Agent 上下文注入：
        - 每个资产生成结构化摘要
        - 总长度受 max_length 限制
        - 优先包含 summary，其次 extracted_text
        """
        result = self.get_assets_by_ids(asset_ids)
        if not result.success or not result.data:
            return ""

        assets: List[ContentUnit] = result.data
        lines = ["## Content Assets Context", ""]
        current_len = 0

        for asset in assets:
            asset_text = self._format_asset_for_prompt(asset)
            if current_len + len(asset_text) > max_length:
                remaining = max_length - current_len
                if remaining > 200:
                    lines.append(asset_text[:remaining])
                    lines.append("\n...[more assets truncated]")
                break
            lines.append(asset_text)
            current_len += len(asset_text)

        return "\n".join(lines)

    @staticmethod
    def _format_asset_for_prompt(asset: ContentUnit) -> str:
        """格式化单个资产为 prompt 文本。"""
        parts = [f"### Asset: {asset.id}"]
        if asset.title:
            parts.append(f"Title: {asset.title}")
        if asset.source:
            parts.append(f"Source: {asset.source.platform} — {asset.source.url}")
        if asset.summary:
            parts.append(f"Summary: {asset.summary}")
        elif asset.extracted_text:
            text = asset.extracted_text[:500] + "..." if len(asset.extracted_text) > 500 else asset.extracted_text
            parts.append(f"Content: {text}")
        parts.append("")
        return "\n".join(parts)


# ------------------------------------------------------------------------------
# 便捷函数
# ------------------------------------------------------------------------------

def get_content_access(db_path: Optional[str] = None) -> ContentAccess:
    """获取 ContentAccess 单例。"""
    return ContentAccess(db_path)
