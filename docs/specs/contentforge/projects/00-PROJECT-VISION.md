# ContentForge — 项目愿景与核心概念

> 文档版本: v1.0  
> 更新日期: 2026-08-03  
> 项目定位: AI-Native 内容工作流平台

---

## 一、项目愿景（Vision）

### 1.1 一句话定义

> **ContentForge 是一个 AI-Native 的内容工作流平台，从社交媒体信息采集到内容加工、再到多平台发布，全流程自动化，核心目标是构建「共享上下文（Shared Context）」驱动的内容创作环境。**

### 1.2 解决的问题

| 痛点 | 现状 | ContentForge 方案 |
|------|------|-------------------|
| 信息分散 | Twitter、YouTube、RSS、播客……内容源太多，无法统一管理 | 统一采集 → 统一存储 → 统一对话 |
| 内容处理门槛高 | 视频字幕提取、翻译、摘要、改写需要多个工具 | 一键 Pipeline：采集 → 处理 → 输出 |
| 跨平台发布繁琐 | 同一内容需要适配不同平台的格式和风格 | 智能格式转换（Markdown/小红书/XHS/Slides） |
| AI 对话与内容割裂 | ChatGPT 无法直接读取你的本地视频/文档 | 内建 AI Chat + 资产上下文关联 |
| 重复劳动 | 每次处理都需要重新写 Prompt | Skill 系统：可复用的 AI 工作流单元 |

### 1.3 核心价值主张

```
采集（Ingestion）    →    处理（Processing）    →    输出（Output）
     ↓                       ↓                       ↓
  YouTube              AI 摘要/翻译/改写         Markdown
  Twitter/X            情感分析/主题提取         小红书文案
  RSS Feed             视频转录/场景检测         PPT Slides
  网页文章             RAG 问答                  视频摘要
  播客/音频            多 Agent 协作              结构化笔记
```

**核心理念**: 任何社交媒体内容都可以被采集、被理解、被加工、被转化为你需要的内容格式。

---

## 二、核心概念（Core Concepts）

### 2.1 Shared Context（共享上下文）

> Shared Context 是 ContentForge 的**核心设计哲学**。它指的是所有 Agent、Skill、工具和用户对话共享同一套内容上下文。

```
┌─────────────────────────────────────────────────────────────┐
│                      SHARED CONTEXT                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 视频资产  │  │ 文章资产  │  │ 推文资产  │  │ 音频资产  │    │
│  │ #vid-001 │  │ #art-002 │  │ #tw-003  │  │ #aud-004 │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └──────────────┴──────────────┴──────────────┘         │
│                         │                                   │
│              ┌──────────▼──────────┐                        │
│              │   Content Access     │                        │
│              │  (SQLite + FTS5)     │                        │
│              └──────────┬──────────┘                        │
│                         │                                   │
│       ┌─────────────────┼─────────────────┐                 │
│       ▼                 ▼                 ▼                 │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐             │
│  │ Agent A │      │ Agent B │      │ Agent C │             │
│  │分析师   │      │摘要专家 │      │发布助手 │             │
│  └─────────┘      └─────────┘      └─────────┘             │
│       │                 │                 │                 │
│       └─────────────────┴─────────────────┘                 │
│                         │                                   │
│                    Chat Dialog                               │
│              "基于这3个视频的内容，                           │
│               帮我写一份小红书文案"                          │
└─────────────────────────────────────────────────────────────┘
```

**Shared Context 的三大特征**:

1. **统一存储**: 所有采集的内容以 `ContentUnit` 实体存入 SQLite，支持 FTS5 全文检索
2. **资产关联**: Chat 会话可以关联任意数量的资产，Agent 自动感知关联内容
3. **上下文传递**: Agent 切换时上下文不丢失，多 Agent 协作时共享同一套上下文

### 2.2 ContentUnit（内容单元）

ContentUnit 是贯穿 ContentForge 全生命周期的**核心数据实体**。

