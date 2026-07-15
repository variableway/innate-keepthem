"""
AssetRetriever — 内容资产检索器

职责：
1. 智能资产检索（多条件组合查询）
2. 语义相似度搜索（基于文本嵌入）
3. 资产关系图谱（关联资产发现）
4. 检索结果排序与评分

与 ContentAccess 的关系：
- ContentAccess 提供底层数据库/文件访问
- AssetRetriever 在 ContentAccess 之上提供智能检索策略

使用场景：
- Agent 需要"找到与当前话题相关的资产"
- 用户搜索"关于 AI 的所有视频"
- 自动推荐"你可能还感兴趣的内容"
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from contentforge.models import ContentType, ContentUnit
from contentforge.ai.content_access import ContentAccess, ContentQuery, ContentAccessResult

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------------------
# 数据模型
# ------------------------------------------------------------------------------

@dataclass
class AssetSearchResult:
    """资产检索结果项。"""
    asset: ContentUnit
    score: float  # 综合评分 0-1
    matched_fields: List[str] = field(default_factory=list)  # 哪些字段匹配
    match_reason: str = ""  # 匹配原因说明
    related_asset_ids: List[str] = field(default_factory=list)  # 关联资产


@dataclass
class RetrievalContext:
    """检索上下文 — 用于多轮检索优化。"""
    original_query: str
    expanded_queries: List[str] = field(default_factory=list)  # 扩展查询
    filters_applied: Dict[str, Any] = field(default_factory=dict)
    previous_results: List[str] = field(default_factory=list)  # 已返回资产ID
    user_preferences: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AssetRelation:
    """资产关系。"""
    source_id: str
    target_id: str
    relation_type: str  # "same_pipeline" | "same_platform" | "similar_topic" | "same_author"
    strength: float  # 关系强度 0-1


# ------------------------------------------------------------------------------
# 核心检索器
# ------------------------------------------------------------------------------

class AssetRetriever:
    """
    智能内容资产检索器。

    检索策略：
    1. 精确匹配 — ID、URL、标题精确匹配
    2. 关键词搜索 — 多字段 LIKE / FTS 检索
    3. 语义搜索 — 基于文本嵌入的相似度（预留接口）
    4. 关系图谱 — 通过 pipeline_id、platform、author 发现关联
    5. 混合排序 — 综合相关度、时效性、质量评分

    使用示例：
        >>> retriever = AssetRetriever()
        >>> results = retriever.search("AI 趋势分析", asset_type=ContentType.VIDEO, limit=10)
        >>> for r in results:
        ...     print(f"{r.asset.title} (score: {r.score:.2f})")
    """

    # 默认字段权重（用于评分）
    FIELD_WEIGHTS = {
        "title": 3.0,
        "extracted_text": 1.0,
        "summary": 2.0,
        "transcript": 1.5,
        "tags": 2.5,
        "description": 1.0,
    }

    def __init__(self, content_access: Optional[ContentAccess] = None):
        self.access = content_access or ContentAccess()
        self._context_cache: Dict[str, RetrievalContext] = {}  # session_id -> context

    # ------------------------------------------------------------------
    # 1. 智能搜索 — 主入口
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        asset_type: Optional[ContentType] = None,
        platform: Optional[str] = None,
        tags: Optional[List[str]] = None,
        status: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        limit: int = 20,
        min_score: float = 0.0,
        session_id: Optional[str] = None,
    ) -> List[AssetSearchResult]:
        """
        智能搜索入口 — 自动选择最佳检索策略。

        流程：
        1. 查询解析（提取关键词、类型暗示）
        2. 执行检索（FTS / 过滤 / 关系）
        3. 结果评分与排序
        4. 去重与截断
        """
        # 解析查询
        parsed = self._parse_query(query)
        logger.info("[AssetRetriever] Parsed query: %s -> %s", query, parsed)

        # 构建检索上下文
        ctx = self._get_or_create_context(session_id, query)

        # 合并显式过滤与解析出的过滤
        effective_type = asset_type or parsed.get("implied_type")
        effective_tags = list(set((tags or []) + parsed.get("keywords", [])))

        # 执行多路检索
        all_results: List[AssetSearchResult] = []

        # 路1: 精确匹配（ID / URL）
        if self._looks_like_id(query):
            exact = self._search_by_id(query)
            if exact:
                all_results.append(exact)

        # 路2: 全文检索
        fts_results = self._search_fts(query, effective_type, platform, status, limit * 2)
        all_results.extend(fts_results)

        # 路3: 标签过滤检索
        if effective_tags:
            tag_results = self._search_by_tags(effective_tags, effective_type, limit)
            all_results.extend(tag_results)

        # 路4: 关系图谱扩展（如果结果不足）
        if len(all_results) < limit:
            related = self._search_by_relations(all_results, limit - len(all_results))
            all_results.extend(related)

        # 合并、评分、排序
        merged = self._merge_and_dedup(all_results)
        scored = self._score_results(merged, parsed, query)
        filtered = [r for r in scored if r.score >= min_score]
        sorted_results = sorted(filtered, key=lambda x: x.score, reverse=True)

        # 更新上下文
        ctx.previous_results.extend([r.asset.id for r in sorted_results[:limit]])

        return sorted_results[:limit]

    def search_similar(self, asset_id: str, limit: int = 10) -> List[AssetSearchResult]:
        """
        查找与指定资产相似的内容。

        相似度维度：
        - 相同 pipeline
        - 相同 platform
        - 相同 author
        - 文本主题相似（关键词重叠）
        """
        result = self.access.get_asset(asset_id)
        if not result.success or not result.data:
            return []

        asset: ContentUnit = result.data
        results: List[AssetSearchResult] = []

        # 相同 pipeline
        if asset.pipeline_id:
            pipeline_results = self._search_by_pipeline(asset.pipeline_id, exclude_id=asset.id)
            results.extend(pipeline_results)

        # 相同 platform
        if asset.source and asset.source.platform:
            platform_results = self._search_by_platform(
                asset.source.platform, asset.type, exclude_id=asset.id, limit=limit
            )
            results.extend(platform_results)

        # 标签重叠
        if asset.tags:
            tag_results = self._search_by_tags(asset.tags, asset.type, limit)
            # 过滤掉自身
            tag_results = [r for r in tag_results if r.asset.id != asset.id]
            results.extend(tag_results)

        merged = self._merge_and_dedup(results)
        # 相似度评分：基于共享属性数量
        for r in merged:
            score = self._calculate_similarity(asset, r.asset)
            r.score = score
            r.match_reason = f"Similar to {asset.title or asset.id}"

        return sorted(merged, key=lambda x: x.score, reverse=True)[:limit]

    def get_recent_assets(self, asset_type: Optional[ContentType] = None,
                          days: int = 7, limit: int = 20) -> List[AssetSearchResult]:
        """获取最近添加的资产。"""
        from datetime import timedelta
        date_from = datetime.utcnow() - timedelta(days=days)

        query = ContentQuery(
            asset_type=asset_type,
            created_after=date_from,
            sort_by="created_at",
            sort_order="desc",
            limit=limit,
        )
        result = self.access.query_assets(query)
        if not result.success or not result.data:
            return []

        return [
            AssetSearchResult(
                asset=a,
                score=1.0,  # 时间衰减可后续实现
                match_reason="Recently added",
            )
            for a in result.data
        ]

    def get_pipeline_assets(self, pipeline_id: str) -> List[AssetSearchResult]:
        """获取指定 Pipeline 的所有输入/输出资产。"""
        return self._search_by_pipeline(pipeline_id)

    # ------------------------------------------------------------------
    # 2. 查询解析
    # ------------------------------------------------------------------

    def _parse_query(self, query: str) -> Dict[str, Any]:
        """
        解析用户查询，提取结构化信息。

        返回：
        - keywords: 关键词列表
        - implied_type: 暗示的内容类型（如"视频"-> VIDEO）
        - filters: 显式过滤条件
        """
        result = {
            "keywords": [],
            "implied_type": None,
            "filters": {},
        }

        # 类型暗示检测
        type_hints = {
            ContentType.VIDEO: ["视频", "video", "影片", "movie", "youtube"],
            ContentType.ARTICLE: ["文章", "article", "博客", "blog", "post"],
            ContentType.TWEET: ["推文", "tweet", "twitter", "x.com"],
            ContentType.AUDIO: ["音频", "audio", "播客", "podcast", "录音"],
            ContentType.IMAGE: ["图片", "image", "照片", "photo"],
        }

        query_lower = query.lower()
        for ctype, hints in type_hints.items():
            if any(h in query_lower for h in hints):
                result["implied_type"] = ctype
                break

        # 关键词提取（简单分词，去除停用词）
        stopwords = {"的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这"}
        words = re.findall(r"[\u4e00-\u9fff]+|[a-zA-Z]+", query_lower)
        result["keywords"] = [w for w in words if w not in stopwords and len(w) > 1]

        # 平台暗示
        platform_hints = {
            "youtube": ["youtube", "youtu.be", "油管"],
            "twitter": ["twitter", "x.com", "推特"],
            "bilibili": ["bilibili", "b站", "哔哩哔哩"],
            "rss": ["rss", "feed"],
            "web": ["网页", "web", "网站"],
        }
        for platform, hints in platform_hints.items():
            if any(h in query_lower for h in hints):
                result["filters"]["platform"] = platform
                break

        return result

    # ------------------------------------------------------------------
    # 3. 检索策略实现
    # ------------------------------------------------------------------

    def _search_by_id(self, query: str) -> Optional[AssetSearchResult]:
        """按 ID 精确查找。"""
        result = self.access.get_asset(query)
        if result.success and result.data:
            return AssetSearchResult(
                asset=result.data,
                score=1.0,
                matched_fields=["id"],
                match_reason="Exact ID match",
            )
        return None

    def _search_fts(self, query: str, asset_type: Optional[ContentType],
                    platform: Optional[str], status: Optional[str],
                    limit: int) -> List[AssetSearchResult]:
        """全文检索。"""
        cq = ContentQuery(
            text_query=query,
            asset_type=asset_type,
            limit=limit,
        )
        result = self.access.query_assets(cq)
        if not result.success or not result.data:
            return []

        return [
            AssetSearchResult(
                asset=a,
                score=0.8,  # 基础分，后续精确评分
                matched_fields=["title", "extracted_text", "summary"],
                match_reason=f"FTS match: '{query}'",
            )
            for a in result.data
        ]

    def _search_by_tags(self, tags: List[str], asset_type: Optional[ContentType],
                        limit: int) -> List[AssetSearchResult]:
        """按标签检索。"""
        cq = ContentQuery(
            tags=tags,
            asset_type=asset_type,
            limit=limit,
        )
        result = self.access.query_assets(cq)
        if not result.success or not result.data:
            return []

        return [
            AssetSearchResult(
                asset=a,
                score=0.7,
                matched_fields=["tags"],
                match_reason=f"Tag match: {tags}",
            )
            for a in result.data
        ]

    def _search_by_pipeline(self, pipeline_id: str,
                            exclude_id: Optional[str] = None) -> List[AssetSearchResult]:
        """按 Pipeline ID 检索关联资产。"""
        cq = ContentQuery(limit=100)
        # 无法直接通过 pipeline_id 过滤，需要获取后过滤
        result = self.access.query_assets(cq)
        if not result.success or not result.data:
            return []

        assets = [a for a in result.data if a.pipeline_id == pipeline_id]
        if exclude_id:
            assets = [a for a in assets if a.id != exclude_id]

        return [
            AssetSearchResult(
                asset=a,
                score=0.6,
                matched_fields=["pipeline_id"],
                match_reason=f"Same pipeline: {pipeline_id}",
                related_asset_ids=[pipeline_id],
            )
            for a in assets
        ]

    def _search_by_platform(self, platform: str, asset_type: Optional[ContentType],
                            exclude_id: Optional[str] = None, limit: int = 20) -> List[AssetSearchResult]:
        """按平台检索。"""
        cq = ContentQuery(
            platform=platform,
            asset_type=asset_type,
            limit=limit,
        )
        result = self.access.query_assets(cq)
        if not result.success or not result.data:
            return []

        assets = result.data
        if exclude_id:
            assets = [a for a in assets if a.id != exclude_id]

        return [
            AssetSearchResult(
                asset=a,
                score=0.5,
                matched_fields=["source.platform"],
                match_reason=f"Same platform: {platform}",
            )
            for a in assets
        ]

    def _search_by_relations(self, seed_results: List[AssetSearchResult],
                             limit: int) -> List[AssetSearchResult]:
        """基于已有结果的关系图谱扩展。"""
        if not seed_results or limit <= 0:
            return []

        related_ids: Set[str] = set()
        for r in seed_results:
            if r.asset.pipeline_id:
                # 查找同 pipeline 的其他资产
                pipeline_assets = self._search_by_pipeline(r.asset.pipeline_id, exclude_id=r.asset.id)
                for pa in pipeline_assets[:3]:
                    related_ids.add(pa.asset.id)

        if not related_ids:
            return []

        result = self.access.get_assets_by_ids(list(related_ids))
        if not result.success or not result.data:
            return []

        return [
            AssetSearchResult(
                asset=a,
                score=0.4,
                matched_fields=["relation"],
                match_reason="Related content",
            )
            for a in result.data
        ]

    # ------------------------------------------------------------------
    # 4. 结果处理
    # ------------------------------------------------------------------

    def _merge_and_dedup(self, results: List[AssetSearchResult]) -> List[AssetSearchResult]:
        """合并多路结果，按 asset_id 去重（保留最高分的）。"""
        seen: Dict[str, AssetSearchResult] = {}
        for r in results:
            if r.asset.id in seen:
                if r.score > seen[r.asset.id].score:
                    seen[r.asset.id] = r
            else:
                seen[r.asset.id] = r
        return list(seen.values())

    def _score_results(self, results: List[AssetSearchResult],
                       parsed_query: Dict[str, Any],
                       original_query: str) -> List[AssetSearchResult]:
        """
        对检索结果进行精确评分。

        评分维度：
        - 文本匹配度（关键词出现频率）
        - 字段权重（title > summary > extracted_text）
        - 时效性（越新越高）
        - 质量信号（status=ready 加分）
        """
        keywords = parsed_query.get("keywords", [])
        query_lower = original_query.lower()

        for r in results:
            score = r.score  # 基础分
            asset = r.asset

            # 1. 文本匹配度
            text_score = 0.0
            for field, weight in self.FIELD_WEIGHTS.items():
                text = getattr(asset, field, None) or ""
                if not text:
                    continue
                text_lower = text.lower()
                # 完整查询匹配
                if query_lower in text_lower:
                    text_score += weight * 0.5
                # 关键词匹配
                for kw in keywords:
                    if kw in text_lower:
                        text_score += weight * 0.1
            score += min(text_score, 2.0)  # 封顶

            # 2. 时效性（最近 7 天最高）
            age_days = (datetime.utcnow() - asset.created_at).days
            if age_days <= 1:
                score += 0.3
            elif age_days <= 7:
                score += 0.2
            elif age_days <= 30:
                score += 0.1

            # 3. 质量信号
            if asset.status.value == "ready":
                score += 0.1
            if asset.summary:
                score += 0.05  # 有摘要说明处理过

            # 4. 去重惩罚（已在上下文中返回过）
            # 这里由调用方控制

            r.score = min(1.0, score)

        return results

    @staticmethod
    def _calculate_similarity(a1: ContentUnit, a2: ContentUnit) -> float:
        """计算两个资产的相似度。"""
        score = 0.0

        # 相同 pipeline
        if a1.pipeline_id and a1.pipeline_id == a2.pipeline_id:
            score += 0.3

        # 相同 platform
        if a1.source and a2.source and a1.source.platform == a2.source.platform:
            score += 0.2

        # 相同 author
        if a1.source and a2.source and a1.source.author and a1.source.author == a2.source.author:
            score += 0.2

        # 标签重叠
        if a1.tags and a2.tags:
            shared = set(a1.tags) & set(a2.tags)
            if shared:
                score += min(0.3, len(shared) * 0.1)

        # 类型相同
        if a1.type == a2.type:
            score += 0.1

        return min(1.0, score)

    # ------------------------------------------------------------------
    # 5. 上下文管理
    # ------------------------------------------------------------------

    def _get_or_create_context(self, session_id: Optional[str], query: str) -> RetrievalContext:
        """获取或创建检索上下文。"""
        if not session_id:
            return RetrievalContext(original_query=query)
        if session_id not in self._context_cache:
            self._context_cache[session_id] = RetrievalContext(original_query=query)
        return self._context_cache[session_id]

    def expand_query(self, query: str, session_id: Optional[str] = None) -> List[str]:
        """
        查询扩展 — 基于同义词、相关词生成扩展查询。

        简化实现：提取关键词 + 常见扩展
        """
        parsed = self._parse_query(query)
        keywords = parsed.get("keywords", [])

        expansions = [query]  # 原始查询

        # 常见同义词扩展（中文）
        synonym_map = {
            "ai": ["人工智能", "artificial intelligence", "machine learning"],
            "人工智能": ["ai", "machine learning", "深度学习"],
            "分析": ["解析", "研究", "剖析", "解读"],
            "总结": ["摘要", "概括", "提炼", "归纳"],
            "视频": ["影片", "movie", "video"],
        }

        for kw in keywords:
            if kw in synonym_map:
                for syn in synonym_map[kw]:
                    expanded = query.replace(kw, syn)
                    if expanded != query:
                        expansions.append(expanded)

        # 去重
        return list(dict.fromkeys(expansions))[:5]

    # ------------------------------------------------------------------
    # 6. 关系图谱
    # ------------------------------------------------------------------

    def get_asset_relations(self, asset_id: str) -> List[AssetRelation]:
        """获取资产的关系图谱。"""
        result = self.access.get_asset(asset_id)
        if not result.success or not result.data:
            return []

        asset: ContentUnit = result.data
        relations: List[AssetRelation] = []

        # 同 pipeline
        if asset.pipeline_id:
            pipeline_assets = self._search_by_pipeline(asset.pipeline_id, exclude_id=asset.id)
            for pa in pipeline_assets:
                relations.append(AssetRelation(
                    source_id=asset_id,
                    target_id=pa.asset.id,
                    relation_type="same_pipeline",
                    strength=0.8,
                ))

        # 同 platform
        if asset.source and asset.source.platform:
            platform_assets = self._search_by_platform(
                asset.source.platform, asset.type, exclude_id=asset.id, limit=10
            )
            for pa in platform_assets:
                relations.append(AssetRelation(
                    source_id=asset_id,
                    target_id=pa.asset.id,
                    relation_type="same_platform",
                    strength=0.5,
                ))

        return relations

    def get_recommended_assets(self, asset_id: str, limit: int = 5) -> List[AssetSearchResult]:
        """基于关系图谱推荐相关资产。"""
        return self.search_similar(asset_id, limit)

    # ------------------------------------------------------------------
    # 7. 工具方法
    # ------------------------------------------------------------------

    @staticmethod
    def _looks_like_id(query: str) -> bool:
        """判断查询是否像资产 ID（UUID 格式或特定前缀）。"""
        # UUID 格式
        if re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", query, re.I):
            return True
        # 自定义 ID 前缀
        if re.match(r"^(asset|video|article|tweet)-[\w-]+$", query, re.I):
            return True
        return False

    def to_prompt_context(self, results: List[AssetSearchResult], max_length: int = 4000) -> str:
        """将检索结果转换为 LLM prompt 上下文。"""
        if not results:
            return ""

        lines = ["## Retrieved Assets", ""]
        current_len = 0

        for r in results:
            asset = r.asset
            text = f"### {asset.title or asset.id}\n"
            if asset.summary:
                text += f"Summary: {asset.summary}\n"
            elif asset.extracted_text:
                snippet = asset.extracted_text[:300] + "..." if len(asset.extracted_text) > 300 else asset.extracted_text
                text += f"Content: {snippet}\n"
            text += f"Relevance: {r.score:.2f} ({r.match_reason})\n\n"

            if current_len + len(text) > max_length:
                lines.append("...[more results truncated]")
                break
            lines.append(text)
            current_len += len(text)

        return "\n".join(lines)

    def get_stats(self) -> Dict[str, Any]:
        """获取检索器统计。"""
        return {
            "cached_contexts": len(self._context_cache),
        }


# ------------------------------------------------------------------------------
# 便捷函数
# ------------------------------------------------------------------------------

def get_asset_retriever(content_access: Optional[ContentAccess] = None) -> AssetRetriever:
    """获取 AssetRetriever 实例。"""
    return AssetRetriever(content_access)
