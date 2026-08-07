# ContentForge — Skill 系统设计

> 文档版本: v1.0  
> 更新日期: 2026-08-03  
> 设计目标: 可复用、可扩展、可共享的 AI 工作流单元

---

## 一、设计目标

Skill 是 ContentForge 中**可复用的 AI 工作流单元**。它解决的核心问题是：

> **如何将常用的 AI 处理流程（如"Twitter 转小红书"、"视频转笔记"）封装为可复用、可分享、可组合的单元？**

### 1.1 Skill vs Agent 的区别

| 维度 | Agent | Skill |
|------|-------|-------|
| 定位 | AI 角色/人格 | 工作流/任务模板 |
| 状态 | 有会话状态、记忆 | 无状态，单次执行 |
| 触发 | 用户切换或意图路由 | 关键词/意图匹配自动触发 |
| 复用 | 一次配置，持续对话 | 一次定义，多次调用 |
| 例子 | 内容分析师 | "Twitter 转小红书" 转换模板 |
| 关系 | Agent 可以调用 Skill | Skill 在 Agent 上下文中执行 |

### 1.2 设计原则

1. **Markdown 优先**: Skill 以 Markdown + YAML Frontmatter 定义，可读性强
2. **自包含**: 每个 Skill 包含完整的 Prompt、参数定义和工具依赖
3. **可触发**: 支持关键词、意图、正则等多种触发方式
4. **可组合**: Skill 可以调用其他 Skill 或工具
5. **可版本化**: 支持版本管理和 Skill 市场

---

## 二、Skill 文件格式

### 2.1 标准格式

```markdown
---
# Skill 元数据（YAML Frontmatter）
name: xiaohongshu_publish               # 唯一标识（snake_case）
description: 将内容转换为小红书风格文案  # 简短描述
version: "1.0.0"                        # 语义化版本
author: contentforge                    # 作者
category: publishing                    # 分类
tags: ["social", "xiaohongshu", "conversion"]  # 标签

# 触发器配置
triggers:
  - type: keyword                       # 触发器类型
    patterns:                           # 匹配模式列表
      - "小红书"
      - "xhs"
      - "转成小红书"
      - "xiaohongshu"
    confidence: 0.8                     # 匹配置信度阈值
  - type: intent
    patterns: ["convert_to_xiaohongshu"]
  - type: regex
    patterns: ["发布到小红书"]

# 参数定义（JSON Schema 风格）
parameters:
  - name: content
    type: string
    required: true
    description: 要转换的内容
  - name: style
    type: string
    required: false
    default: "casual"
    enum: ["casual", "professional", "story"]
    description: 文案风格
  - name: add_hashtags
    type: boolean
    required: false
    default: true
    description: 是否添加标签

# 工具依赖
tools:
  - name: xiaohongshu_converter
    description: 转换内容到小红书格式
    required: true
  - name: text_analyzer
    description: 内容分析
    required: false

# Agent 配置
agent:
  id: rewriter                          # 执行此 Skill 时使用的 Agent
  model: gpt-4o-mini
  temperature: 0.8
  max_tokens: 2000

# 输入/输出映射
input_mapping:
  content: "{{user_input}}"             # 用户输入映射到 content 参数
output_mapping:
  result: "{{output.text}}"             # 输出映射

# 依赖的其他 Skill
dependencies:
  - name: text_summarize
    version: ">=1.0.0"

# 示例
examples:
  - input: "帮我将这段产品介绍转成小红书风格"
    output: "✨ 姐妹们！今天发现了一个宝藏产品..."
---

# Skill 正文（Markdown）

## 使用说明

这个 Skill 将任意内容转换为符合小红书风格的文案。

### 转换规则

1. **标题**: 使用emoji开头，吸引眼球
2. **正文**: 分段清晰，使用 emoji 点缀
3. **语气**: 亲切、分享式的口吻
4. **标签**: 自动添加相关话题标签
5. **互动**: 结尾引导评论/收藏

## Prompt 模板

```prompt
你是一个资深的小红书文案创作者。

请将以下内容转换为小红书风格：

---
{{content}}
---

