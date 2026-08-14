"""Analyzer — 内容分析器

提供主题提取、关键词提取、情感分析和内容质量评估。
支持基于 AI 的深度分析和基于规则的高速分析两种模式。

使用示例：
    analyzer = Analyzer(engine=AIEngine.from_config({}))
    result = analyzer.analyze(content_unit)
    print(result.topics)
    print(result.sentiment)
"""
import json
import logging
import re
from collections import Counter
from typing import Dict, List, Optional, Set

from contentforge.models import ContentUnit, ContentType, SourceInfo
from contentforge.processing.ai_engine import AIEngine, AIEngineError

logger = logging.getLogger(__name__)

# ─────────────────────────── 提示模板 ───────────────────────────

DEEP_ANALYZE_PROMPT = """Analyze the following content comprehensively.

## Content
{text}

## Analysis Requirements

1. **Topics**: Identify 3-5 main topics or themes. Use concise labels (1-3 words each).
2. **Keywords**: Extract 10-15 important keywords, ranked by relevance.
3. **Entities**: Identify named entities (people, organizations, products, technologies, locations).
4. **Sentiment**: 
   - Overall label: positive / neutral / negative
   - Confidence: 0-1 score
   - Explanation: Why this sentiment?
5. **Audience**: Who is the target audience? (e.g., "developers", "general consumers", "students")
6. **Content Quality**: Rate from 1-10 with brief justification.

## Output Format
Return a JSON object with exactly these keys:
{{
  "topics": ["topic1", "topic2", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "entities": ["entity1", "entity2", ...],
  "sentiment": {
    "label": "positive|neutral|negative",
    "confidence": 0.85,
    "explanation": "..."
  },
  "audience": "description",
  "quality_score": 8,
  "quality_notes": "..."
}}"""


class AnalysisResult:
    """内容分析结果。"""

    def __init__(
        self,
        topics: List[str] = None,
        keywords: List[str] = None,
        entities: List[str] = None,
        sentiment_label: str = "unknown",
        sentiment_confidence: float = 0.0,
        sentiment_explanation: str = "",
        audience: str = "",
        quality_score: int = 0,
        quality_notes: str = "",
        raw: Dict = None,
    ):
        self.topics = topics or []
        self.keywords = keywords or []
        self.entities = entities or []
        self.sentiment_label = sentiment_label
        self.sentiment_confidence = sentiment_confidence
        self.sentiment_explanation = sentiment_explanation
        self.audience = audience
        self.quality_score = quality_score
        self.quality_notes = quality_notes
        self.raw = raw or {}

    def to_dict(self) -> Dict:
        return {
            "topics": self.topics,
            "keywords": self.keywords,
            "entities": self.entities,
            "sentiment": {
                "label": self.sentiment_label,
                "confidence": self.sentiment_confidence,
                "explanation": self.sentiment_explanation,
            },
            "audience": self.audience,
            "quality_score": self.quality_score,
            "quality_notes": self.quality_notes,
        }

    def __str__(self) -> str:
        return f"Analysis({self.sentiment_label}, topics={len(self.topics)}, keywords={len(self.keywords)})"


