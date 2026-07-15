"""Jina Reader 网页采集器

使用 Jina AI Reader API 获取任意网页的 Markdown 格式内容。
支持：单页获取、批量 URL、自定义 User-Agent、代理设置。
"""
import json
import logging
import os
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests

from contentforge.models import ContentType, ContentUnit, SourceInfo

logger = logging.getLogger(__name__)


class JinaWebScraper:
    """基于 Jina Reader API 的网页内容采集器

    Jina Reader 将任意网页转换为结构化的 Markdown 格式，
    自动提取标题、正文、图片和链接。

    参考: https://r.jina.ai/http://example.com
    """

    JINA_READER_BASE = "https://r.jina.ai/http://"
    JINA_READER_HTTPS = "https://r.jina.ai/https://"
    DEFAULT_TIMEOUT = 60
    DEFAULT_USER_AGENT = "ContentForge/1.0 (Web Scraper; https://github.com/yourname/contentforge)"

    def __init__(
        self,
        api_token: Optional[str] = None,
        timeout: int = DEFAULT_TIMEOUT,
        proxy: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """初始化网页采集器

        Args:
            api_token: Jina AI API Token（可选，用于提高速率限制）
            timeout: 请求超时时间（秒）
            proxy: HTTP/HTTPS 代理地址，如 http://127.0.0.1:8080
            user_agent: 自定义 User-Agent
        """
        self._token = api_token or os.environ.get("JINA_API_TOKEN")
        self._timeout = timeout
        self._proxy = proxy
        self._user_agent = user_agent or self.DEFAULT_USER_AGENT
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": self._user_agent,
            "Accept": "text/markdown, text/plain, */*",
        })
        if self._token:
            self._session.headers["Authorization"] = f"Bearer {self._token}"
        if proxy:
            self._session.proxies.update({
                "http": proxy,
                "https": proxy,
            })
        logger.info("JinaWebScraper initialized (timeout=%ds, proxy=%s)", timeout, proxy)

    def _build_url(self, target_url: str) -> str:
        """构建 Jina Reader API URL"""
        cleaned = target_url.strip()
        if cleaned.startswith("http://"):
            return f"{self.JINA_READER_BASE}{cleaned[7:]}"
        if cleaned.startswith("https://"):
            return f"{self.JINA_READER_HTTPS}{cleaned[8:]}"
        return f"{self.JINA_READER_HTTPS}{cleaned}"

    def fetch(self, url: str) -> ContentUnit:
        """获取单个网页内容

        Args:
            url: 目标网页 URL

        Returns:
            ContentUnit: 内容单元
        """
        jina_url = self._build_url(url)
        logger.info("[JinaReader] Fetching %s", url)

        try:
            resp = self._session.get(jina_url, timeout=self._timeout)
            resp.raise_for_status()
        except requests.exceptions.Timeout:
            logger.error("Jina Reader timeout: %s", url)
            return self._error_unit(url, f"Timeout after {self._timeout}s")
        except requests.exceptions.ConnectionError as e:
            logger.error("Jina Reader connection error: %s — %s", url, e)
            return self._error_unit(url, f"Connection error: {e}")
        except requests.exceptions.HTTPError as e:
            logger.error("Jina Reader HTTP error: %s — %s", url, e)
            return self._error_unit(url, f"HTTP error: {e}")

        text = resp.text.strip()
        if not text:
            logger.warning("Jina Reader returned empty content: %s", url)
            return self._error_unit(url, "Empty response from Jina Reader")

        title, body, metadata = self._parse_jina_response(text, url)

        return ContentUnit(
            id=str(__import__("uuid").uuid4()),
            source=SourceInfo(platform="web", url=url),
            type=ContentType.ARTICLE,
            title=title,
            extracted_text=body,
            raw_metadata=metadata,
        )

    def fetch_batch(self, urls: List[str]) -> List[ContentUnit]:
        """批量获取网页内容

        Args:
            urls: URL 列表

        Returns:
            List[ContentUnit]: 内容单元列表
        """
        results: List[ContentUnit] = []
        for url in urls:
            unit = self.fetch(url)
            results.append(unit)
        return results

    def _parse_jina_response(self, text: str, source_url: str) -> tuple:
        """解析 Jina Reader 返回的 Markdown 格式内容

        Returns:
            (title, body, metadata)
        """
        lines = text.splitlines()
        title = ""
        body_lines: List[str] = []
        metadata: Dict[str, Any] = {"source_url": source_url, "scraper": "jina_reader"}

        if lines and lines[0].startswith("Title: "):
            title = lines[0][7:].strip()
            body_lines = lines[2:]
        else:
            title = lines[0].strip() if lines else ""
            body_lines = lines[1:] if len(lines) > 1 else lines

        body = "\n".join(body_lines).strip()
        if body_lines and body_lines[-1].startswith("Source URL: "):
            metadata["source_url"] = body_lines[-1][12:].strip()
            body = "\n".join(body_lines[:-1]).strip()

        return title, body, metadata

    def fetch_with_metadata(self, url: str) -> Dict[str, Any]:
        """获取原始 Markdown 和元数据（非 ContentUnit 包装）"""
        unit = self.fetch(url)
        if unit.error:
            return {"error": unit.error, "url": url, "title": "", "body": ""}
        return {
            "title": unit.title,
            "body": unit.extracted_text,
            "url": unit.source.url,
            "metadata": unit.raw_metadata,
        }

    def _error_unit(self, url: str, error: str) -> ContentUnit:
        """构造错误状态 ContentUnit"""
        import uuid
        return ContentUnit(
            id=str(uuid.uuid4()),
            source=SourceInfo(platform="web", url=url),
            type=ContentType.ARTICLE,
            title="",
            extracted_text="",
            error=error,
        )

    def health_check(self) -> bool:
        """检测 Jina Reader 服务可用性"""
        try:
            resp = self._session.get(
                "https://r.jina.ai/http://example.com",
                timeout=10,
            )
            return resp.status_code < 500
        except Exception as e:
            logger.warning("Jina Reader health check failed: %s", e)
            return False


# 向后兼容别名
WebScraper = JinaWebScraper
