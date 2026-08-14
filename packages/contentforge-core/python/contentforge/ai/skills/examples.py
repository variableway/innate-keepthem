"""Skill 调用层使用示例与集成测试。

本文件演示如何使用 SkillLoader、SkillExecutor、SkillContext 三个核心组件
实现 Chat 对话框的 Skill 调用功能。

运行方式：
    cd contentforge/core/python
    python -m contentforge.ai.examples

注意：需要先安装依赖：pip install pyyaml requests
"""

import json
import logging
import os
import sys
from pathlib import Path

# 设置日志
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# 确保 contentforge 在路径中
sys.path.insert(0, str(Path(__file__).parent.parent))

from contentforge.ai.skill_loader import SkillLoader, SkillDefinition
from contentforge.ai.skill_executor import SkillExecutor, ExecutionResult
from contentforge.ai.skill_context import SkillContext, ContentAccess, FileAccess, ToolRegistry
from contentforge.processing.ai_engine import AIEngine


# ==============================================================================
# 示例 1: 创建示例 Skill 文件
# ==============================================================================

def create_example_skills(skill_dir: str = "~/.agents/skills/contentforge") -> None:
    """创建示例 Skill 文件。"""
    dir_path = Path(skill_dir).expanduser()
    dir_path.mkdir(parents=True, exist_ok=True)

    # Skill 1: 小红书发布
    xiaohongshu_skill = """---
name: xiaohongshu_publish
description: 将内容转换为小红书文案并发布
version: "1.0.0"
author: contentforge
category: publishing
tags: ["social", "xiaohongshu", "publish"]
triggers:
  - type: keyword
    patterns: ["小红书", "xhs", "xiaohongshu", "发小红书", "发到小红书"]
  - type: intent
    patterns: ["publish_to_xiaohongshu", "convert_to_xhs"]
parameters:
  - name: content
    type: string
    required: true
    description: 要转换的内容文本或 ContentUnit ID
  - name: style
    type: string
    required: false
    default: "casual"
    enum: ["casual", "professional", "humorous", "minimal"]
    description: 文案风格
  - name: max_length
    type: number
    required: false
    default: 800
    description: 最大字数限制
tools:
  - name: xiaohongshu_converter
    description: 将内容转换为小红书格式
    required: true
  - name: content_search
    description: 搜索本地内容
    required: false
    fallback: file_read
---

# 小红书发布 Skill

## 功能

将输入内容转换为小红书风格的文案，支持多种风格。

## 使用流程

1. 接收内容（文本或 ContentUnit ID）
2. 如为 ID，先调用 content_search 获取内容
3. 调用 xiaohongshu_converter 进行转换
4. 返回转换后的文案

## 风格说明

- casual: 亲切自然，像朋友分享
- professional: 专业但易懂
- humorous: 幽默风趣
- minimal: 极简风格

```prompt
你是一个小红书文案专家。请将以下内容转换为小红书风格：

内容：{content}
风格：{style}
字数限制：{max_length}

要求：
1. 语气亲切自然
2. 适当使用 emoji
3. 添加 3-5 个相关标签
4. 开头有吸引力（hook）
5. 结尾有互动引导
```
"""

    # Skill 2: 内容摘要
    summarize_skill = """---
name: content_summarize
description: 对内容进行智能摘要
version: "1.0.0"
author: contentforge
category: processing
tags: ["ai", "summarize", "analysis"]
triggers:
  - type: keyword
    patterns: ["摘要", "总结", "summarize", "summary", "概括"]
  - type: intent
    patterns: ["summarize_content", "generate_summary"]
parameters:
  - name: content
    type: string
    required: true
    description: 要摘要的内容
  - name: style
    type: string
    required: false
    default: "structured"
    enum: ["structured", "concise", "bullets"]
    description: 摘要风格
  - name: max_length
    type: number
    required: false
    default: 300
    description: 最大字数
tools:
  - name: ai_summarize
    description: AI 摘要工具
    required: true
  - name: content_search
    description: 搜索内容
    required: false
---

# 内容摘要 Skill

## 功能

对长文本进行智能摘要，支持多种风格。

## 使用流程

1. 接收内容
2. 调用 ai_summarize 生成摘要
3. 格式化输出

```prompt
请对以下内容生成摘要：

{content}

风格：{style}
字数限制：{max_length}

要求：
1. 保留核心观点
2. 逻辑清晰
3. 语言简洁
```
"""

    # Skill 3: 视频分析
    video_analysis_skill = """---
name: video_analysis
description: 分析视频内容，提取关键信息
version: "1.0.0"
author: contentforge
category: processing
tags: ["video", "analysis", "metadata"]
triggers:
  - type: keyword
    patterns: ["视频", "video", "分析视频", "视频信息"]
  - type: regex
    patterns: [".*\\.(mp4|mov|avi|mkv).*"]
parameters:
  - name: video_path
    type: string
    required: true
    description: 视频文件路径
  - name: extract_frames
    type: boolean
    required: false
    default: false
    description: 是否提取关键帧
tools:
  - name: video_metadata
    description: 获取视频元数据
    required: true
  - name: file_read
    description: 读取文件
    required: false
---

# 视频分析 Skill

## 功能

分析视频文件，提取元数据、时长、分辨率等信息。

## 使用流程

1. 接收视频路径
2. 调用 video_metadata 获取信息
3. 格式化输出分析报告
"""

    # 保存 Skill 文件
    skills = {
        "xiaohongshu_publish.md": xiaohongshu_skill,
        "content_summarize.md": summarize_skill,
        "video_analysis.md": video_analysis_skill,
    }

    for filename, content in skills.items():
        file_path = dir_path / filename
        file_path.write_text(content, encoding="utf-8")
        logger.info("Created skill file: %s", file_path)