要求：
- 标题要有吸引力，使用 2-3 个 emoji
- 正文分段，每段不超过 3 行
- 语气亲切自然，像朋友分享
- {{#if add_hashtags}}添加 5-8 个相关话题标签{{/if}}
- 结尾引导互动（如"姐妹们觉得呢？"）
- 整体字数控制在 300-800 字

风格：{{style}}
```

## 输出格式

```markdown
# {{emoji_title}}

{{body}}

{{#if add_hashtags}}
---
{{hashtags}}
{{/if}}
```
```

### 2.2 文件存储

```
~/.contentforge/skills/                 # 用户 Skill 目录
├── xiaohongshu_publish.md              # 小红书发布 Skill
├── twitter_to_notes.md                 # Twitter 转笔记 Skill
├── video_summarize.md                  # 视频摘要 Skill
├── translate_article.md                # 文章翻译 Skill
└── ...

contentforge/core/python/contentforge/skills/  # 内置 Skill
├── xiaohongshu_publish.md
├── text_summarize.md
├── web_to_markdown.md
└── ...
```

---

## 三、Skill 系统架构

### 3.1 组件关系

```
┌─────────────────────────────────────────────────────────────┐
│                        Skill System                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Skill Loader │───→│ Skill Index │───→│ Skill Match │     │
│  │             │    │             │    │             │     │
│  │ • 扫描目录   │    │ • 元数据索引 │    │ • 关键词匹配 │     │
│  │ • 解析 YAML │    │ • 全文检索   │    │ • 意图匹配   │     │
│  │ • 验证格式  │    │ • 标签分类   │    │ • 正则匹配   │     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘     │
│                                                │            │
│  ┌─────────────┐    ┌─────────────┐           │            │
│  │ Skill Store │←───│  User Input │←──────────┘            │
│  │  (Zustand)  │    │             │                        │
│  └──────┬──────┘    └─────────────┘                        │
│         │                                                    │
│         │ 选择 Skill                                          │
│         ▼                                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Parameter  │───→│   Prompt    │───→│  LLM Call   │     │
│  │  Extractor  │    │  Renderer   │    │             │     │
│  │             │    │             │    │             │     │
│  │ • 从输入提取 │    │ • 模板渲染   │    │ • 调用 AI   │     │
│  │ • 默认值填充 │    │ • 变量替换   │    │ • 流式输出  │     │
│  │ • 类型验证  │    │ • 条件渲染   │    │ • 错误处理  │     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘     │
│                                                │            │
│  ┌─────────────┐    ┌─────────────┐           │            │
│  │ Tool Caller │←───│  ReAct Loop │←──────────┘            │
│  │             │    │             │                        │
│  │ • 工具注册   │    │ • 思考-行动  │                        │
│  │ • 参数绑定   │    │ • 结果观察   │                        │
│  │ • 结果注入   │    │ • 循环判断   │                        │
│  └─────────────┘    └─────────────┘                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Skill Loader

```python
# contentforge/ai/skills/skill_loader.py

class SkillLoader:
    """Skill 加载器 — 从文件系统扫描和解析 Skill"""
    
    SKILL_DIRS = [
        os.environ.get("CONTENTFORGE_SKILL_DIR"),
        os.path.expanduser("~/.contentforge/skills/"),
        os.path.join(os.path.dirname(__file__), "../skills/"),
    ]
    
    def __init__(self):
        self._skills: Dict[str, SkillManifest] = {}
        self._index: Dict[str, List[str]] = {  # 索引
            "by_tag": {},
            "by_category": {},
            "by_trigger": {},
        }
    
    def load_all(self) -> Dict[str, SkillManifest]:
        """扫描所有 Skill 目录并加载"""
        for skill_dir in self.SKILL_DIRS:
            if not skill_dir or not os.path.exists(skill_dir):
                continue
            for filename in os.listdir(skill_dir):
                if filename.endswith(".md"):
                    filepath = os.path.join(skill_dir, filename)
                    skill = self._parse_skill(filepath)
                    if skill:
                        self._skills[skill.name] = skill
                        self._update_index(skill)
        return self._skills
    
    def _parse_skill(self, filepath: str) -> Optional[SkillManifest]:
        """解析单个 Skill 文件"""
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        # 分离 YAML Frontmatter 和 Markdown Body
        if content.startswith("---"):
            _, yaml_part, body = content.split("---", 2)
            metadata = yaml.safe_load(yaml_part)
        else:
            metadata = {}
            body = content
        
        return SkillManifest(
            name=metadata.get("name"),
            description=metadata.get("description"),
            version=metadata.get("version", "1.0.0"),
            author=metadata.get("author"),
            category=metadata.get("category"),
            tags=metadata.get("tags", []),
            triggers=[TriggerConfig(**t) for t in metadata.get("triggers", [])],
            parameters=[SkillParameter(**p) for p in metadata.get("parameters", [])],
            tools=metadata.get("tools", []),
            agent=metadata.get("agent", {}),
            body=body.strip(),
            filepath=filepath,
        )
    
    def match(self, text: str, min_confidence: float = 0.5, 
              top_k: int = 3) -> List[SkillMatchResult]:
        """
        自然语言匹配 Skill
        
        1. 关键词匹配（精确/包含）
        2. 意图匹配
        3. 正则匹配
        4. 语义匹配（可选，需要 embedding）
        """
        results = []
        for skill in self._skills.values():
            score = self._calculate_match_score(skill, text)
            if score >= min_confidence:
                results.append(SkillMatchResult(skill=skill, score=score))
        
        return sorted(results, key=lambda r: r.score, reverse=True)[:top_k]
    
    def _calculate_match_score(self, skill: SkillManifest, text: str) -> float:
        """计算匹配分数"""
        max_score = 0.0
        for trigger in skill.triggers:
            if trigger.type == "keyword":
                for pattern in trigger.patterns:
                    if pattern in text:
                        max_score = max(max_score, trigger.confidence or 0.9)
            elif trigger.type == "intent":
                # 意图匹配逻辑
                pass
            elif trigger.type == "regex":
                for pattern in trigger.patterns:
                    if re.search(pattern, text):
                        max_score = max(max_score, trigger.confidence or 0.95)
        return max_score
    
    def suggest(self, text: str) -> List[Dict]:
        """获取匹配建议（用于 UI 展示）"""
        matches = self.match(text, min_confidence=0.3, top_k=5)
        return [{
            "name": m.skill.name,
            "display_name": m.skill.display_name or m.skill.name,
            "description": m.skill.description,
            "score": round(m.score, 2),
            "tags": m.skill.tags,
        } for m in matches]
    
    def create_template(self, name: str) -> str:
        """生成 Skill 模板"""
        template = f"""---
name: {name}
description: 
version: "1.0.0"
author: user
category: general
tags: []
triggers:
  - type: keyword
    patterns: []
    confidence: 0.8
parameters:
  - name: input
    type: string
    required: true
    description: 输入内容
---

# Skill: {name}

## 使用说明

## Prompt

```prompt
{{{{input}}}}
```
"""
        return template
```

### 3.3 Skill Executor

```python
# contentforge/ai/skills/skill_executor.py

class SkillExecutor:
    """Skill 执行引擎 — 自研轻量 ReAct 风格 Agent 框架"""
    
    def __init__(self, ai_engine: AIEngine, tool_registry: ToolRegistry):
        self.ai_engine = ai_engine
        self.tool_registry = tool_registry
        self.max_iterations = 5
    
    def execute(self, skill: SkillManifest, user_input: str, 
                context: Dict[str, Any] = None,
                args: Dict[str, Any] = None) -> SkillExecutionResult:
        """同步执行 Skill"""
        # 1. 参数提取
        params = self._extract_parameters(skill, user_input, args)
        
        # 2. 渲染 Prompt
        prompt = self._render_prompt(skill, params, context)
        
        # 3. 调用 LLM
        response = self.ai_engine.complete(
            prompt=prompt,
            model=skill.agent.get("model", "gpt-4o-mini"),
            temperature=skill.agent.get("temperature", 0.7),
            max_tokens=skill.agent.get("max_tokens", 2000),
        )
        
        return SkillExecutionResult(
            skill_id=skill.name,
            status="success",
            output=response,
            duration_ms=...,
        )
    
    def stream_execute(self, skill: SkillManifest, user_input: str,
                       context: Dict[str, Any] = None,
                       args: Dict[str, Any] = None):
        """流式执行 Skill"""
        params = self._extract_parameters(skill, user_input, args)
        prompt = self._render_prompt(skill, params, context)
        
        for chunk in self.ai_engine.stream_complete(prompt=prompt):
            yield StreamChunk(type="token", text=chunk)
    
    def _extract_parameters(self, skill: SkillManifest, user_input: str,
                           args: Dict[str, Any] = None) -> Dict[str, Any]:
        """从用户输入中提取参数"""
        params = {}
        args = args or {}
        
        for param in skill.parameters:
            # 优先使用显式传入的参数
            if param.name in args:
                params[param.name] = args[param.name]
            # 尝试从用户输入中提取
            elif param.required:
                # 如果只有一个必填参数且用户输入非空，假设为用户输入
                if len([p for p in skill.parameters if p.required]) == 1:
                    params[param.name] = user_input
                else:
                    raise ValueError(f"Missing required parameter: {param.name}")
            else:
                params[param.name] = param.default
        
        return params
    
    def _render_prompt(self, skill: SkillManifest, params: Dict[str, Any],
                       context: Dict[str, Any] = None) -> str:
        """渲染 Prompt 模板"""
        # 简单的变量替换（Jinja2 风格）
        prompt = skill.body
        
        # 替换 {{variable}} 语法
        for key, value in params.items():
            prompt = prompt.replace(f"{{{{{key}}}}}", str(value))
        
        # 替换上下文变量
        if context:
            for key, value in context.items():
                prompt = prompt.replace(f"{{{{{key}}}}}", str(value))
        
        return prompt
```

---

## 四、内置 Skill 清单

### 4.1 已规划 Skill

| Skill | 分类 | 触发词 | 状态 |
|-------|------|--------|------|
| `xiaohongshu_publish` | publishing | 小红书, xhs | 📋 |
| `text_summarize` | processing | 摘要, 总结 | 📋 |
| `text_translate` | processing | 翻译, translate | 📋 |
| `text_rewrite` | processing | 改写, 重写 | 📋 |
| `video_to_notes` | processing | 视频笔记, 视频摘要 | 📋 |
| `twitter_to_markdown` | ingestion | Twitter 转 MD | 📋 |
| `rss_to_digest` | processing | RSS 摘要 | 📋 |
| `web_to_summary` | processing | 网页摘要 | 📋 |
| `content_analyze` | processing | 分析, analyze | 📋 |
| `generate_slides` | output | PPT, Slides | 📋 |

### 4.2 从 capsummarize 迁移的 Skill（34 种）

来自 capsummarize 仓库的 34 种 AI Prompt 模板可以迁移为 ContentForge Skill：

| # | Skill | 描述 |
|---|-------|------|
| 1 | `summary_text` | 文本摘要 |
| 2 | `summary_video` | 视频摘要 |
| 3 | `key_points` | 关键要点提取 |
| 4 | `short_video_script` | 短视频脚本 |
| 5 | `thumbnail_idea` | 缩略图创意 |
| 6 | `title_generator` | 标题生成 |
| 7 | `tag_generator` | 标签生成 |
| 8 | `blog_post` | 博客文章 |
| 9 | `social_post` | 社交媒体帖子 |
| 10 | `email_newsletter` | 邮件简报 |
| ... | ... | ... |
| 34 | `faq_generator` | FAQ 生成 |

---

## 五、Skill 市场（未来）

```
┌─────────────────────────────────────────────────────────────┐
│                    ContentForge Skill Market                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🔍 搜索 Skill...                                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  热门分类                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 内容处理  │ │ 格式转换  │ │ 发布输出  │ │ 数据分析  │       │
│  │ 12 Skills│ │ 8 Skills │ │ 6 Skills │ │ 4 Skills │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  热门 Skill                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🏆 xiaohongshu_publish    ⭐ 4.8  📥 1.2k           │    │
│  │    将内容转换为小红书风格文案                          │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ 🎬 video_to_notes         ⭐ 4.6  📥 890            │    │
│  │    将视频转为结构化笔记                                │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ 📊 content_analyze        ⭐ 4.5  📥 756            │    │
│  │    内容深度分析                                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  我的 Skill                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ✏️ 创建新 Skill                                       │    │
│  │ 📤 导入本地 Skill                                     │    │
│  │ 🔄 同步 GitHub                                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、与 Agent 的协作

```
用户: "帮我把这个 Twitter 帖子转成小红书文案"

AgentRouter 分析意图:
├── 匹配到 Skill: xiaohongshu_publish (confidence: 0.95)
├── 当前 Agent: rewriter
└── 决策: 执行 Skill

执行流程:
1. SkillExecutor 加载 xiaohongshu_publish Skill
2. 提取参数: content = "Twitter 帖子内容"
3. 渲染 Prompt（使用 Skill 定义的模板）
4. 调用 LLM 生成小红书文案
5. 返回结果给用户

用户: "这个文案可以再加一些 emoji 吗？"

AgentRouter 分析意图:
├── 不是 Skill 触发
├── 当前 Agent: rewriter（继续）
└── 决策: 直接对话

执行流程:
1. AgentSession 继续对话
2. 使用 rewriter 的系统提示词
3. 调用 LLM 修改文案
4. 返回结果
```

---

## 七、相关文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 项目愿景 | [00-PROJECT-VISION.md](00-PROJECT-VISION.md) | 愿景、核心概念 |
| 架构总览 | [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) | 系统架构 |
| 模块状态 | [02-MODULE-STATUS.md](02-MODULE-STATUS.md) | 各模块功能状态 |
| Plugin 系统 | [03-PLUGIN-SYSTEM.md](03-PLUGIN-SYSTEM.md) | Plugin 架构设计 |
| 内容生命周期 | [05-CONTENT-LIFECYCLE.md](05-CONTENT-LIFECYCLE.md) | ContentUnit 生命周期 |
| 路线图 | [06-ROADMAP.md](06-ROADMAP.md) | 开发计划 |
