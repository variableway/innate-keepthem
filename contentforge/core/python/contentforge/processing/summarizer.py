"""Summarizer — 结构化摘要生成器

调用 AI Engine 生成结构化摘要，包含 What I Learned + Key Patterns 格式。
支持多种摘要风格：结构化、简洁、详细、要点列表。

使用示例：
    summarizer = Summarizer(engine=AIEngine.from_config({"provider": "openai"}))
    summary = summarizer.summarize(content_unit, style="structured")
"""
import json
import logging
from typing import Dict, List, Optional

from contentforge.models import ContentUnit, ContentStatus
from contentforge.processing.ai_engine import AIEngine, AIEngineError

logger = logging.getLogger(__name__)

# ─────────────────────────── 提示模板 ───────────────────────────

STRUCTURED_SUMMARY_PROMPT = """You are an expert knowledge curator. Analyze the following content and produce a structured summary.

## Input Content
{content}

## Output Format (Markdown)

### What I Learned
List 3-5 key insights or facts. Each insight should be:
- Specific and concrete (not vague)
- Actionable or thought-provoking
- In the same language as the input

### Key Patterns
Identify 2-4 recurring themes, frameworks, or mental models.

### One-Sentence Summary
A single powerful sentence capturing the core message.

### Confidence Assessment
Rate your confidence in this summary (High / Medium / Low) and explain why."""

CONCISE_SUMMARY_PROMPT = """Summarize the following content in under 150 words. Capture the main point and one key supporting detail.

{content}"""

DETAILED_SUMMARY_PROMPT = """Provide a comprehensive summary of the following content. Include:
- Main arguments and evidence
- Key statistics or data points
- Notable quotes or statements
- Implications or conclusions

Content:
{content}"""

BULLET_SUMMARY_PROMPT = """Extract the key points from the following content as a bulleted list. Limit to 7-10 items.

{content}"""

EXECUTIVE_SUMMARY_PROMPT = """Write an executive summary for busy decision-makers. 
- Length: 100-200 words
- Focus: actionable takeaways and business implications
- Tone: professional, direct

Content:
{content}"""


class SummaryResult:
    """摘要结果对象。"""

    def __init__(
        self,
        text: str,
        style: str,
        what_i_learned: List[str] = None,
        key_patterns: List[str] = None,
        one_sentence: str = "",
        confidence: str = "",
        word_count: int = 0,
    ):
        self.text = text
        self.style = style
        self.what_i_learned = what_i_learned or []
        self.key_patterns = key_patterns or []
        self.one_sentence = one_sentence
        self.confidence = confidence
        self.word_count = word_count or len(text.split())

    def to_dict(self) -> Dict:
        return {
            "text": self.text,
            "style": self.style,
            "what_i_learned": self.what_i_learned,
            "key_patterns": self.key_patterns,
            "one_sentence": self.one_sentence,
            "confidence": self.confidence,
            "word_count": self.word_count,
        }

    def __str__(self) -> str:
        return self.text