```python
ContentUnit
├── id: UUID                           # 全局唯一标识
├── source: SourceInfo                 # 来源信息（平台、URL、作者、互动数据）
│   ├── platform: str                  # youtube / twitter / rss / web
│   ├── url: str                       # 原始 URL
│   ├── author: str                    # 作者
│   └── engagement: Dict              # 互动数据（likes, replies, reposts, views）
├── type: ContentType                  # 内容类型
│   # video | article | tweet | thread | audio | image | note
├── title, description                 # 标题和描述
├── extracted_text: str               # 提取的原始文本（字幕/正文）
├── summary: str                       # AI 生成的摘要
├── key_points: List[str]             # 关键要点
├── sentiment: str                     # 情感分析结果
├── topics: List[str]                 # 主题标签
├── translated_text: str              # 翻译后的文本
├── rewritten_text: str               # 改写后的文本
├── transcript: str                    # 视频/音频转录文本
├── file_path: str                     # 关联的本地文件路径
├── status: ContentStatus             # 生命周期状态
│   # ingested → processing → processed → editing → ready → published
├── tags: List[str]                   # 用户标签
├── analysis: Dict                     # AI 分析结果（JSON）
└── created_at, updated_at            # 时间戳
```

### 2.3 Agent（智能体）

Agent 是 ContentForge 中执行特定任务的 AI 角色。每个 Agent 有独立的能力集、系统提示词和工具集。

**内置 Agent 角色**:

| Agent | 角色 | 核心能力 | 自动切换 |
|-------|------|---------|---------|
| `general` | 通用助手 | 通用对话、搜索 | 否 |
| `content_analyst` | 内容分析师 | 内容分析、要点提取、情感分析 | 是 |
| `summarizer` | 摘要专家 | 长文本摘要、TL;DR | 是 |
| `rewriter` | 改写专家 | 改写、翻译、润色、小红书转换 | 是 |
| `publisher` | 发布助手 | 格式转换、导出、发布 | 是 |
| `pipeline_runner` | 流水线执行器 | 执行预设流水线 | 是 |

**Agent 的工作模式**:

```
用户输入 → 意图路由（AgentRouter）→ 选择最佳 Agent → Agent 执行 → 输出
              ↓
         如果需要
              ↓
         工具调用（Tool Calling）→ 查询资产/读取文件/执行 Skill
              ↓
         结果注入上下文 → 继续 LLM 推理
```

### 2.4 Skill（技能）

Skill 是 ContentForge 中**可复用的 AI 工作流单元**，以 Markdown + YAML Frontmatter 格式定义。

**Skill 文件格式**:

```markdown
---
name: twitter_to_xiaohongshu
description: 将 Twitter 内容转换为小红书风格文案
version: "1.0.0"
author: contentforge
category: publishing
tags: ["social", "xiaohongshu", "twitter"]
triggers:
  - type: keyword
    patterns: ["小红书", "xhs", "转成小红书"]
  - type: intent
    patterns: ["convert_to_xiaohongshu"]
parameters:
  - name: content
    type: string
    required: true
    description: 要转换的内容
tools:
  - name: xiaohongshu_converter
    required: true
---

# Twitter to 小红书 Skill

## Prompt

你是一个小红书文案专家。请将以下内容转换为符合小红书风格的文案：
...
```

**Skill vs Agent 的区别**:

| | Agent | Skill |
|---|-------|-------|
| 定位 | AI 角色/人格 | 工作流/任务模板 |
| 状态 | 有会话状态、记忆 | 无状态，单次执行 |
| 触发 | 用户主动切换或意图路由 | 关键词/意图匹配自动触发 |
| 复用 | 一次配置，持续对话 | 一次定义，多次调用 |
| 例子 | 内容分析师 | "Twitter 转小红书" 转换模板 |

### 2.5 Plugin（插件）

Plugin 是 ContentForge 中**扩展平台采集能力的模块**。每个 Plugin 对应一个社交媒体平台或内容源。

**Plugin 的职责边界**:

```
Plugin 负责:              Plugin 不负责:
├── 平台认证              ├── 内容存储（由 Core 负责）
├── 内容抓取              ├── AI 处理（由 Agent 负责）
├── 原始数据解析          ├── 输出格式（由 Pipeline 负责）
└── 转换为 ContentUnit    └── 用户界面（由 Frontend 负责）
```

**支持的 Plugin 类型**:

| Plugin | 平台 | 采集方式 | 状态 |
|--------|------|---------|------|
| `youtube` | YouTube | yt-dlp + 字幕提取 | ✅ 已实现 |
| `twitter` | Twitter/X | agent-reach / API | 🔄 规划中 |
| `rss` | RSS Feed | feedparser | 🔄 规划中 |
| `web` | 网页 | Jina Reader / crawl4ai | 🔄 规划中 |
| `podcast` | 播客 | RSS + 音频下载 | 📋 待设计 |
| `reddit` | Reddit | API / PRAW | 📋 待设计 |
| `hackernews` | Hacker News | API | 📋 待设计 |
| `github` | GitHub | API | 📋 待设计 |

