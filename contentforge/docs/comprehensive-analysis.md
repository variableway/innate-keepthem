# ContentForge 项目重新分析与综合方案

> **日期**: 2026-07-11  
> **分析范围**: GitHub Top 20 相关仓库调研 + AI 对话窗口主工作区方案  
> **目标平台**: macOS 优先

---

## 📋 目录

1. [项目现状回顾](#1-项目现状回顾)
2. [GitHub Top 20 仓库调研总结](#2-github-top-20-仓库调研总结)
3. [AI 对话窗口主工作区方案](#3-ai-对话窗口主工作区方案)
4. [Skill 系统文件结构建议](#4-skill-系统文件结构建议)
5. [综合执行计划](#5-综合执行计划)
6. [附录：调研报告索引](#6-附录调研报告索引)

---

## 1. 项目现状回顾

### 1.1 当前架构

ContentForge 已从原始的 YouTube 下载工具演进为内容创作平台：

```
ContentForge/
├── cli/                    # Go CLI 入口
│   └── main.go
├── core/                   # Python 核心引擎
│   ├── contentforge/
│   │   ├── ingestion/      # 采集域
│   │   ├── processing/     # 处理域
│   │   ├── pipeline/       # Pipeline 引擎
│   │   ├── publishing/     # 发布域
│   │   └── config/         # 配置管理
│   └── tests/
├── desktop/                # Tauri v2 + Next.js 桌面端
│   ├── src-tauri/          # Rust 后端
│   └── src/                # Next.js 前端
├── web/                    # Express + WebSocket Web 端
│   └── server/
├── extension/              # Chrome 扩展
└── docs/                   # 文档
```

### 1.2 已验证能力

| 能力 | 状态 | 说明 |
|------|------|------|
| Go CLI 编译 | ✅ | `go build` 成功 |
| Python 核心引擎 | ✅ | 43 个文件，9 Go + 27 Python |
| FFmpeg 集成 | ✅ | 视频处理可用 |
| agent-reach 安装 | ✅ | 社交媒体采集可用 |
| Skill 注册 | ✅ | `~/.agents/skills/contentforge/` |

---

## 2. GitHub Top 20 仓库调研总结

### 2.1 调研方法

使用 GitHub Search API，按关键词搜索并排序：
- "AI content creation automation"
- "social media automation agent"
- "AI video editing pipeline"
- "content pipeline automation"
- "AI agent content generation"

获取 Top 20 仓库，分 4 组并行深入调研。

### 2.2 核心发现总览

| 排名 | 仓库 | Stars | 核心定位 | 与 CF 集成价值 |
|------|------|-------|----------|---------------|
| 1 | awesome-n8n-templates | 23,799 | n8n 工作流模板库 | ⭐⭐⭐⭐⭐ 自动化分发 |
| 2 | Toonflow-app | 11,331 | AI 短剧/视频生成 | ⭐⭐⭐⭐⭐ 文本→视频 |
| 3 | ai-marketing-skills | 2,822 | AI 营销技能框架 | ⭐⭐⭐⭐⭐ 质量评分 |
| 4 | xhs_ai_publisher | 2,016 | 小红书 AI 发布 | ⭐⭐⭐⭐ 中文分发 |
| 5 | apify-mcp-server | 1,800 | Web 数据抓取 MCP | ⭐⭐⭐⭐ 竞品监控 |
| 6 | locoagent | 1,027 | 社交媒体 AI Agent | ⭐⭐⭐⭐ 工作流引擎 |
| 7 | social-push | 487 | AI 社交发布 Skill | ⭐⭐⭐⭐⭐ Markdown工作流 |
| 8 | gemini-youtube-automation | 299 | YouTube 全自动管道 | ⭐⭐⭐⭐⭐ 视频生产 |
| 9 | content-pipeline | 200 | Claude Code 内容管道 | ⭐⭐⭐⭐ 中文创作者 |
| 10 | SemantiClip | 80 | 视频→博客 Agent | ⭐⭐⭐⭐⭐ Agent编排 |

### 2.3 关键洞察

#### 洞察 1: 多 Agent 编排已成主流
- Microsoft Content Generation Accelerator 的 HandoffBuilder
- NVIDIA Content Agents 的 4-Agent 协作模式
- SemantiClip 的 Semantic Kernel Process Builder
- **→ ContentForge 应自研轻量 Agent 框架，而非引入 LangChain**

#### 洞察 2: CLI + Skill 是内容工具新范式
- content-pipeline（Skill 驱动）
- wonda（CLI 驱动）
- ai-marketing-skills（Claude Code Skill）
- **→ ContentForge 的 Skill 系统方向正确，需继续深化**

#### 洞察 3: Markdown 即配置的设计理念
- social-push 的平台发布流程 = Markdown 文件
- 新增平台只需写一个 Markdown，扩展成本极低
- **→ ContentForge 的 Pipeline Preset 可采用类似设计**

#### 洞察 4: 视频内容再生产是蓝海
- Toonflow-app: 小说→动画短剧
- gemini-youtube-automation: 全自动 YouTube 视频
- ai-mixed-cut: "解构-重构"爆款视频
- **→ 结合 vYtDL 下载能力，构建"下载→分析→再创作"闭环**

### 2.4 推荐集成优先级

```
P0 (立即行动):
├── social-push          → 中文平台分发能力
├── ai-marketing-skills  → 内容质量评分体系
└── SemantiClip          → Agent 工作流编排参考

P1 (1-2月):
├── gemini-youtube-automation → 视频再生产能力
├── content-pipeline     → 中文创作者工作流
└── apify-mcp-server     → 竞品/热点数据采集

P2 (3-6月):
├── Toonflow-app         → AI 视频生成
├── locoagent            → 社交媒体自动化引擎
└── awesome-n8n-templates → 工作流自动化

P3 (长期观察):
├── undetectable-fingerprint-browser → 反检测浏览器
└── BotLibre             → 传统 Bot（价值较低）
```

---

## 3. AI 对话窗口主工作区方案

### 3.1 核心设计理念

将 AI 对话窗口作为 ContentForge 的**主工作区**，用户通过自然语言与内容资产交互，Agent 自动调用 ContentForge 内部工具完成端到端任务。

```
┌─────────────────────────────────────────────────────────────────┐
│                    ContentForge AI Workspace                     │
├─────────────────────────────────────────────────────────────────┤
│  +──────────+  +──────────────────────────+  +──────────────+  │
│  │ Context  │  │      Chat Panel          │  │   Agent      │  │
│  │ Panel    │  │  (对话主区域)             │  │  Selector    │  │
│  │(内容资产) │  │                          │  │ (Agent切换)  │  │
│  +──────────+  │  用户: 分析这个视频...    │  +──────────────+  │
│                │                          │                    │
│  [视频列表]    │  Agent: 正在分析...       │  [内容分析师]    │
│  [文章列表]    │  [Tool: analyze] 运行中   │  [改写专家]      │
│  [任务列表]    │                          │  [发布助手]      │
│                │  ✅ 分析完成              │  [流水线执行器]  │
│                │  主题: AI, ML, Python    │                    │
│                │  情感: Positive (0.85)   │  [通用助手]      │
│                │                          │                    │
│                │  用户: 改写成小红书风格   │                    │
│                │                          │                    │
│                │  [输入框] [附件] [发送]   │                    │
│  +──────────+  +──────────────────────────+  +──────────────+  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 架构设计

```
+----------------------------------------------------------------+
|                        Frontend (Next.js)                       |
|  Chat UI | Context Panel | Agent Selector | Tool Cards          |
+----------------------------+-----------------------------------+
|                        Zustand Stores                           |
|  chatStore | assetStore | agentStore | toolCallStore            |
+----------------------------+-----------------------------------+
|                    API Client (IPC/HTTP)                        |
+----------------------------+-----------------------------------+
|  Python AI Chat Engine  |  Python Core  |  Rust Backend (Tauri) |
|  - Agent Registry       │  - Ingestion  │  - SQLite DB          |
|  - Agent Router         │  - Processing │  - Event Emitter      |
|  - Context Manager      │  - Pipeline   │  - File System        |
|  - Tool Executor        │  - Publishing │                       |
|  - Session Manager      │               │                       |
+----------------------------------------------------------------+
```

### 3.3 AI Agent 系统设计

#### Agent 角色定义

| Agent ID | 名称 | 职责 | 专属工具 |
|----------|------|------|----------|
| `content_analyst` | 内容分析师 | 分析内容结构、提取要点 | `analyze`, `extract_keywords` |
| `summarizer` | 摘要专家 | 生成多风格摘要 | `summarize`, `chunk_text` |
| `rewriter` | 改写专家 | 改写风格、翻译、润色 | `rewrite`, `xiaohongshu_convert` |
| `publisher` | 发布助手 | 格式转换、发布准备 | `publish`, `generate_markdown` |
| `pipeline_runner` | 流水线执行器 | 执行预设 Pipeline | `run_pipeline`, `list_presets` |
| `general` | 通用助手 | 问答、建议、导航 | `search_assets`, `get_asset_detail` |

#### ReAct Loop 架构

```
User Query → Agent Router → Intent Recognition → Agent Selection
                                    ↓
              ┌─────────────────────────────────────┐
              │         Agent Core (ReAct)           │
              │  Thought → Action → Observation      │
              │     ↓        ↓           ↓           │
              │  推理    工具调用      结果处理      │
              └─────────────────────────────────────┘
                                    ↓
              Streaming Response → Tool Cards → Final Answer
```

### 3.4 技术选型决策

| 层级 | 推荐方案 | 理由 |
|------|----------|------|
| LLM 接口层 | 原生 OpenAI/Claude API（复用现有 AIEngine） | ContentForge 已有成熟多 Provider 抽象 |
| 工具调用层 | OpenAI Function Calling Schema | 标准兼容，Claude/Ollama 均可适配 |
| Agent 编排层 | **自研轻量框架**（基于 ReAct） | 与现有 PipelineEngine 风格一致，可控 |
| 上下文管理层 | 自研 ContextBudget + RAG | 基于现有 Asset Store，Token 预算管理 |
| 未来预留 | MCP Protocol 适配接口 | 工具标准化，跨模型兼容 |

**关键决策：不复用 LangChain**。ContentForge 已有清晰的 Pipeline 抽象和 AIEngine，引入 LangChain 会造成概念重叠。

### 3.5 数据库 Schema 扩展

```sql
-- 新增：chat_sessions 表
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    agent_id TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'active',
    linked_task_id TEXT,
    linked_asset_ids TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 新增：chat_messages 表
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,  -- user | assistant | system | tool
    content TEXT NOT NULL,
    tool_calls TEXT,     -- JSON array
    tool_results TEXT,   -- JSON array
    selected_asset_ids TEXT DEFAULT '[]',
    tokens_used INTEGER,
    model TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

-- 新增：content_assets 表（统一资产模型）
CREATE TABLE content_assets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,  -- video | article | tweet | audio | image
    title TEXT,
    source_url TEXT,
    source_platform TEXT,
    file_path TEXT,
    extracted_text TEXT,
    summary TEXT,
    transcript TEXT,
    language TEXT,
    duration_sec REAL,
    status TEXT DEFAULT 'ingested',
    metadata TEXT DEFAULT '{}',
    tags TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.6 实现里程碑

| 阶段 | 周期 | 目标 | 交付物 |
|------|------|------|--------|
| **M1: MVP 基础对话** | 4 周 | 基础聊天 UI + 通用 Agent | 可对话的聊天窗口 |
| **M2: Agent 系统** | 3 周 | 6 个 Agent 角色 + 路由 | 可切换 Agent |
| **M3: 工具调用** | 3 周 | 10+ 工具 + 工具卡片 UI | Agent 可操作内容 |
| **M4: 上下文增强** | 2 周 | 资产关联 + Token 预算 | 对话可引用内容 |
| **M5: 多模态** | 2 周 | 图片/视频片段输入 | 支持多媒体对话 |
| **M6: 高级功能** | 持续 | MCP 集成、团队协作 | 企业级功能 |

---

## 4. Skill 系统文件结构建议

### 4.1 推荐结构

```
~/.agents/skills/contentforge/
├── SKILL.md                          # 主 Skill 定义
├── README.md                         # 使用说明
├── references/
│   ├── architecture.md               # 架构文档
│   ├── api-reference.md              # API 参考
│   └── troubleshooting.md            # 故障排除
├── templates/
│   ├── pipeline-presets/             # Pipeline 预设模板
│   │   ├── twitter-to-xiaohongshu.md
│   │   ├── youtube-to-notes.md
│   │   ├── rss-to-digest.md
│   │   └── web-to-summary.md
│   ├── agent-prompts/                # Agent 系统提示词模板
│   │   ├── content_analyst.md
│   │   ├── summarizer.md
│   │   ├── rewriter.md
│   │   └── publisher.md
│   └── platform-workflows/           # 平台发布工作流 (借鉴 social-push)
│       ├── xiaohongshu-image.md
│       ├── xiaohongshu-long.md
│       ├── twitter-post.md
│       ├── zhihu-idea.md
│       └── weibo-post.md
├── scripts/
│   ├── setup-macos.sh                # macOS 环境安装
│   ├── setup-windows.ps1             # Windows 环境安装
│   ├── health-check.py               # 健康检查
│   └── migrate-db.py                 # 数据库迁移
└── assets/
    └── icons/                        # Skill 图标
```

### 4.2 Pipeline Preset 模板示例

```markdown
---
id: twitter-to-xiaohongshu
name: Twitter 转小红书
description: 将 Twitter 内容采集并转换为小红书风格文案
version: 1.0.0
author: ContentForge
---

# Twitter 转小红书 Pipeline

## 输入
- source: twitter_url
- type: url

## 步骤
1. **采集** (`scrape`)
   - 平台: twitter
   - 输出: raw_tweet

2. **分析** (`analyze`)
   - 模式: ai
   - 提取: 主题、关键词、情感
   - 输出: analysis_report

3. **改写** (`rewrite`)
   - 目标平台: xiaohongshu
   - 风格: 种草、emoji、分段
   - 最大长度: 800 字
   - 输出: xiaohongshu_draft

4. **质量评分** (`score`)
   - 标准: 吸引力、可读性、平台适配度
   - 阈值: 85 分
   - 低于阈值: 返回步骤 3 重新改写

5. **发布准备** (`prepare`)
   - 格式: xiaohongshu
   - 生成封面图提示词
   - 输出: publish_package

## 输出
- type: xiaohongshu_package
- 包含: 文案、封面提示词、推荐标签
```

### 4.3 Agent Prompt 模板示例

```markdown
---
id: content_analyst
name: 内容分析师
model: gpt-4o-mini
temperature: 0.3
---

# 内容分析师 Agent

## 角色定义
你是 ContentForge 的内容分析专家，擅长从文本、视频转录、社交媒体帖子中提取结构化洞察。

## 能力
- 主题提取与分类
- 关键词识别
- 情感分析
- 内容质量评估
- 结构与逻辑分析

## 工具
- `analyze`: 深度分析内容
- `extract_keywords`: 提取关键词
- `detect_language`: 检测语言

## 输出格式
```json
{
  "topics": ["主题1", "主题2"],
  "keywords": ["关键词1", "关键词2"],
  "sentiment": {"score": 0.85, "label": "positive"},
  "summary": "内容摘要...",
  "quality_score": 88,
  "suggestions": ["改进建议1"]
}
```
```

---

## 5. 综合执行计划

### 5.1 第一阶段：基础夯实（1-2 月）

```
Week 1-2: 环境完善
├── 完善 macOS 开发环境脚本
├── 设置 CI/CD (GitHub Actions)
└── 补充核心模块单元测试

Week 3-4: AI Chat MVP
├── 实现基础 Chat UI (Next.js)
├── 实现通用 Agent (general)
├── 集成现有 AIEngine
└── 数据库 Schema 迁移

Week 5-6: Agent 系统
├── 实现 Agent Registry
├── 实现 Agent Router
├── 定义 6 个 Agent 角色
└── 实现 Agent 切换 UI

Week 7-8: 工具调用
├── 实现 Tool Executor
├── 集成 10 个核心工具
├── 实现工具卡片 UI
└── 流式响应支持
```

### 5.2 第二阶段：能力扩展（3-4 月）

```
Month 3: 内容分发集成
├── 集成 social-push 工作流理念
├── 实现小红书/X/知乎发布适配器
├── 设计 Markdown 即配置的平台扩展机制
└── 集成 xhs_ai_publisher 参考实现

Month 4: 视频再生产
├── 集成 gemini-youtube-automation 视频生成
├── 实现"解构-重构"视频混剪 (参考 ai-mixed-cut)
├── 评估 Toonflow-app 集成可行性
└── 构建视频内容闭环
```

### 5.3 第三阶段：智能化（5-6 月）

```
Month 5: 质量与优化
├── 集成 ai-marketing-skills 质量评分
├── 实现 Expert Panel 递归评分
├── 集成 A/B 测试框架
└── 实现内容效果追踪

Month 6: 高级功能
├── MCP Protocol 适配
├── 多模态输入（图片、视频片段）
├── 团队协作功能
└── 性能优化与监控
```

### 5.4 技术栈总结

| 层级 | 技术 | 说明 |
|------|------|------|
| CLI | Go 1.24+ | 入口与命令编排 |
| 核心引擎 | Python 3.11+ | 采集、处理、Pipeline |
| 桌面端 | Tauri v2 + Next.js + React 19 | 主工作区 |
| Web 端 | Express + WebSocket | 远程访问 |
| AI 对话 | 自研 ReAct + Function Calling | 轻量 Agent 框架 |
| 数据库 | SQLite (桌面) / PostgreSQL (Web) | 数据持久化 |
| 视频处理 | FFmpeg + MoviePy | 视频编辑与生成 |
| 浏览器自动化 | Playwright + CDP | 社交媒体交互 |
| Skill 系统 | Markdown + YAML Frontmatter | 配置即代码 |

---

## 6. 附录：调研报告索引

### 6.1 已生成文档

| 文档 | 路径 | 说明 |
|------|------|------|
| GitHub 仓库列表 | `github_top20_repos.json` | Top 20 仓库元数据 |
| 分组调研报告 1 | `docs/research/github_research_group_1.md` | n8n/Toonflow/ai-marketing/xhs/apify |
| 分组调研报告 2 | `docs/research/github_research_group_2.md` | locoagent/UFB/BotLibre/social-push/gemini-yt |
| 分组调研报告 3 | `docs/research/github_research_group_3.md` | Microsoft/OrangeViolin/CrawlAI/NVIDIA/wonda |
| 分组调研报告 4 | `docs/research/github_research_group_4.md` | ReplyGuy/HiFox/AgentoAI/ai-mixed-cut/SemantiClip |
| AI 对话窗口方案 | `docs/ai-chat-workspace-design.md` | 完整技术方案 (1197 行) |
| 本综合文档 | `docs/comprehensive-analysis.md` | 本文档 |

### 6.2 参考仓库链接

1. [awesome-n8n-templates](https://github.com/enescingoz/awesome-n8n-templates) - 工作流自动化
2. [Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) - AI 短剧生成
3. [ai-marketing-skills](https://github.com/ericosiu/ai-marketing-skills) - 营销技能框架
4. [xhs_ai_publisher](https://github.com/BetaStreetOmnis/xhs_ai_publisher) - 小红书发布
5. [apify-mcp-server](https://github.com/apify/apify-mcp-server) - Web 数据抓取
6. [locoagent](https://github.com/LocoreMind/locoagent) - 社交媒体 Agent
7. [social-push](https://github.com/jihe520/social-push) - AI 社交发布 Skill
8. [gemini-youtube-automation](https://github.com/ChaitanyaEswarRajeshJakki/gemini-youtube-automation) - YouTube 自动化
9. [content-pipeline](https://github.com/OrangeViolin/content-pipeline) - Claude Code 内容管道
10. [SemantiClip](https://github.com/vicperdana/SemantiClip) - 视频→博客 Agent

---

> **下一步建议**: 进入 Phase 1 实施，优先完成 M1（MVP 基础对话）和 social-push 工作流集成验证。
