"""Xiaohongshu Converter — 小红书风格文案转换器

将任意内容转换为小红书风格文案，包含：
- 表情符号优化
- 标签生成
- 字数控制
- 口语化改写
- 互动引导

使用示例：
    converter = XiaohongshuConverter(engine=AIEngine.from_config({}))
    post = converter.convert(content_unit, max_length=800, emoji_density="high")
"""
import logging
import re
from typing import Dict, List, Optional

from contentforge.models import ContentUnit, ContentStatus, ContentType, SourceInfo
from contentforge.processing.ai_engine import AIEngine, AIEngineError

logger = logging.getLogger(__name__)

# ─────────────────────────── 提示模板 ───────────────────────────

XIAOHONGSHU_SYSTEM_PROMPT = """你是小红书（Xiaohongshu）顶级内容创作者，擅长将任何内容转化为爆款笔记。

## 小红书风格规则

1. **标题**：使用emoji开头，制造悬念或共鸣（20字以内）
2. **开场**：用第一人称"我发现""我总结了""亲测"等建立信任
3. **正文**：
   - 每段1-2句话，短句为主
   - 使用大量emoji（✨💡🎯📌💯🔥⭐🌟💪👀）
   - 关键信息用【】或**加粗**强调
   - 加入个人感受（"真的绝了""太香了""后悔没早点"）
4. **标签**：文末加3-5个相关标签（#话题）
5. **互动**：结尾引导点赞收藏（"建议收藏""码住""蹲后续"）
6. **字数**：控制在{max_length}字以内（中文）
7. **语言**：{language}

## 转换内容
{content}

## 输出要求
只输出最终的小红书文案，不要任何解释或元评论。"""

XIAOHONGSHU_SHORT_PROMPT = """将以下内容改写为小红书风格（200字以内）：

{content}

要求：加emoji、短段落、3个标签、互动引导。"""

XIAOHONGSHU_LONG_PROMPT = """将以下内容改写为小红书风格（800-1000字）：

{content}

要求：
- 有吸引力的标题（emoji开头）
- 分3-5个部分，每部分有小标题
- 每段配emoji
- 关键信息加粗
- 5个标签
- 结尾互动引导"""

# 小红书常用表情库
XIAOHONGSHU_EMOJIS = [
    "✨", "💡", "🎯", "📌", "💯", "🔥", "⭐", "🌟", "💪", "👀",
    "😍", "🤩", "👏", "🎉", "💖", "❤️", "🧡", "💛", "💚", "💙",
    "📝", "📚", "📖", "🔍", "🚀", "🎊", "🌈", "☀️", "🌸", "🍀",
    "🙌", "👍", "✅", "⚡", "🆘", "‼️", "❗", "💥", "🎁", "🏆",
]

# 小红书常用开场语
XIAOHONGSHU_OPENINGS = [
    "姐妹们！我发现了一个超绝的方法",
    "家人们谁懂啊！这个真的太好用了",
    "宝子们，亲测有效！",
    "我真的后悔没早点知道这个",
    "挖到宝了！忍不住分享给你们",
    "我总结了一套超实用的方法",
    "今天必须跟你们唠唠这个",
]

# 小红书常用结尾语
XIAOHONGSHU_CLOSINGS = [
    "建议收藏⭐，以免找不到！",
    "觉得有用的话，点赞收藏不迷路👍",
    "有问题评论区见，看到都会回💬",
    "码住！后续还会更新更多干货📌",
    "喜欢就点个❤️，下次分享更实用的！",
    "这个真的绝了，你们一定要试试💯",
]