# ==============================================================================
# 示例 2: Skill 加载与匹配
# ==============================================================================

def demo_skill_loader() -> None:
    """演示 Skill 加载与匹配。"""
    print("\n" + "=" * 60)
    print("示例 2: Skill 加载与匹配")
    print("=" * 60)

    # 创建示例 Skill
    create_example_skills()

    # 加载 Skill
    loader = SkillLoader()
    skills = loader.load_all()
    print(f"\n加载了 {len(skills)} 个 Skill:")
    for skill in skills:
        print(f"  - {skill.name}: {skill.description}")

    # 匹配测试
    test_inputs = [
        "把这篇文章发到小红书",
        "帮我总结一下这个视频的内容",
        "分析一下这个视频文件的信息",
        "随便说点什么",
    ]

    for user_input in test_inputs:
        print(f"\n用户输入: '{user_input}'")
        matches = loader.match(user_input, min_confidence=0.3)
        if matches:
            for skill, confidence in matches:
                print(f"  -> 匹配: {skill.name} (置信度: {confidence:.2f})")
        else:
            print("  -> 无匹配")


# ==============================================================================
# 示例 3: Skill 执行（模拟）
# ==============================================================================

def demo_skill_execution() -> None:
    """演示 Skill 执行流程。"""
    print("\n" + "=" * 60)
    print("示例 3: Skill 执行流程")
    print("=" * 60)

    # 初始化组件
    loader = SkillLoader()
    loader.load_all()

    context = SkillContext()
    
    # 创建模拟的 AI Engine（不需要真实 API Key）
    # 实际使用时替换为真实的 AIEngine
    from contentforge.processing.ai_engine import AIConfig
    
    # 注意：这里使用 mock 引擎进行演示
    # 真实场景：ai_engine = AIEngine.from_config({"provider": "openai", "api_key": "..."})
    
    print("\nSkill 执行流程演示:")
    print("1. 用户输入 -> Skill 匹配")
    print("2. 参数提取 -> Skill 执行")
    print("3. 工具调用 -> 结果输出")

    # 演示参数验证
    skill = loader.get("xiaohongshu_publish")
    if skill:
        print(f"\nSkill: {skill.name}")
        print(f"Parameters: {[p.name for p in skill.parameters]}")
        
        # 验证有效参数
        valid, errors = skill.validate_args({
            "content": "这是一篇测试文章",
            "style": "casual",
        })
        print(f"\n验证有效参数: {valid}")
        if not valid:
            print(f"  错误: {errors}")
        
        # 验证无效参数
        valid, errors = skill.validate_args({
            "style": "invalid_style",
        })
        print(f"\n验证无效参数: {valid}")
        if not valid:
            print(f"  错误: {errors}")


