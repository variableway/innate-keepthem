"""SkillLoader — Skill 加载与解析模块。

从 ~/.agents/skills/contentforge/ 目录加载 Markdown+YAML Frontmatter 格式的 Skill 文件，
支持触发器匹配、参数提取和元数据索引。

Skill 文件格式：
    ---
    name: xiaohongshu_publish
    description: 将内容转换为小红书文案并发布
    version: "1.0.0"
    author: contentforge
    triggers:
      - type: keyword
        patterns: ["小红书", "xhs", "xiaohongshu"]
      - type: intent
        patterns: ["publish_to_xiaohongshu", "convert_to_xhs"]
    parameters:
      - name: content
        type: string
        required: true
        description: 要转换的内容
      - name: style
        type: string
        required: false
        default: "casual"
        description: 文案风格
    tools:
      - name: xiaohongshu_converter
        description: 转换内容到小红书格式
      - name: content_publisher
        description: 发布到指定平台
    ---
    
    # 小红书发布 Skill
    
    本 Skill 将输入内容转换为小红书风格的文案并支持发布。
    
    ## 使用说明
    
    1. 接收内容文本或 ContentUnit
    2. 调用 xiaohongshu_converter 工具进行转换
    3. 可选调用 content_publisher 工具发布
    
    ## 注意事项
    
    - 内容长度限制 1000 字
    - 自动添加 emoji 和标签
"""

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Generator, List, Match, Optional, Pattern, Tuple

import yaml

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Data Models
# ------------------------------------------------------------------------------


@dataclass
class SkillTrigger:
    """Skill 触发器定义。"""

    trigger_type: str  # "keyword" | "intent" | "regex" | "semantic"
    patterns: List[str] = field(default_factory=list)
    confidence_threshold: float = 0.7
    # 编译后的正则（仅 regex 类型使用）
    _compiled_patterns: List[Pattern] = field(default_factory=list, repr=False)

    def __post_init__(self):
        if self.trigger_type == "regex":
            self._compiled_patterns = [re.compile(p, re.IGNORECASE) for p in self.patterns]

    def match(self, text: str) -> Tuple[bool, float]:
        """匹配文本，返回 (是否匹配, 置信度)。"""
        text_lower = text.lower()

        if self.trigger_type == "keyword":
            for pattern in self.patterns:
                if pattern.lower() in text_lower:
                    # 计算匹配得分：关键词长度 / 文本长度（归一化）
                    score = min(len(pattern) / max(len(text), 1), 1.0)
                    return True, min(score + 0.5, 1.0)  # 基础置信度 0.5
            return False, 0.0

        elif self.trigger_type == "intent":
            # 意图匹配：精确匹配或高相似度
            for pattern in self.patterns:
                if pattern.lower() == text_lower.strip():
                    return True, 1.0
                # 简单包含匹配
                if pattern.lower() in text_lower:
                    return True, 0.85
            return False, 0.0

        elif self.trigger_type == "regex":
            for compiled in self._compiled_patterns:
                match = compiled.search(text)
                if match:
                    # 正则匹配得分基于匹配长度
                    score = len(match.group(0)) / max(len(text), 1)
                    return True, min(score + 0.6, 1.0)
            return False, 0.0

        elif self.trigger_type == "semantic":
            # 语义匹配占位符，实际由 AI 模型判断
            return False, 0.0

        return False, 0.0


@dataclass
class SkillParameter:
    """Skill 参数定义。"""

    name: str
    param_type: str  # "string" | "number" | "boolean" | "array" | "object" | "content_unit"
    required: bool = True
    default: Any = None
    description: str = ""
    enum: Optional[List[str]] = None  # 可选值列表

    def validate(self, value: Any) -> Tuple[bool, Optional[str]]:
        """验证参数值。"""
        if value is None:
            if self.required:
                return False, f"参数 '{self.name}' 是必需的"
            return True, None

        # 类型检查
        type_validators = {
            "string": lambda v: isinstance(v, str),
            "number": lambda v: isinstance(v, (int, float)),
            "boolean": lambda v: isinstance(v, bool),
            "array": lambda v: isinstance(v, list),
            "object": lambda v: isinstance(v, dict),
            "content_unit": lambda v: isinstance(v, (str, dict)),  # 接受 ID 或 dict
        }

        validator = type_validators.get(self.param_type)
        if validator and not validator(value):
            return False, f"参数 '{self.name}' 类型错误，期望 {self.param_type}"

        # 枚举检查
        if self.enum and value not in self.enum:
            return False, f"参数 '{self.name}' 值 '{value}' 不在可选列表中: {self.enum}"

        return True, None


