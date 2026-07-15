"""Scrape handler — 处理来自 Go CLI 的采集请求"""

import json
import logging
from typing import Any, Dict

from contentforge.ingestion.agent_reach import AgentReachCollector, AgentReachError
from contentforge.ingestion.web_scraper import WebScraper, WebScraperError
from contentforge.models import ContentUnit

logger = logging.getLogger(__name__)


def handle_scrape(payload: Dict[str, Any]) -> Dict[str, Any]:
    """处理 scrape 请求"""
    action = payload.get("action")
    url = payload.get("url")
    source_type = payload.get("type", "auto")
    engine = payload.get("engine", "agent-reach")

    if not url:
        return {"success": False, "error": "Missing 'url' in payload"}

    try:
        if source_type == "webpage" or engine == "jina":
            scraper = WebScraper()
            unit = scraper.scrape(url)
        elif source_type in ("twitter", "youtube", "rss"):
            collector = AgentReachCollector()
            if source_type == "rss":
                units = collector.collect_rss(url)
                return {"success": True, "data": [u.to_dict() for u in units]}
            unit = collector.collect(source_type, url)
        else:
            # auto-detect
            if "youtube.com" in url or "youtu.be" in url:
                collector = AgentReachCollector()
                unit = collector.collect_youtube(url)
            elif "twitter.com" in url or "x.com" in url:
                collector = AgentReachCollector()
                unit = collector.collect_twitter(url)
            else:
                scraper = WebScraper()
                unit = scraper.scrape(url)

        return {"success": True, "data": unit.to_dict()}
    except (AgentReachError, WebScraperError) as exc:
        logger.error("Scrape error: %s", exc)
        return {"success": False, "error": str(exc)}
    except Exception as exc:
        logger.exception("Unexpected scrape error: %s", exc)
        return {"success": False, "error": str(exc)}
