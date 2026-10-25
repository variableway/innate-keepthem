"""Agent-Reach CLI 采集器封装

支持 Twitter / 网页 / YouTube / RSS 内容获取，返回 ContentUnit。
"""
import json
import logging
import re
import subprocess
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from contentforge.models import ContentType, ContentUnit, SourceInfo

logger = logging.getLogger(__name__)


class AgentReachIngestor:
    """封装 agent-reach CLI 的通用采集器。"""

    def __init__(self, agent_reach_path: str = "agent-reach"):
        self.agent_reach_path = agent_reach_path
        self._check_binary()

    def _check_binary(self) -> None:
        """检查 agent-reach 二进制是否可用。"""
        try:
            subprocess.run(
                [self.agent_reach_path, "--version"],
                capture_output=True,
                check=True,
                timeout=10,
            )
            logger.info("agent-reach CLI ready: %s", self.agent_reach_path)
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            logger.warning("agent-reach CLI not found or not executable: %s", exc)

    def _run(
        self,
        subcommand: str,
        args: List[str],
        timeout: int = 120,
    ) -> Dict:
        """调用 agent-reach 子命令并解析 JSON 输出。"""
        cmd = [self.agent_reach_path, subcommand, "--json"] + args
        logger.debug("Running: %s", " ".join(cmd))
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
            if proc.returncode != 0:
                logger.error("agent-reach stderr: %s", proc.stderr)
                raise RuntimeError(
                    f"agent-reach {subcommand} failed (rc={proc.returncode}): {proc.stderr}"
                )
            # 尝试解析最后有效的 JSON 行（agent-reach 可能输出日志+JSON）
            lines = [line for line in proc.stdout.strip().splitlines() if line.strip()]
            data = None
            for line in reversed(lines):
                try:
                    data = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue
            if data is None:
                raise RuntimeError(f"No valid JSON in agent-reach output: {proc.stdout}")
            return data
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"agent-reach {subcommand} timed out after {timeout}s")

    def fetch_twitter(self, url: str) -> ContentUnit:
        """从 Twitter/X URL 获取推文或线程。"""
        logger.info("Fetching Twitter content: %s", url)
        data = self._run("fetch", ["--platform", "twitter", url])
        text = data.get("text", "")
        is_thread = bool(data.get("is_thread", False))
        return ContentUnit(
            id=str(uuid.uuid4()),
            source=SourceInfo(
                platform="twitter",
                url=url,
                author=data.get("author"),
                published_at=datetime.fromisoformat(data["published_at"]) if data.get("published_at") else None,
                engagement={
                    "likes": data.get("likes", 0),
                    "replies": data.get("replies", 0),
                    "reposts": data.get("reposts", 0),
                },
            ),
            type=ContentType.THREAD if is_thread else ContentType.TWEET,
            title=text[:80] + ("..." if len(text) > 80 else ""),
            description=text,
            extracted_text=text,
            raw_metadata=data,
        )

    def fetch_web(self, url: str) -> ContentUnit:
        """从任意网页获取内容。"""
        logger.info("Fetching web content: %s", url)
        data = self._run("fetch", ["--platform", "web", url])
        text = data.get("text", "")
        return ContentUnit(
            id=str(uuid.uuid4()),
            source=SourceInfo(
                platform="web",
                url=url,
                author=data.get("author"),
                published_at=datetime.fromisoformat(data["published_at"]) if data.get("published_at") else None,
            ),
            type=ContentType.ARTICLE,
            title=data.get("title", ""),
            description=data.get("description", ""),
            extracted_text=text,
            raw_metadata=data,
        )

    def fetch_youtube(self, url: str) -> ContentUnit:
        """从 YouTube URL 获取视频元数据和字幕。"""
        logger.info("Fetching YouTube metadata: %s", url)
        data = self._run("fetch", ["--platform", "youtube", url])
        return ContentUnit(
            id=str(uuid.uuid4()),
            source=SourceInfo(
                platform="youtube",
                url=url,
                author=data.get("channel"),
                published_at=datetime.fromisoformat(data["published_at"]) if data.get("published_at") else None,
                engagement={"views": data.get("view_count", 0)},
            ),
            type=ContentType.VIDEO,
            title=data.get("title", ""),
            description=data.get("description", ""),
            extracted_text=data.get("transcript", ""),
            raw_metadata=data,
        )

    def fetch_rss(self, feed_url: str, limit: int = 10) -> List[ContentUnit]:
        """从 RSS Feed 获取文章列表。"""
        logger.info("Fetching RSS feed: %s (limit=%d)", feed_url, limit)
        data = self._run("fetch", ["--platform", "rss", "--limit", str(limit), feed_url])
        items = data.get("items", [])
        units: List[ContentUnit] = []
        for item in items:
            text = item.get("content", item.get("description", ""))
            units.append(
                ContentUnit(
                    id=str(uuid.uuid4()),
                    source=SourceInfo(
                        platform="rss",
                        url=item.get("link", feed_url),
                        author=item.get("author"),
                        published_at=datetime.fromisoformat(item["published_at"]) if item.get("published_at") else None,
                    ),
                    type=ContentType.ARTICLE,
                    title=item.get("title", ""),
                    description=text[:200] + ("..." if len(text) > 200 else ""),
                    extracted_text=text,
                    raw_metadata=item,
                )
            )
        return units

    def fetch(self, url: str) -> ContentUnit:
        """自动检测 URL 类型并分派到对应采集器。"""
        url_lower = url.lower()
        if "twitter.com" in url_lower or "x.com" in url_lower:
            return self.fetch_twitter(url)
        if "youtube.com" in url_lower or "youtu.be" in url_lower:
            return self.fetch_youtube(url)
        if re.search(r"\.rss$|feed\.xml$|/rss/|/feed/", url_lower):
            return self.fetch_rss(url)[0]
        return self.fetch_web(url)