class Summarizer:
    """内容摘要器。

    支持风格：
    - structured: 结构化（What I Learned + Key Patterns）
    - concise: 简洁（<150 词）
    - detailed: 详细（全面分析）
    - bullets: 要点列表
    - executive: 执行摘要

    使用示例：
        summarizer = Summarizer()
        result = summarizer.summarize(unit, style="structured")
        print(result.what_i_learned)
    """

    STYLES = {
        "structured": STRUCTURED_SUMMARY_PROMPT,
        "concise": CONCISE_SUMMARY_PROMPT,
        "detailed": DETAILED_SUMMARY_PROMPT,
        "bullets": BULLET_SUMMARY_PROMPT,
        "executive": EXECUTIVE_SUMMARY_PROMPT,
    }

    def __init__(self, engine: Optional[AIEngine] = None, config: Optional[Dict] = None):
        self.engine = engine
        self.config = config or {}
        if not self.engine:
            self.engine = AIEngine.from_config(self.config.get("ai", {}))

    def summarize(
        self,
        unit: ContentUnit,
        style: str = "structured",
        max_input_length: int = 12000,
        max_length: int = 0,  # alias for max_input_length (backward compatibility)
    ) -> SummaryResult:
        """对 ContentUnit 生成摘要。"""
        if max_length > 0:
            max_input_length = max_length
        if style not in self.STYLES:
            raise ValueError(f"Unknown style '{style}'. Available: {list(self.STYLES.keys())}")
        
        content = unit.extracted_text or unit.description or unit.title
        if not content:
            raise SummarizerError("ContentUnit has no text to summarize")
        
        # 截断超长输入
        content = content[:max_input_length]
        
        prompt = self.STYLES[style].format(content=content)
        logger.info(f"[Summarizer] Generating {style} summary for {unit.id}")
        
        try:
            raw_text = self.engine.generate(prompt, temperature=0.5, max_tokens=2000)
        except AIEngineError as e:
            logger.error(f"[Summarizer] AI Engine failed: {e}")
            raise SummarizerError(f"AI generation failed: {e}") from e
        
        # 解析结构化字段
        result = self._parse_result(raw_text, style)
        
        # 更新 ContentUnit
        unit.summary = result.text
        unit.key_points = result.what_i_learned or result.key_patterns or []
        unit.status = ContentStatus.PROCESSED
        
        logger.info(f"[Summarizer] Summary generated: {result.word_count} words")
        return result

    def summarize_text(
        self,
        text: str,
        style: str = "structured",
        max_input_length: int = 12000,
        max_length: int = 0,  # alias for max_input_length (backward compatibility)
    ) -> SummaryResult:
        """对纯文本生成摘要。"""
        if max_length > 0:
            max_input_length = max_length
        # 创建临时 ContentUnit
        from contentforge.models import SourceInfo
        unit = ContentUnit(
            id="temp",
            source=SourceInfo(platform="text", url=""),
            type=ContentUnit.type,  # type: ignore
            extracted_text=text,
        )
        return self.summarize(unit, style=style, max_input_length=max_input_length)

    def _parse_result(self, raw_text: str, style: str) -> SummaryResult:
        """解析 AI 返回的文本，提取结构化字段。"""
        text = raw_text.strip()
        what_i_learned: List[str] = []
        key_patterns: List[str] = []
        one_sentence = ""
        confidence = ""
        
        if style == "structured":
            # 提取 What I Learned
            if "### What I Learned" in text:
                section = text.split("### What I Learned")[1].split("###")[0]
                what_i_learned = [line.strip().lstrip("- ").strip() for line in section.split("\n") if line.strip().startswith("-")]
            
            # 提取 Key Patterns
            if "### Key Patterns" in text:
                section = text.split("### Key Patterns")[1].split("###")[0]
                key_patterns = [line.strip().lstrip("- ").strip() for line in section.split("\n") if line.strip().startswith("-")]
            
            # 提取 One-Sentence Summary
            if "### One-Sentence Summary" in text:
                one_sentence = text.split("### One-Sentence Summary")[1].split("###")[0].strip()
            
            # 提取 Confidence
            if "### Confidence Assessment" in text:
                confidence = text.split("### Confidence Assessment")[1].strip()[:100]
        
        return SummaryResult(
            text=text,
            style=style,
            what_i_learned=what_i_learned,
            key_patterns=key_patterns,
            one_sentence=one_sentence,
            confidence=confidence,
            word_count=len(text.split()),
        )

    def batch_summarize(
        self,
        units: List[ContentUnit],
        style: str = "structured",
    ) -> List[SummaryResult]:
        """批量摘要。"""
        results = []
        for i, unit in enumerate(units):
            try:
                result = self.summarize(unit, style=style)
                results.append(result)
                logger.info(f"[Batch] {i+1}/{len(units)} summarized OK")
            except Exception as e:
                logger.error(f"[Batch] {i+1}/{len(units)} failed: {e}")
                results.append(
                    SummaryResult(
                        text=f"Error: {e}",
                        style=style,
                    )
                )
        return results


class SummarizerError(Exception):
    """摘要器错误。"""
    pass


# ─────────────────────────── 便捷函数 ───────────────────────────

def summarize_text(text: str, style: str = "structured", **engine_kwargs) -> SummaryResult:
    """便捷函数：对文本生成摘要。"""
    engine = AIEngine(**engine_kwargs)
    summarizer = Summarizer(engine=engine)
    return summarizer.summarize_text(text, style=style)
