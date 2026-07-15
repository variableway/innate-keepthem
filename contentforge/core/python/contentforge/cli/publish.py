"""Publish handler — 处理来自 Go CLI 的发布/导出请求"""

import json
import logging
from typing import Any, Dict

from contentforge.models import ContentUnit

logger = logging.getLogger(__name__)


def handle_publish(payload: Dict[str, Any]) -> Dict[str, Any]:
    """处理 publish 请求"""
    action = payload.get("action", "publish")
    input_data = payload.get("input_data", "")
    fmt = payload.get("format", "markdown")
    pretty = payload.get("pretty", False)
    template_path = payload.get("template", "")

    try:
        if isinstance(input_data, str):
            if input_data.strip().startswith("{"):
                unit = ContentUnit.from_dict(json.loads(input_data))
            else:
                return {"success": False, "error": "Invalid input: expected JSON ContentUnit"}
        elif isinstance(input_data, dict):
            unit = ContentUnit.from_dict(input_data)
        else:
            return {"success": False, "error": f"Invalid input type: {type(input_data)}"}

        if fmt == "markdown":
            output = _to_markdown(unit)
        elif fmt == "json":
            output = unit.to_dict()
        elif fmt == "text":
            output = _to_text(unit)
        elif fmt == "html":
            output = _to_html(unit)
        else:
            return {"success": False, "error": f"Unsupported format: {fmt}"}

        return {"success": True, "data": output}
    except Exception as exc:
        logger.exception("Publish error: %s", exc)
        return {"success": False, "error": str(exc)}


def _to_markdown(unit: ContentUnit) -> str:
    lines = [f"# {unit.title or 'Untitled'}", ""]
    if unit.source and unit.source.url:
        lines.append(f"**Source:** [{unit.source.platform}]({unit.source.url})")
    if unit.summary:
        lines.extend(["", "## Summary", unit.summary])
    if unit.key_points:
        lines.extend(["", "## Key Points"])
        for point in unit.key_points:
            lines.append(f"- {point}")
    if unit.translated_text:
        lines.extend(["", "## Translated", unit.translated_text])
    if unit.rewritten_text:
        lines.extend(["", "## Rewritten", unit.rewritten_text])
    if unit.extracted_text:
        lines.extend(["", "## Content", unit.extracted_text])
    if unit.topics:
        lines.extend(["", "## Topics", ", ".join(unit.topics)])
    if unit.sentiment:
        lines.extend(["", f"**Sentiment:** {unit.sentiment}"])
    if unit.tags:
        lines.extend(["", "## Tags", " ".join(f"#{t.lstrip('#')}" for t in unit.tags)])
    return "\n".join(lines)


def _to_text(unit: ContentUnit) -> str:
    parts = [unit.title or "Untitled", "", unit.extracted_text]
    if unit.summary:
        parts.extend(["", "Summary:", unit.summary])
    return "\n".join(parts)


def _to_html(unit: ContentUnit) -> str:
    md = _to_markdown(unit)
    # Simple markdown to HTML conversion
    import re
    html = re.sub(r"^# (.+)$", r"<h1>\1</h1>", md, flags=re.MULTILINE)
    html = re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    html = re.sub(r"^\- (.+)$", r"<li>\1</li>", html, flags=re.MULTILINE)
    html = f"<html><body>{html.replace(chr(10), '<br>')}</body></html>"
    return html
