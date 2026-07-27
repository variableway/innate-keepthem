"""Translator — 多语言翻译器

支持多语言翻译，使用 AI Engine 作为后端。
支持语言检测、批量翻译、术语保持等功能。

使用示例：
    translator = Translator(engine=AIEngine.from_config({}))
    result = translator.translate(unit, target_language="zh")
    result = translator.translate_text("Hello world", target_language="ja")
"""
import logging
from typing import Dict, List, Optional

from contentforge.models import ContentUnit, ContentStatus
from contentforge.processing.ai_engine import AIEngine, AIEngineError

logger = logging.getLogger(__name__)

# ─────────────────────────── 提示模板 ───────────────────────────

TRANSLATE_PROMPT_TEMPLATE = """Translate the following text into {target_language}. 

Requirements:
- Preserve the original tone, style, and formatting
- Maintain all technical terms accurately (or provide standard translations in parentheses)
- Keep paragraph structure intact
- Do not add explanations or meta-commentary
- If the source is already in {target_language}, return it unchanged

## Text to Translate
{text}

## Output
Provide only the translated text."""

TRANSLATE_WITH_CONTEXT_PROMPT = """Translate the following text into {target_language}, using the provided context to ensure accurate terminology.

Context: {context}

## Text to Translate
{text}

## Output
Provide only the translated text."""

TRANSLATE_SUMMARY_PROMPT = """Translate the following text into {target_language}. Produce a concise summary-style translation that captures the main points.

## Text to Translate
{text}

## Output
Provide the translated summary."""


# 语言代码映射
LANGUAGE_NAMES = {
    "zh": "Chinese (Simplified)",
    "zh-cn": "Chinese (Simplified)",
    "zh-tw": "Chinese (Traditional)",
    "zh-hk": "Chinese (Traditional)",
    "en": "English",
    "ja": "Japanese",
    "ko": "Korean",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ar": "Arabic",
    "hi": "Hindi",
    "th": "Thai",
    "vi": "Vietnamese",
    "id": "Indonesian",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "sv": "Swedish",
    "fi": "Finnish",
    "no": "Norwegian",
    "da": "Danish",
    "he": "Hebrew",
    "el": "Greek",
    "cs": "Czech",
    "hu": "Hungarian",
    "ro": "Romanian",
    "bg": "Bulgarian",
    "uk": "Ukrainian",
    "ms": "Malay",
    "tl": "Tagalog",
    "sw": "Swahili",
}


def get_language_name(code: str) -> str:
    """获取语言代码对应的完整名称。"""
    return LANGUAGE_NAMES.get(code.lower(), code)


class TranslationResult:
    """翻译结果对象。"""

    def __init__(
        self,
        text: str,
        source_language: str = "",
        target_language: str = "",
        char_count: int = 0,
    ):
        self.text = text
        self.source_language = source_language
        self.target_language = target_language
        self.char_count = char_count or len(text)

    def to_dict(self) -> Dict:
        return {
            "text": self.text,
            "source_language": self.source_language,
            "target_language": self.target_language,
            "char_count": self.char_count,
        }

    def __str__(self) -> str:
        return self.text[:200] + "..." if len(self.text) > 200 else self.text