### 2.6 Pipeline（流水线）

Pipeline 是 ContentForge 中**可编排的内容处理工作流**，由一系列 Step 组成的 DAG（有向无环图）。

**预设流水线**:

| Pipeline ID | 输入 | 输出 | 步骤 |
|-------------|------|------|------|
| `twitter_to_xiaohongshu` | Twitter URL | 小红书文案 | 采集 → 翻译 → 摘要 → 小红书转换 → 分析 |
| `youtube_to_notes` | YouTube URL | 结构化笔记 | 采集(字幕) → 翻译 → 摘要 → 分析 → 改写 |
| `rss_to_digest` | RSS Feed | 摘要报告 | 采集 → 过滤 → 摘要 → 分析 |
| `web_to_summary` | 网页 URL | Markdown | 采集 → 摘要 → 分析 → 翻译 |
| `ai_processing` | 已有内容 | 多格式 | 分析 → 摘要 → 改写 → 小红书 → 翻译 |

**流水线状态机**:

```
pending → running → completed
              ↘→ failed
              ↘→ cancelled
              ↘→ partial（部分成功）
```

---

## 三、设计哲学（Design Philosophy）

### 3.1 本地优先（Local First）

- 所有数据存储在本地 SQLite，不依赖云服务
- 支持离线工作，AI Provider 可配置为本地 Ollama
- 你的内容资产永远属于你自己

### 3.2 AI-Native

- 从架构层面就为 AI 集成设计，而非事后添加
- Agent 是系统的一等公民，不是外接功能
- 工具调用（Tool Calling）是标准交互模式

### 3.3 可组合性（Composability）

- Agent、Skill、Plugin、Pipeline 都是可组合的单元
- 用户可以像搭积木一样构建自己的工作流
- 不引入 LangChain 等重型框架，保持轻量灵活

### 3.4 渐进增强

- 基础功能不依赖 AI（下载、存储、检索）
- AI 能力随配置增强（从 Ollama 本地模型到 GPT-4o）
- 不强制任何特定的 AI Provider

---

## 四、用户场景（Use Cases）

### 场景 1: 社交媒体内容监控与再加工

```
用户: 监控 Twitter 上某个话题，自动采集相关内容
       ↓
ContentForge: 通过 Twitter Plugin 定时采集推文
       ↓
用户: 在 Chat 中对这些推文进行对话分析
       ↓
ContentForge: Agent 关联推文资产，进行主题分析
       ↓
用户: 将分析结果转成小红书文案
       ↓
ContentForge: Pipeline 执行翻译+摘要+小红书转换
```

### 场景 2: YouTube 视频深度分析

```
用户: 输入 YouTube URL
       ↓
ContentForge: 下载视频 + 提取字幕
       ↓
用户: "这个视频的核心观点是什么？"
       ↓
ContentForge: Agent 读取字幕资产，生成摘要
       ↓
用户: "转成中文并生成一份结构化笔记"
       ↓
ContentForge: Pipeline 执行翻译+摘要+笔记格式化
       ↓
用户: "基于这个视频和另外2个视频，生成 PPT"
       ↓
ContentForge: 多资产关联 + RAG 问答 + Slide 生成
```

### 场景 3: RSS 聚合与日报生成

```
用户: 配置 RSS Feed 列表
       ↓
ContentForge: 定时采集文章，自动摘要
       ↓
用户: "给我今天的摘要日报"
       ↓
ContentForge: Agent 聚合当日文章，生成日报
       ↓
用户: "把日报转成小红书格式发布"
       ↓
ContentForge: Pipeline 执行格式转换
```

---

## 五、相关文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 架构总览 | [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) | 系统架构、技术栈、模块边界 |
| 模块状态 | [02-MODULE-STATUS.md](02-MODULE-STATUS.md) | 各模块功能、已完成/未完成 |
| Plugin 系统 | [03-PLUGIN-SYSTEM.md](03-PLUGIN-SYSTEM.md) | Plugin 架构设计 |
| Skill 系统 | [04-SKILL-SYSTEM.md](04-SKILL-SYSTEM.md) | Skill 定义与执行 |
| 内容生命周期 | [05-CONTENT-LIFECYCLE.md](05-CONTENT-LIFECYCLE.md) | ContentUnit 生命周期 |
| 路线图 | [06-ROADMAP.md](06-ROADMAP.md) | 开发计划与里程碑 |
| 术语表 | [07-TERMINOLOGY.md](07-TERMINOLOGY.md) | 术语定义 |