class Analyzer:
    """内容分析器。

    提供两种模式：
    - AI 模式：调用 LLM 进行深度分析（更准确，需要 API）
    - 快速模式：基于规则的关键词和情感分析（无需 API，适合批量）

    使用示例：
        analyzer = Analyzer()
        # AI 深度分析
        result = analyzer.analyze(unit)
        # 快速分析
        result = analyzer.analyze_quick(unit.extracted_text)
    """

    # 情感词典（简单规则）
    POSITIVE_WORDS = {
        "good", "great", "excellent", "amazing", "awesome", "best", "love", "like",
        "happy", "wonderful", "fantastic", "perfect", "beautiful", "successful",
        "推荐", "好用", "棒", "优秀", "精彩", "完美", "喜欢", "爱", "成功", "值得",
        "benefit", "advantage", "improve", "better", "easy", "simple", "effective",
        "推荐", "优点", "改善", "更好", "简单", "有效", "实用", "强大",
    }

    NEGATIVE_WORDS = {
        "bad", "terrible", "awful", "worst", "hate", "dislike", "poor", "fail",
        "error", "bug", "problem", "issue", "difficult", "hard", "complicated",
        "糟糕", "差", "坏", "失败", "错误", "问题", "困难", "复杂", "难用", "不好",
        "disappoint", "frustrat", "annoy", "waste", "useless", "broken",
        "失望", "沮丧", "烦恼", "浪费", "无用", "损坏",
    }

    # 停用词
    STOPWORDS = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "must", "shall", "can", "need", "dare",
        "of", "in", "to", "for", "with", "on", "at", "from", "by", "about",
        "as", "into", "through", "during", "before", "after", "above", "below",
        "and", "but", "or", "yet", "so", "if", "because", "although", "though",
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
        "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看",
        "好", "自己", "这", "那", "这些", "那些", "什么", "怎么", "为什么",
    }

    def __init__(self, engine: Optional[AIEngine] = None, config: Optional[Dict] = None):
        self.engine = engine
        self.config = config or {}
        if not self.engine and self.config.get("ai"):
            self.engine = AIEngine.from_config(self.config["ai"])

    def analyze(self, unit: ContentUnit, mode: str = "ai") -> AnalysisResult:
        """分析 ContentUnit。

        Args:
            mode: "ai" 使用 LLM 深度分析, "quick" 使用规则快速分析, "both" 两者结合
        """
        text = unit.extracted_text or unit.description or unit.title
        if not text:
            raise AnalyzerError("ContentUnit has no text to analyze")
        
        if mode == "ai":
            if not self.engine:
                logger.warning("[Analyzer] No AI engine, falling back to quick mode")
                return self.analyze_quick(text)
            return self._analyze_with_ai(text)
        elif mode == "quick":
            return self.analyze_quick(text)
        elif mode == "both":
            quick = self.analyze_quick(text)
            if self.engine:
                ai_result = self._analyze_with_ai(text)
                # 合并结果：AI 负责 topics/entities，快速模式补充 keywords
                ai_result.keywords = list(set(ai_result.keywords + quick.keywords))
                return ai_result
            return quick
        else:
            raise AnalyzerError(f"Unknown analysis mode: {mode}")

    def analyze_text(self, text: str, mode: str = "ai") -> AnalysisResult:
        """分析纯文本。"""
        unit = ContentUnit(
            id="temp",
            source=SourceInfo(platform="text", url=""),
            type=ContentType.ARTICLE,
            extracted_text=text,
        )
        return self.analyze(unit, mode=mode)

    def _analyze_with_ai(self, text: str) -> AnalysisResult:
        """使用 AI 进行深度分析。"""
        prompt = DEEP_ANALYZE_PROMPT.format(text=text[:10000])
        logger.info("[Analyzer] Running AI deep analysis")
        
        try:
            raw_text = self.engine.generate(prompt, temperature=0.3, max_tokens=1500)
        except AIEngineError as e:
            logger.error(f"[Analyzer] AI analysis failed: {e}")
            return self.analyze_quick(text)
        
        # 解析 JSON
        try:
            data = self._extract_json(raw_text)
        except json.JSONDecodeError:
            logger.warning("[Analyzer] Failed to parse JSON, using fallback")
            return self.analyze_quick(text)
        
        sentiment = data.get("sentiment", {})
        return AnalysisResult(
            topics=data.get("topics", []),
            keywords=data.get("keywords", []),
            entities=data.get("entities", []),
            sentiment_label=sentiment.get("label", "unknown"),
            sentiment_confidence=sentiment.get("confidence", 0.0),
            sentiment_explanation=sentiment.get("explanation", ""),
            audience=data.get("audience", ""),
            quality_score=data.get("quality_score", 0),
            quality_notes=data.get("quality_notes", ""),
            raw=data,
        )

    def _extract_json(self, text: str) -> Dict:
        """从文本中提取 JSON 对象。"""
        # 尝试找到 ```json 块
        if "```json" in text:
            json_str = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            json_str = text.split("```")[1].split("```")[0]
        else:
            # 尝试找到第一个 { 和最后一个 }
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                json_str = text[start:end+1]
            else:
                json_str = text
        return json.loads(json_str.strip())

    def analyze_quick(self, text: str) -> AnalysisResult:
        """基于规则的快速分析。"""
        logger.info("[Analyzer] Running quick analysis")
        
        # 分词（简单按空格和标点）
        words = self._tokenize(text)
        
        # 关键词提取（频率统计，去除停用词）
        word_freq = Counter(w for w in words if w not in self.STOPWORDS and len(w) > 2)
        keywords = [w for w, _ in word_freq.most_common(15)]
        
        # 情感分析
        sentiment_label, sentiment_confidence, sentiment_explanation = self._analyze_sentiment(text)
        
        # 主题提取（基于关键词共现）
        topics = self._extract_topics(text, keywords)
        
        # 实体提取（简单大写词或引号内内容）
        entities = self._extract_entities(text)
        
        # 质量评分
        quality_score = self._estimate_quality(text, keywords)
        
        return AnalysisResult(
            topics=topics,
            keywords=keywords,
            entities=entities,
            sentiment_label=sentiment_label,
            sentiment_confidence=sentiment_confidence,
            sentiment_explanation=sentiment_explanation,
            audience="",  # 快速模式无法准确判断受众
            quality_score=quality_score,
            quality_notes="Rule-based quality estimation",
        )

    def _tokenize(self, text: str) -> List[str]:
        """简单分词。"""
        # 保留中文和英文
        text = re.sub(r'[^\w\s\u4e00-\u9fff]', ' ', text)
        words = text.lower().split()
        return words

    def _analyze_sentiment(self, text: str) -> tuple:
        """基于词典的情感分析。"""
        text_lower = text.lower()
        words = set(self._tokenize(text))
        
        pos_count = sum(1 for w in self.POSITIVE_WORDS if w in text_lower or w in words)
        neg_count = sum(1 for w in self.NEGATIVE_WORDS if w in text_lower or w in words)
        total = pos_count + neg_count
        
        if total == 0:
            return "neutral", 0.5, "No sentiment indicators found"
        
        ratio = pos_count / total
        if ratio > 0.6:
            confidence = min(0.95, ratio)
            return "positive", confidence, f"More positive words ({pos_count}) than negative ({neg_count})"
        elif ratio < 0.4:
            confidence = min(0.95, 1 - ratio)
            return "negative", confidence, f"More negative words ({neg_count}) than positive ({pos_count})"
        else:
            return "neutral", 0.5, f"Balanced sentiment ({pos_count} positive, {neg_count} negative)"

    def _extract_topics(self, text: str, keywords: List[str]) -> List[str]:
        """基于关键词的主题提取。"""
        # 简单规则：将相关关键词组合成主题
        topic_keywords = {
            "technology": ["tech", "software", "code", "programming", "ai", "machine learning", "开发", "编程", "技术"],
            "business": ["business", "startup", "company", "market", "revenue", "创业", "商业", "公司"],
            "health": ["health", "fitness", "medical", "wellness", "exercise", "健康", "健身", "医疗"],
            "education": ["education", "learning", "study", "course", "tutorial", "教育", "学习", "课程"],
            "lifestyle": ["life", "lifestyle", "travel", "food", "fashion", "生活", "旅行", "美食", "时尚"],
            "finance": ["finance", "money", "investment", "stock", "理财", "投资", "股票", "金融"],
        }
        
        text_lower = text.lower()
        matched_topics = []
        for topic, indicators in topic_keywords.items():
            score = sum(1 for ind in indicators if ind in text_lower or ind in keywords)
            if score >= 2:
                matched_topics.append(topic)
        
        # 如果没有匹配，取前3个关键词作为主题
        if not matched_topics and keywords:
            matched_topics = keywords[:3]
        
        return matched_topics[:5]

    def _extract_entities(self, text: str) -> List[str]:
        """简单实体提取。"""
        # 匹配大写组合（英文人名/公司名）
        entities = set()
        
        # 英文大写词（至少两个大写字母开头）
        for match in re.finditer(r'\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b', text):
            word = match.group()
            if word not in {"I", "A", "The", "This", "That", "It", "We", "You", "They"}:
                entities.add(word)
        
        # 引号内的内容
        for match in re.finditer(r'["""]([^"""]+)["""]', text):
            entities.add(match.group(1))
        
        return list(entities)[:10]

    def _estimate_quality(self, text: str, keywords: List[str]) -> int:
        """估计内容质量（1-10）。"""
        score = 5
        
        # 长度加分
        word_count = len(text.split())
        if word_count > 500:
            score += 2
        elif word_count > 200:
            score += 1
        elif word_count < 50:
            score -= 2
        
        # 关键词丰富度
        if len(keywords) >= 10:
            score += 1
        
        # 结构化内容（列表、标题等）
        if re.search(r'^(#{1,3}\s|\d+\.\s|\-\s)', text, re.MULTILINE):
            score += 1
        
        # 有链接或引用
        if re.search(r'https?://|@\w+|#\w+', text):
            score += 1
        
        return max(1, min(10, score))

    def extract_keywords(self, text: str, top_n: int = 15) -> List[str]:
        """提取关键词（便捷方法）。"""
        words = self._tokenize(text)
        word_freq = Counter(w for w in words if w not in self.STOPWORDS and len(w) > 2)
        return [w for w, _ in word_freq.most_common(top_n)]

    def detect_language(self, text: str) -> str:
        """检测文本主要语言。"""
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        total_chars = len(text.strip())
        if total_chars == 0:
            return "unknown"
        ratio = chinese_chars / total_chars
        if ratio > 0.3:
            return "zh"
        elif ratio > 0.1:
            return "mixed"
        else:
            return "en"

    def estimate_reading_time(self, text: str, wpm: int = 200) -> int:
        """估计阅读时间（分钟）。"""
        word_count = len(text.split())
        return max(1, round(word_count / wpm))


class AnalyzerError(Exception):
    """分析器错误。"""
    pass


# ─────────────────────────── 便捷函数 ───────────────────────────

def analyze_text(text: str, mode: str = "quick", **engine_kwargs) -> AnalysisResult:
    """便捷函数：分析文本。"""
    if mode == "ai" and engine_kwargs:
        engine = AIEngine(**engine_kwargs)
        analyzer = Analyzer(engine=engine)
    else:
        analyzer = Analyzer()
    return analyzer.analyze_text(text, mode=mode)