class Translator:
    """多语言翻译器。

    支持：
    - 自动语言检测（基于 AI 或简单启发式）
    - 单条 / 批量翻译
    - 上下文感知翻译（保持术语一致性）
    - 摘要式翻译（长文本精简翻译）

    使用示例：
        translator = Translator(engine=AIEngine.from_config({}))
        result = translator.translate(unit, target_language="zh")
    """

    def __init__(self, engine: Optional[AIEngine] = None, config: Optional[Dict] = None):
        self.engine = engine
        self.config = config or {}
        if not self.engine and self.config.get("ai"):
            self.engine = AIEngine.from_config(self.config["ai"])
        self._translation_cache: Dict[str, str] = {}

    def translate(
        self,
        unit: ContentUnit,
        target_language: str = "zh",
        source_language: Optional[str] = None,
        mode: str = "full",  # full, summary, concise
        target_lang: str = "",  # alias for target_language (backward compatibility)
    ) -> TranslationResult:
        """翻译 ContentUnit。

        Args:
            target_language: 目标语言代码（zh, en, ja, ko, ...）
            source_language: 源语言（自动检测 if None）
            mode: full=完整翻译, summary=摘要翻译, concise=精简翻译
        """
        if target_lang:
            target_language = target_lang
        if not self.engine:
            raise TranslatorError("No AI engine configured for translation")
        
        text = unit.extracted_text or unit.description or unit.title
        if not text:
            raise TranslatorError("ContentUnit has no text to translate")
        
        # 检测源语言
        detected = source_language or self._detect_language(text)
        if detected == target_language:
            logger.info(f"[Translator] Source and target are both {target_language}, skipping")
            return TranslationResult(text=text, source_language=detected, target_language=target_language)
        
        # 检查缓存
        cache_key = f"{hash(text[:500])}:{target_language}:{mode}"
        if cache_key in self._translation_cache:
            logger.info("[Translator] Cache hit")
            return TranslationResult(
                text=self._translation_cache[cache_key],
                source_language=detected,
                target_language=target_language,
            )
        
        # 选择提示模板
        if mode == "summary":
            prompt = TRANSLATE_SUMMARY_PROMPT.format(
                text=text[:10000],
                target_language=get_language_name(target_language),
            )
        elif mode == "concise":
            prompt = TRANSLATE_PROMPT_TEMPLATE.format(
                text=text[:5000],  # 精简模式截短
                target_language=get_language_name(target_language),
            ) + "\n\nKeep the translation concise and focused on main points."
        else:
            # 分段处理长文本
            if len(text) > 12000:
                translated = self._translate_long_text(text, target_language)
            else:
                prompt = TRANSLATE_PROMPT_TEMPLATE.format(
                    text=text,
                    target_language=get_language_name(target_language),
                )
                translated = self.engine.generate(prompt, temperature=0.3, max_tokens=4000)
        
        result = TranslationResult(
            text=translated.strip(),
            source_language=detected,
            target_language=target_language,
        )
        
        # 更新缓存和 ContentUnit
        self._translation_cache[cache_key] = result.text
        unit.translated_text = result.text
        unit.status = ContentStatus.PROCESSED
        
        logger.info(f"[Translator] Translated {len(text)} -> {len(result.text)} chars ({detected} -> {target_language})")
        return result

    def translate_text(
        self,
        text: str,
        target_language: str = "zh",
        source_language: Optional[str] = None,
        mode: str = "full",
    ) -> TranslationResult:
        """翻译纯文本。"""
        from contentforge.models import SourceInfo
        unit = ContentUnit(
            id="temp",
            source=SourceInfo(platform="text", url=""),
            type=ContentUnit.__dataclass_fields__["type"].default,  # type: ignore
            extracted_text=text,
        )
        return self.translate(unit, target_language=target_language, source_language=source_language, mode=mode)

    def _translate_long_text(self, text: str, target_language: str) -> str:
        """分段翻译长文本。"""
        chunks = self._split_text(text, max_chunk_size=8000)
        translated_chunks = []
        
        for i, chunk in enumerate(chunks):
            logger.info(f"[Translator] Translating chunk {i+1}/{len(chunks)}")
            prompt = TRANSLATE_PROMPT_TEMPLATE.format(
                text=chunk,
                target_language=get_language_name(target_language),
            )
            try:
                result = self.engine.generate(prompt, temperature=0.3, max_tokens=4000)
                translated_chunks.append(result.strip())
            except AIEngineError as e:
                logger.error(f"[Translator] Chunk {i+1} failed: {e}")
                translated_chunks.append(f"[TRANSLATION ERROR: {e}]")
        
        return "\n\n".join(translated_chunks)

    def _split_text(self, text: str, max_chunk_size: int = 8000) -> List[str]:
        """将长文本按段落分割为 chunk。"""
        chunks = []
        current_chunk = []
        current_size = 0
        
        paragraphs = text.split("\n\n")
        for para in paragraphs:
            para_size = len(para)
            if current_size + para_size > max_chunk_size and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = [para]
                current_size = para_size
            else:
                current_chunk.append(para)
                current_size += para_size
        
        if current_chunk:
            chunks.append("\n\n".join(current_chunk))
        
        return chunks

    def _detect_language(self, text: str) -> str:
        """简单语言检测。"""
        import re
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        japanese_chars = len(re.findall(r'[\u3040-\u309f\u30a0-\u30ff]', text))
        korean_chars = len(re.findall(r'[\uac00-\ud7af]', text))
        total_chars = len(text.strip())
        
        if total_chars == 0:
            return "unknown"
        
        if chinese_chars / total_chars > 0.3:
            return "zh"
        if japanese_chars / total_chars > 0.2:
            return "ja"
        if korean_chars / total_chars > 0.2:
            return "ko"
        
        # 默认英文
        return "en"

    def batch_translate(
        self,
        units: List[ContentUnit],
        target_language: str = "zh",
        mode: str = "full",
    ) -> List[TranslationResult]:
        """批量翻译。"""
        results = []
        for i, unit in enumerate(units):
            try:
                result = self.translate(unit, target_language=target_language, mode=mode)
                results.append(result)
                logger.info(f"[Batch] {i+1}/{len(units)} translated OK")
            except Exception as e:
                logger.error(f"[Batch] {i+1}/{len(units)} failed: {e}")
                results.append(
                    TranslationResult(
                        text=f"[Translation Error: {e}]",
                        target_language=target_language,
                    )
                )
        return results

    def translate_with_context(
        self,
        text: str,
        target_language: str,
        context: str,
    ) -> TranslationResult:
        """使用上下文进行翻译（保持术语一致性）。"""
        if not self.engine:
            raise TranslatorError("No AI engine configured")
        
        prompt = TRANSLATE_WITH_CONTEXT_PROMPT.format(
            text=text[:8000],
            target_language=get_language_name(target_language),
            context=context[:2000],
        )
        
        translated = self.engine.generate(prompt, temperature=0.3, max_tokens=3000)
        return TranslationResult(
            text=translated.strip(),
            target_language=target_language,
        )

    def get_supported_languages(self) -> List[str]:
        """返回支持的语言代码列表。"""
        return list(LANGUAGE_NAMES.keys())


class TranslatorError(Exception):
    """翻译器错误。"""
    pass


# ─────────────────────────── 便捷函数 ───────────────────────────

def translate_text(text: str, target_language: str = "zh", **engine_kwargs) -> TranslationResult:
    """便捷函数：翻译文本。"""
    engine = AIEngine(**engine_kwargs) if engine_kwargs else None
    translator = Translator(engine=engine)
    return translator.translate_text(text, target_language=target_language)