# ==============================================================================
# 示例 4: ReAct 解析器
# ==============================================================================

def demo_react_parser() -> None:
    """演示 ReAct 解析器。"""
    print("\n" + "=" * 60)
    print("示例 4: ReAct 解析器")
    print("=" * 60)

    from contentforge.ai.skill_executor import ReActParser, AgentDecision, ActionType

    parser = ReActParser()

    # 示例 1: 工具调用
    react_text1 = """Thought: 我需要先搜索相关内容来获取信息。
Action: content_search
Action Input: {"query": "AI 新闻", "limit": 5}
Observation: """

    decision = parser.parse(react_text1)
    print(f"\n输入: {react_text1[:50]}...")
    print(f"解析结果:")
    print(f"  Action Type: {decision.action_type.value}")
    print(f"  Thought: {decision.thought}")
    print(f"  Tool Calls: {[(tc.tool_name, tc.arguments) for tc in decision.tool_calls]}")

    # 示例 2: 直接回答
    react_text2 = """Thought: 基于搜索结果，我可以给出答案。
Answer: 这是最终的回答内容。"""

    decision = parser.parse(react_text2)
    print(f"\n输入: {react_text2[:50]}...")
    print(f"解析结果:")
    print(f"  Action Type: {decision.action_type.value}")
    print(f"  Answer: {decision.answer}")

    # 示例 3: 普通文本（无 ReAct 格式）
    react_text3 = "这是一个普通的回答，没有任何工具调用格式。"

    decision = parser.parse(react_text3)
    print(f"\n输入: {react_text3}")
    print(f"解析结果:")
    print(f"  Action Type: {decision.action_type.value}")
    print(f"  Answer: {decision.answer}")


# ==============================================================================
# 示例 5: 工具注册与调用
# ==============================================================================

def demo_tool_registry() -> None:
    """演示工具注册与调用。"""
    print("\n" + "=" * 60)
    print("示例 5: 工具注册与调用")
    print("=" * 60)

    registry = ToolRegistry()

    # 列出内置工具
    print("\n内置工具列表:")
    for tool in registry.list_tools():
        print(f"  - {tool['name']}: {tool['schema']}")

    # 注册自定义工具
    def custom_tool(name: str, greeting: str = "Hello") -> str:
        return f"{greeting}, {name}!"

    registry.register(
        "custom_greeting",
        custom_tool,
        {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "greeting": {"type": "string", "default": "Hello"},
            },
            "required": ["name"],
        },
    )

    print("\n注册自定义工具后:")
    print(f"  custom_greeting exists: {registry.has_tool('custom_greeting')}")

    # 调用工具
    success, result = registry.call_safe("custom_greeting", name="ContentForge")
    print(f"\n调用 custom_greeting:")
    print(f"  Success: {success}")
    print(f"  Result: {result}")

    # 调用不存在的工具
    success, result = registry.call_safe("nonexistent_tool")
    print(f"\n调用不存在的工具:")
    print(f"  Success: {success}")
    print(f"  Error: {result}")


# ==============================================================================
# 示例 6: 完整集成流程
# ==============================================================================