@dataclass
class SkillTool:
    """Skill 依赖的工具定义。"""

    name: str
    description: str = ""
    required: bool = True
    fallback: Optional[str] = None  # 失败时的备选工具


@dataclass
class SkillDefinition:
    """Skill 定义 — 解析后的完整 Skill 描述。"""

    # 元数据
    name: str
    description: str = ""
    version: str = "1.0.0"
    author: str = ""
    tags: List[str] = field(default_factory=list)
    category: str = "general"  # "ingestion" | "processing" | "publishing" | "general"

    # 触发器
    triggers: List[SkillTrigger] = field(default_factory=list)

    # 参数
    parameters: List[SkillParameter] = field(default_factory=list)

    # 工具
    tools: List[SkillTool] = field(default_factory=list)

    # Markdown 内容（Skill 的详细说明、提示模板等）
    markdown_content: str = ""

    # 文件路径
    source_path: Optional[str] = None

    # 运行时状态
    enabled: bool = True
    _param_map: Dict[str, SkillParameter] = field(default_factory=dict, repr=False)

    def __post_init__(self):
        self._param_map = {p.name: p for p in self.parameters}

    @property
    def prompt_template(self) -> str:
        """提取 Markdown 中的提示模板（如果有）。"""
        # 查找 ```prompt 或 ```template 代码块
        prompt_match = re.search(
            r"```(?:prompt|template)\n(.*?)```",
            self.markdown_content,
            re.DOTALL | re.IGNORECASE,
        )
        if prompt_match:
            return prompt_match.group(1).strip()

        # 否则返回整个 Markdown 内容作为提示
        return self.markdown_content.strip()

    @property
    def system_prompt(self) -> str:
        """构建系统提示词。"""
        lines = [
            f"You are the '{self.name}' skill assistant.",
            f"Description: {self.description}",
            "",
            "Available tools:",
        ]
        for tool in self.tools:
            lines.append(f"  - {tool.name}: {tool.description}")
        
        lines.extend([
            "",
            "Parameters:",
        ])
        for param in self.parameters:
            req = "required" if param.required else f"optional (default: {param.default})"
            lines.append(f"  - {param.name} ({param.param_type}, {req}): {param.description}")
        
        lines.extend([
            "",
            "Instructions:",
            self.prompt_template,
        ])
        
        return "\n".join(lines)

    def validate_args(self, args: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """验证参数。"""
        errors = []
        
        # 检查必需参数
        for param in self.parameters:
            if param.required and param.name not in args:
                errors.append(f"缺少必需参数: {param.name}")
                continue
            
            if param.name in args:
                valid, error = param.validate(args[param.name])
                if not valid:
                    errors.append(error)
        
        # 检查未知参数
        known = {p.name for p in self.parameters}
        for key in args:
            if key not in known:
                errors.append(f"未知参数: {key}")
        
        return len(errors) == 0, errors

    def get_parameter(self, name: str) -> Optional[SkillParameter]:
        """获取参数定义。"""
        return self._param_map.get(name)

    def fill_defaults(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """填充默认值。"""
        result = args.copy()
        for param in self.parameters:
            if param.name not in result and param.default is not None:
                result[param.name] = param.default
        return result

    def to_dict(self) -> Dict[str, Any]:
        """序列化为字典。"""
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "author": self.author,
            "tags": self.tags,
            "category": self.category,
            "triggers": [
                {"type": t.trigger_type, "patterns": t.patterns}
                for t in self.triggers
            ],
            "parameters": [
                {
                    "name": p.name,
                    "type": p.param_type,
                    "required": p.required,
                    "default": p.default,
                    "description": p.description,
                }
                for p in self.parameters
            ],
            "tools": [
                {"name": t.name, "description": t.description, "required": t.required}
                for t in self.tools
            ],
            "enabled": self.enabled,
            "source_path": self.source_path,
        }


# ------------------------------------------------------------------------------
# Skill Loader
# ------------------------------------------------------------------------------


DEFAULT_SKILL_DIR = Path.home() / ".agents" / "skills" / "contentforge"


class SkillLoader:
    """Skill 加载器 — 从文件系统加载和索引 Skill。

    使用示例：
        loader = SkillLoader()
        loader.load_all()  # 加载所有 Skill
        
        # 自然语言匹配
        matches = loader.match("把这篇文章发到小红书")
        if matches:
            skill, confidence = matches[0]
            print(f"匹配到 Skill: {skill.name} (置信度: {confidence:.2f})")
    """

    def __init__(self, skill_dir: Optional[str] = None):
        self.skill_dir = Path(skill_dir) if skill_dir else DEFAULT_SKILL_DIR
        self.skills: Dict[str, SkillDefinition] = {}
        self._trigger_index: List[Tuple[str, SkillTrigger]] = []  # (skill_name, trigger)
        logger.info("[SkillLoader] Initialized with skill_dir: %s", self.skill_dir)

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def load_all(self) -> List[SkillDefinition]:
        """加载 skill_dir 下所有 .md 文件。"""
        self.skills.clear()
        self._trigger_index.clear()

        if not self.skill_dir.exists():
            logger.warning("[SkillLoader] Skill directory does not exist: %s", self.skill_dir)
            return []

        skill_files = list(self.skill_dir.glob("*.md"))
        logger.info("[SkillLoader] Found %d skill files", len(skill_files))

        for file_path in skill_files:
            try:
                skill = self._parse_skill_file(file_path)
                if skill:
                    self.skills[skill.name] = skill
                    # 索引触发器
                    for trigger in skill.triggers:
                        self._trigger_index.append((skill.name, trigger))
                    logger.info("[SkillLoader] Loaded skill: %s", skill.name)
            except Exception as e:
                logger.error("[SkillLoader] Failed to parse %s: %s", file_path, e)

        return list(self.skills.values())

    def load_one(self, name: str) -> Optional[SkillDefinition]:
        """加载单个 Skill。"""
        if name in self.skills:
            return self.skills[name]

        file_path = self.skill_dir / f"{name}.md"
        if not file_path.exists():
            logger.warning("[SkillLoader] Skill file not found: %s", file_path)
            return None

        skill = self._parse_skill_file(file_path)
        if skill:
            self.skills[skill.name] = skill
            for trigger in skill.triggers:
                self._trigger_index.append((skill.name, trigger))
        return skill

    def reload(self) -> List[SkillDefinition]:
        """重新加载所有 Skill。"""
        return self.load_all()

    # ------------------------------------------------------------------
    # Matching
    # ------------------------------------------------------------------

    def match(
        self,
        text: str,
        min_confidence: float = 0.5,
        top_k: int = 5,
    ) -> List[Tuple[SkillDefinition, float]]:
        """通过自然语言匹配 Skill。

        返回按置信度排序的 (Skill, confidence) 列表。
        """
        results = []
        matched_skills = set()

        for skill_name, trigger in self._trigger_index:
            if skill_name in matched_skills:
                continue

            is_match, confidence = trigger.match(text)
            if is_match and confidence >= min_confidence:
                skill = self.skills.get(skill_name)
                if skill and skill.enabled:
                    results.append((skill, confidence))
                    matched_skills.add(skill_name)

        # 按置信度排序
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    def match_exact(self, name: str) -> Optional[SkillDefinition]:
        """精确匹配 Skill 名称。"""
        return self.skills.get(name)

    def suggest(self, text: str) -> List[Dict[str, Any]]:
        """获取匹配建议（用于 UI 展示）。"""
        matches = self.match(text, min_confidence=0.3, top_k=5)
        return [
            {
                "name": skill.name,
                "description": skill.description,
                "confidence": round(confidence, 2),
                "category": skill.category,
                "tags": skill.tags,
            }
            for skill, confidence in matches
        ]

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def get(self, name: str) -> Optional[SkillDefinition]:
        """获取已加载的 Skill。"""
        return self.skills.get(name)

    def list_skills(self, category: Optional[str] = None) -> List[SkillDefinition]:
        """列出所有 Skill，可按类别过滤。"""
        skills = [s for s in self.skills.values() if s.enabled]
        if category:
            skills = [s for s in skills if s.category == category]
        return skills

    def list_categories(self) -> List[str]:
        """列出所有类别。"""
        return sorted({s.category for s in self.skills.values()})

    def enable(self, name: str) -> bool:
        """启用 Skill。"""
        skill = self.skills.get(name)
        if skill:
            skill.enabled = True
            return True
        return False

    def disable(self, name: str) -> bool:
        """禁用 Skill。"""
        skill = self.skills.get(name)
        if skill:
            skill.enabled = False
            return True
        return False

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------

    def _parse_skill_file(self, file_path: Path) -> Optional[SkillDefinition]:
        """解析单个 Skill 文件。"""
        content = file_path.read_text(encoding="utf-8")
        
        # 分离 YAML Frontmatter 和 Markdown 内容
        if not content.startswith("---"):
            logger.warning("[SkillLoader] File missing YAML frontmatter: %s", file_path)
            return None

        # 找到第二个 ---
        parts = content.split("---", 2)
        if len(parts) < 3:
            logger.warning("[SkillLoader] Invalid frontmatter format: %s", file_path)
            return None

        yaml_content = parts[1].strip()
        markdown_content = parts[2].strip()

        # 解析 YAML
        try:
            metadata = yaml.safe_load(yaml_content) or {}
        except yaml.YAMLError as e:
            logger.error("[SkillLoader] YAML parse error in %s: %s", file_path, e)
            return None

        # 构建 SkillDefinition
        return self._build_skill(metadata, markdown_content, str(file_path))

    def _build_skill(
        self,
        metadata: Dict[str, Any],
        markdown_content: str,
        source_path: str,
    ) -> SkillDefinition:
        """从元数据构建 SkillDefinition。"""
        # 解析触发器
        triggers = []
        for trigger_data in metadata.get("triggers", []):
            triggers.append(
                SkillTrigger(
                    trigger_type=trigger_data.get("type", "keyword"),
                    patterns=trigger_data.get("patterns", []),
                    confidence_threshold=trigger_data.get("confidence_threshold", 0.7),
                )
            )

        # 解析参数
        parameters = []
        for param_data in metadata.get("parameters", []):
            parameters.append(
                SkillParameter(
                    name=param_data.get("name", ""),
                    param_type=param_data.get("type", "string"),
                    required=param_data.get("required", True),
                    default=param_data.get("default"),
                    description=param_data.get("description", ""),
                    enum=param_data.get("enum"),
                )
            )

        # 解析工具
        tools = []
        for tool_data in metadata.get("tools", []):
            tools.append(
                SkillTool(
                    name=tool_data.get("name", ""),
                    description=tool_data.get("description", ""),
                    required=tool_data.get("required", True),
                    fallback=tool_data.get("fallback"),
                )
            )

        return SkillDefinition(
            name=metadata.get("name", ""),
            description=metadata.get("description", ""),
            version=metadata.get("version", "1.0.0"),
            author=metadata.get("author", ""),
            tags=metadata.get("tags", []),
            category=metadata.get("category", "general"),
            triggers=triggers,
            parameters=parameters,
            tools=tools,
            markdown_content=markdown_content,
            source_path=source_path,
            enabled=metadata.get("enabled", True),
        )

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        """获取加载统计。"""
        return {
            "total_skills": len(self.skills),
            "enabled": sum(1 for s in self.skills.values() if s.enabled),
            "disabled": sum(1 for s in self.skills.values() if not s.enabled),
            "categories": self.list_categories(),
            "skill_dir": str(self.skill_dir),
        }

    def create_skill_template(self, name: str, description: str = "") -> str:
        """生成 Skill 模板内容。"""
        template = f"""---
name: {name}
description: {description or "A new ContentForge skill"}
version: "1.0.0"
author: contentforge
category: general
tags: []
triggers:
  - type: keyword
    patterns: ["{name}"]
parameters:
  - name: content
    type: string
    required: true
    description: Input content
tools:
  - name: example_tool
    description: An example tool
    required: true
---

# {name}

## Description

{description or "Describe what this skill does."}

## Usage

1. Step one
2. Step two
3. Step three

## Notes

Add any important notes here.
"""
        return template

    def save_skill_template(self, name: str, description: str = "") -> Path:
        """保存 Skill 模板到文件。"""
        self.skill_dir.mkdir(parents=True, exist_ok=True)
        file_path = self.skill_dir / f"{name}.md"
        content = self.create_skill_template(name, description)
        file_path.write_text(content, encoding="utf-8")
        logger.info("[SkillLoader] Created skill template: %s", file_path)
        return file_path