class XiaohongshuConverter:
    """小红书风格文案转换器。

    支持两种模式：
    - AI 模式：调用 LLM 进行高质量改写（推荐）
    - 模板模式：基于规则快速转换（无需 AI）

    使用示例：
        converter = XiaohongshuConverter()
        # AI 模式
        post = converter.convert(unit, max_length=800, emoji_density="high")
        # 模板模式
        post = converter.convert_quick(unit.extracted_text, max_length=500)
    """

    def __init__(self, engine: Optional[AIEngine] = None, config: Optional[Dict] = None):
        self.engine = engine
        self.config = config or {}
        if not self.engine and self.config.get("ai"):
            self.engine = AIEngine.from_config(self.config["ai"])

    def convert(
        self,
        unit: ContentUnit,
        max_length: int = 800,
        language: str = "中文",
        emoji_density: str = "medium",  # low, medium, high
    ) -> str:
        """使用 AI 将内容转换为小红书风格。"""
        if not self.engine:
            logger.warning("[Xiaohongshu] No AI engine, falling back to quick mode")
            return self.convert_quick(unit.extracted_text, max_length=max_length)
        
        content = unit.extracted_text or unit.description or unit.title
        if not content:
            raise XiaohongshuError("ContentUnit has no text to convert")
        
        prompt = XIAOHONGSHU_SYSTEM_PROMPT.format(
            content=content[:10000],
            max_length=max_length,
            language=language,
        )
        
        logger.info(f"[Xiaohongshu] Converting to Xiaohongshu style (max={max_length})")
        
        try:
            result = self.engine.generate(prompt, temperature=0.9, max_tokens=1500)
        except AIEngineError as e:
            logger.error(f"[Xiaohongshu] AI failed: {e}")
            return self.convert_quick(content, max_length=max_length)
        
        # 后处理：确保字数控制
        result = self._post_process(result, max_length=max_length, emoji_density=emoji_density)
        
        # 更新 ContentUnit
        unit.rewritten_text = result
        unit.status = ContentStatus.PROCESSED
        unit.tags = self._extract_tags(result)
        
        logger.info(f"[Xiaohongshu] Converted: {len(result)} chars")
        return result

    def convert_text(
        self,
        text: str,
        max_length: int = 800,
        language: str = "中文",
        emoji_density: str = "medium",
    ) -> str:
        """转换纯文本。"""
        unit = ContentUnit(
            id="temp",
            source=SourceInfo(platform="text", url=""),
            type=ContentType.ARTICLE,
            extracted_text=text,
        )
        return self.convert(unit, max_length=max_length, language=language, emoji_density=emoji_density)

    def convert_text_to_dict(
        self,
        text: str,
        max_length: int = 800,
        language: str = "中文",
        emoji_density: str = "medium",
    ) -> dict:
        """转换纯文本并返回字典格式（兼容 Go CLI）。"""
        body = self.convert_text(text, max_length=max_length, language=language, emoji_density=emoji_density)
        return {"body": body, "title": text[:30] + "..." if len(text) > 30 else text}

    def convert_quick(self, text: str, max_length: int = 500) -> str:
        """快速模板转换（无需 AI）。
        
        基于规则的轻量级转换，适用于：
        - 无 AI 可用时
        - 批量快速处理
        - 简单内容
        """
        if not text:
            raise XiaohongshuError("Empty text")
        
        # 提取关键句（简单规则：每段首句或包含关键信息的句子）
        sentences = self._extract_key_sentences(text, max_sentences=8)
        
        # 构建小红书文案
        lines = []
        
        # 标题
        import random
        title_emoji = random.choice(["✨", "💡", "🔥", "🎯", "📌"])
        lines.append(f"{title_emoji} {self._generate_title(text)}")
        lines.append("")
        
        # 开场
        lines.append(random.choice(XIAOHONGSHU_OPENINGS))
        lines.append("")
        
        # 正文要点
        for sentence in sentences:
            emoji = random.choice(XIAOHONGSHU_EMOJIS)
            lines.append(f"{emoji} {sentence}")
        
        lines.append("")
        # 结尾
        lines.append(random.choice(XIAOHONGSHU_CLOSINGS))
        
        # 标签
        tags = self._generate_tags(text)
        lines.append("")
        lines.append(" ".join(tags))
        
        result = "\n".join(lines)
        
        # 截断到最大长度
        if len(result) > max_length:
            result = result[:max_length - 10] + "...💕"
        
        return result

    def _generate_title(self, text: str) -> str:
        """基于内容生成标题。"""
        # 取前 30 字作为标题基础
        preview = text[:60].replace("\n", " ")
        if len(preview) > 30:
            return preview[:30] + "..."
        return preview or "超实用的分享"

    def _extract_key_sentences(self, text: str, max_sentences: int = 8) -> List[str]:
        """提取关键句子（简单启发式）。"""
        # 按句子分割
        sentences = re.split(r'[。.!！?？\n]+', text)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
        
        # 优先选择包含数字、"方法"、"技巧"、"步骤"等的句子
        priority_keywords = ["方法", "技巧", "步骤", "建议", "经验", "总结", "原理", "第一", "第二", "第三", "1.", "2.", "3."]
        scored = []
        for s in sentences:
            score = 0
            for kw in priority_keywords:
                if kw in s:
                    score += 1
            if len(s) > 50:
                score += 0.5
            scored.append((score, s))
        
        scored.sort(key=lambda x: x[0], reverse=True)
        return [s for _, s in scored[:max_sentences]]

    def _generate_tags(self, text: str) -> List[str]:
        """生成标签。"""
        # 基于关键词匹配
        tag_map = {
            "技术": ["#技术分享", "#编程", "#开发者"],
            "AI": ["#AI", "#人工智能", "#科技"],
            "学习": ["#学习方法", "#自我提升", "#成长"],
            "工作": ["#职场", "#工作效率", "#打工人"],
            "生活": ["#生活方式", "#日常", "#生活碎片"],
            "美食": ["#美食", "#探店", "#吃货"],
            "旅行": ["#旅行", "#攻略", "#小众旅行地"],
            "健康": ["#健康", "#养生", "#健身"],
            "理财": ["#理财", "#投资", "#搞钱"],
            "情感": ["#情感", "#恋爱", "#人际关系"],
        }
        
        tags = ["#干货分享", "#建议收藏"]
        for keyword, related_tags in tag_map.items():
            if keyword in text:
                tags.extend(related_tags)
        
        # 去重并限制数量
        unique_tags = list(dict.fromkeys(tags))
        return unique_tags[:5]

    def _extract_tags(self, text: str) -> List[str]:
        """从生成的文本中提取 #标签。"""
        tags = re.findall(r'#\w+', text)
        return list(set(tags))

    def _post_process(self, text: str, max_length: int, emoji_density: str) -> str:
        """后处理：调整 emoji 密度、字数控制。"""
        # 移除多余空行
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        # 根据 emoji_density 调整
        if emoji_density == "low":
            # 减少 emoji（保留每段一个）
            text = self._normalize_emoji_density(text, max_per_para=1)
        elif emoji_density == "high":
            # 增加 emoji
            text = self._increase_emoji_density(text)
        
        # 字数控制
        if len(text) > max_length:
            # 找到最后一个完整句子截断
            truncated = text[:max_length - 10]
            last_sentence_end = max(
                truncated.rfind("。"),
                truncated.rfind("!"),
                truncated.rfind("?"),
                truncated.rfind("\n"),
            )
            if last_sentence_end > max_length * 0.7:
                text = truncated[:last_sentence_end + 1] + "\n\n...✨"
            else:
                text = truncated + "...✨"
        
        return text.strip()

    def _normalize_emoji_density(self, text: str, max_per_para: int = 1) -> str:
        """规范化 emoji 密度。"""
        paragraphs = text.split("\n")
        normalized = []
        for para in paragraphs:
            emojis = re.findall(r'[^\w\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', para)
            if len(emojis) > max_per_para:
                # 保留第一个 emoji
                para = re.sub(r'[^\w\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', '', para, count=len(emojis) - max_per_para)
            normalized.append(para)
        return "\n".join(normalized)

    def _increase_emoji_density(self, text: str) -> str:
        """增加 emoji 密度。"""
        import random
        paragraphs = text.split("\n")
        enhanced = []
        for para in paragraphs:
            if para.strip() and not para.strip().startswith("#"):
                if not any(e in para for e in XIAOHONGSHU_EMOJIS):
                    para = random.choice(XIAOHONGSHU_EMOJIS) + " " + para
            enhanced.append(para)
        return "\n".join(enhanced)

    def estimate_quality(self, text: str) -> Dict[str, float]:
        """评估小红书文案质量，返回分数。"""
        scores = {
            "length": 0.0,
            "emoji": 0.0,
            "hashtag": 0.0,
            "interaction": 0.0,
            "structure": 0.0,
        }
        
        # 长度评分 (200-1000 字为佳)
        length = len(text)
        if 200 <= length <= 1000:
            scores["length"] = 1.0
        elif length < 200:
            scores["length"] = length / 200
        else:
            scores["length"] = max(0, 1 - (length - 1000) / 1000)
        
        # Emoji 评分
        emoji_count = sum(1 for c in text if c in XIAOHONGSHU_EMOJIS)
        scores["emoji"] = min(1.0, emoji_count / 5)
        
        # 标签评分
        hashtag_count = len(re.findall(r'#\w+', text))
        scores["hashtag"] = min(1.0, hashtag_count / 3)
        
        # 互动引导评分
        interaction_words = ["收藏", "点赞", "评论", "关注", "码住", "蹲"]
        scores["interaction"] = 1.0 if any(w in text for w in interaction_words) else 0.0
        
        # 结构评分（是否有空行分段）
        scores["structure"] = 1.0 if text.count("\n\n") >= 2 else 0.5
        
        scores["overall"] = sum(scores.values()) / len(scores)
        return scores


class XiaohongshuError(Exception):
    """小红书转换错误。"""
    pass


# ─────────────────────────── 便捷函数 ───────────────────────────

def to_xiaohongshu(text: str, max_length: int = 800, **engine_kwargs) -> str:
    """便捷函数：将文本转为小红书风格。"""
    converter = XiaohongshuConverter(**engine_kwargs)
    return converter.convert_quick(text, max_length=max_length)