def demo_full_integration() -> None:
    """演示完整集成流程。"""
    print("\n" + "=" * 60)
    print("示例 6: 完整集成流程")
    print("=" * 60)

    # 初始化所有组件
    loader = SkillLoader()
    loader.load_all()

    context = SkillContext()
    registry = ToolRegistry()

    print("\n集成组件:")
    print(f"  SkillLoader: {loader.get_stats()}")
    print(f"  ToolRegistry: {len(registry.list_tools())} tools")
    print(f"  ContentAccess: DB at {context.content.db_path}")

    # 模拟用户对话流程
    print("\n--- 模拟对话流程 ---")
    
    user_inputs = [
        "把这篇文章发到小红书",
        "帮我总结一下最近的内容",
        "分析这个视频 /path/to/video.mp4",
    ]

    for user_input in user_inputs:
        print(f"\n用户: {user_input}")
        
        # 1. 匹配 Skill
        matches = loader.match(user_input)
        if matches:
            skill, confidence = matches[0]
            print(f"  [路由] -> {skill.name} (confidence: {confidence:.2f})")
            
            # 2. 提取参数（模拟）
            print(f"  [参数] 需要: {[p.name for p in skill.parameters]}")
            
            # 3. 显示可用工具
            print(f"  [工具] {[(t.name, t.description) for t in skill.tools]}")
        else:
            print("  [路由] 无匹配 Skill")


# ==============================================================================
# 示例 7: 与现有 AIEngine 集成
# ==============================================================================

def demo_ai_engine_integration() -> None:
    """演示与现有 AIEngine 的集成。"""
    print("\n" + "=" * 60)
    print("示例 7: 与 AIEngine 集成")
    print("=" * 60)

    from contentforge.processing.ai_engine import AIConfig, AIEngine

    # 配置 AI Engine（使用环境变量或默认值）
    config = AIConfig(
        provider="openai",
        api_key=os.getenv("OPENAI_API_KEY", ""),
        model="gpt-4o-mini",
        temperature=0.7,
    )

    print(f"\nAI Engine 配置:")
    print(f"  Provider: {config.provider}")
    print(f"  Model: {config.model}")
    print(f"  API Key: {config.api_key[:4] + '****' if config.api_key else 'Not set'}")

    # 创建 SkillExecutor
    if config.api_key:
        try:
            ai_engine = AIEngine(config)
            executor = SkillExecutor(ai_engine=ai_engine)
            print(f"\nSkillExecutor 创建成功")
            print(f"  React mode: {executor.react_mode}")
            print(f"  Max iterations: {executor.max_iterations}")
        except Exception as e:
            print(f"\nAI Engine 初始化失败: {e}")
            print("  请设置 OPENAI_API_KEY 环境变量")
    else:
        print("\n跳过 AI Engine 初始化（未设置 API Key）")
        print("  设置方式: export OPENAI_API_KEY=sk-...")


# ==============================================================================
# 主入口
# ==============================================================================

def main():
    """运行所有示例。"""
    print("ContentForge Skill 调用层示例")
    print("=" * 60)
    print("本示例演示 SkillLoader、SkillExecutor、SkillContext 的使用")
    print("=" * 60)

    # 运行示例
    demo_skill_loader()
    demo_skill_execution()
    demo_react_parser()
    demo_tool_registry()
    demo_full_integration()
    demo_ai_engine_integration()

    print("\n" + "=" * 60)
    print("示例运行完成")
    print("=" * 60)
    print("\n关键文件路径:")
    print(f"  Skill 目录: ~/.agents/skills/contentforge/")
    print(f"  核心模块: core/python/contentforge/ai/")
    print("\n下一步:")
    print("  1. 设置 OPENAI_API_KEY 环境变量")
    print("  2. 创建自定义 Skill 文件")
    print("  3. 在 Chat 对话框中集成 SkillExecutor")


if __name__ == "__main__":
    main()
