# ContentForge 转型：完全冲击分析与规划

> 本文档是对 vYtDL → ContentForge 转型的完整分析，整合项目规划、仓库技术评估和冲击影响评估，作为项目执行的单一真实来源。

---

## 一、执行摘要

### 1.1 决策结论

**建议：执行转型，方向确认，但需要分阶段验证。**

vYtDL 作为 YouTube 下载工具已触及天花板。转型为 **ContentForge（社交媒体内容获取→处理→发布工具链）** 的决策具有战略价值，但需要尊重以下约束：

| 维度 | 判断 |
|------|------|
| **技术可行性** | ✅ 可行 — agent-reach 提供现成的采集基础设施，last30days 提供处理方法论，两者都是成熟开源项目 |
| **时间可行性** | ⚠️ 需要 12-16 周完成首个可用版本（MVP），不是 2-3 周的短期项目 |
| **资源可行性** | ⚠️ 需要额外的 AI API 预算（Groq 免费，OpenAI 按需）和 Python 运行时 |
| **回退安全** | ✅ 高 — 现有下载功能零破坏，新增功能可 Feature Flag 控制 |

### 1.2 核心发现

- **agent-reach** 可覆盖 ContentForge 采集域 80% 以上的需求，直接作为子进程依赖集成
- **last30days-skill** 不能直接导入，但其评分/聚类/合成算法值得移植到处理域
- 现有 vYtDL 架构（Tauri + Next.js + Rust + SQLite）无需推倒重来，只需扩展而非替换
- 最关键的技术决策是：**Go CLI 如何调用 Python 依赖（agent-reach）** — 子进程方案是务实选择

---

## 二、当前状态分析（As-Is）

### 2.1 现有架构审计

| 组件 | 技术栈 | 状态 | 复用度 |
|------|--------|------|--------|
| **CLI** | Go 1.24 + Cobra + Bubble Tea | 稳定，功能完整 | 扩展新命令，核心不变 |
| **Desktop** | Tauri v2 + Next.js + React 19 + Tailwind | 稳定，下载队列+设置页面 | 扩展新页面+组件 |
| **Web Server** | Node.js + Express + WebSocket + better-sqlite3 | 稳定，Docker 部署 | 扩展新 API 端点 |
| **Chrome 扩展** | Manifest V3 + Vanilla JS | 功能单一（URL 提取） | 扩展为内容采集器 |
| **下载引擎** | yt-dlp 子进程 | 核心能力 | 不变，扩展转录能力 |
| **数据库** | SQLite（downloads + settings 表） | 稳定 | 扩展新表 |
| **队列** | Rust Tokio / Node.js Map | 稳定 | 扩展新任务类型 |
| **i18n** | 自定义 React Context + JSON 文件 | 5+ 语言 | 扩展新文案 |
| **构建** | pnpm monorepo | 稳定 | 不变 |

### 2.2 现有代码规模估算

```
vYtDL/                      (Go CLI)
├── ~30 Go 文件
├── ~5,000 行 Go 代码
├── 依赖: cobra, bubbletea, lipgloss, yt-dlp

vYtDL-desktop/              (Tauri + Next.js)
├── apps/desktop/src/         ~80 TS/React 文件
├── packages/ui/              ~20 组件
├── packages/utils/           ~10 工具
├── src-tauri/src/            ~15 Rust 文件
├── web-server/               ~10 Node.js 文件
├── ~15,000 行 TS/JS + ~3,000 行 Rust

url-extractor/              (Chrome Extension)
├── ~5 文件，~500 行 JS

总计：~24,000 行代码（Go + TS/JS + Rust）
```

### 2.3 现有功能清单

- [x] 单视频下载（YouTube）
- [x] 批量下载（URL 列表 + .txt 导入）
- [x] 智能模式（playlist 自动检测）
- [x] 下载队列（并发控制、取消、恢复）
- [x] 字幕提取（VTT 解析）
- [x] 下载记录（JSON/CSV 导出）
- [x] 跨平台桌面应用（macOS/Linux/Windows）
- [x] Web 部署（Docker）
- [x] Chrome 扩展 URL 提取
- [x] i18n 多语言

### 2.4 现有技术债务

| 债务项 | 影响 | 处理建议 |
|--------|------|----------|
| `tauriStorage` TS 类型与 Zustand 不兼容 | 构建警告 | 转型期一并修复 |
| 无单元测试覆盖（Rust 端） | 质量风险 | 新增模块必须补测试 |
| yt-dlp 需外部配置 | 用户体验 | 自动检测 + 配置引导 |
| 无 API 版本控制 | 扩展风险 | 新增 API 必须版本化 |
| 硬编码平台限制（仅 YouTube） | 架构约束 | 抽象为通用下载器 |

---

## 三、目标状态设计（To-Be）

### 3.1 ContentForge 定位

**一句话：** 从任意社交媒体获取内容，通过 AI 处理转化为适合任意平台发布的内容，支持视频/音频/文本全链路。

**核心价值主张：** 内容创作者的时间节省工具 — 把"浏览 50 条推文 → 手写笔记 → 改写文案 → 排版发布"压缩为"一键流水线"。

### 3.2 目标架构全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户界面层                                    │
├─────────────────────────────────────────────────────────────────────┤
│  CLI (Go) │ Desktop (Tauri+Next) │ Web (Express+Next) │ Chrome Ext │
│  ─────────────────────────────────────────────────────────────────  │
│  新增命令: scrape, process, publish, pipeline, workflow           │
│  新增页面: 采集中心, 处理工坊, 发布台, 工作流编排器                   │
├─────────────────────────────────────────────────────────────────────┤
│                         应用编排层                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Pipeline Engine — 内容流水线编排（DAG 任务流）                    │ │
│  │  • 预设流水线：Twitter→小红书, YouTube→笔记, RSS→摘要           │ │
│  │  • 自定义流水线：拖拽/表单配置                                    │ │
│  │  • 状态追踪：每步输入输出、失败重试、断点续传                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Workflow Engine — 自动化工作流                                   │ │
│  │  • 定时触发：cron 式内容采集                                     │ │
│  │  • 条件触发：新视频发布 → 自动转录 → 生成摘要                     │ │
│  │  • 批量处理：100 条 URL 批量采集+处理                             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Plugin Manager — 插件系统                                        │ │
│  │  • Provider Plugin：AI 提供商（OpenAI/Claude/Ollama）            │ │
│  │  • Channel Plugin：采集平台（Twitter/XHS/YouTube/Web）           │ │
│  │  • Action Plugin：发布动作（Notion/XHS/Weibo/Markdown）          │ │
│  └──────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                         领域服务层                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ 采集域        │ │ 处理域        │ │ 编辑域        │ │ 发布域   │ │
│  │ ──────────── │ │ ──────────── │ │ ──────────── │ │ ──────── │ │
│  │ Scraper      │ │ Extractor    │ │ VideoEditor  │ │ Publisher│ │
│  │ Downloader   │ │ Summarizer   │ │ SubtitleEdit │ │ Scheduler│ │
│  │ Parser       │ │ Converter    │ │ AudioEditor  │ │ Tracker  │ │
│  │ Importer     │ │ Analyzer     │ │ Transcoder   │ │ Exporter │ │
│  │              │ │ Translator   │ │              │ │          │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                         基础设施层                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ AI Engine     │ │ Queue Manager│ │ Storage      │ │ Config   │ │
│  │ ──────────── │ │ ──────────── │ │ ──────────── │ │ Manager  │ │
│  │ OpenAI Prov  │ │ Task Queue   │ │ Content DB   │ │ Settings │ │
│  │ Claude Prov  │ │ Concurrency  │ │ File Store   │ │ Profiles │ │
│  │ Ollama Prov  │ │ Priority     │ │ Cache        │ │ Secrets  │ │
│  │ Custom Prov  │ │ Retry        │ │ Audit Log    │ │          │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                         外部适配层                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐ │
│  │ agent-reach   │ │ YouTube      │ │ Notion       │ │ Xiaohong │ │
│  │ (15+ 平台)   │ │ (yt-dlp)    │ │ API         │ │ shu      │ │
│  │ twitter-cli   │ │              │ │              │ │ OpenCLI  │ │
│  │ opencli       │ │              │ │              │ │ MCP      │ │
│  │ jina-reader  │ │              │ │              │ │          │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 目标数据模型

```typescript
// 核心内容单元 — 贯穿采集→处理→编辑→发布全生命周期
interface ContentUnit {
  id: string;                          // UUID
  source: {
    platform: string;                  // twitter, youtube, web, xiaohongshu...
    url: string;
    author?: string;
    publishedAt?: Date;
    engagement?: {                    // 互动数据
      likes: number;
      replies: number;
      reposts: number;
      views: number;
    };
  };
  type: 'video' | 'article' | 'tweet' | 'thread' | 'audio' | 'image' | 'note';
  rawData: {                           // 原始内容
    text?: string;
    mediaUrls?: string[];
    binaryPath?: string;              // 本地文件路径
  };
  extractedText: string;              // 提取/转录的纯文本
  metadata: {
    title: string;
    description: string;
    language: string;
    duration?: number;                 // 视频/音频时长（秒）
    wordCount?: number;
    tags: string[];
  };
  processing: {                        // 处理后的数据
    summary?: string;
    keyPoints?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    topics: string[];
    translatedText?: string;
    rewrittenText?: string;          // 风格改写后的文本
  };
  status: 'ingested' | 'processing' | 'processed' | 'editing' | 'ready' | 'published' | 'failed';
  pipelineId?: string;                // 所属流水线
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 流水线定义
interface Pipeline {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  trigger: 'manual' | 'scheduled' | 'webhook';
  schedule?: string;                  // cron 表达式
  inputConfig: {                     // 输入配置
    source: string;                  // 平台或 URL 模式
    filters?: {                      // 过滤条件
      minEngagement?: number;
      keywords?: string[];
      excludeKeywords?: string[];
      dateRange?: [Date, Date];
    };
  };
  outputConfig: {                    // 输出配置
    format: string;
    destination: string;
    schedule?: Date;                // 定时发布
  };
  enabled: boolean;
  lastRunAt?: Date;
  runCount: number;
  failCount: number;
  createdAt: Date;
}

interface PipelineStep {
  id: string;
  type: 'ingest' | 'extract' | 'summarize' | 'translate' | 'rewrite' | 'edit' | 'publish' | 'custom';
  config: Record<string, any>;       // 步骤配置
  inputMapping: { [key: string]: string }; // 输入映射（上一步输出 → 当前步骤输入）
  outputMapping: { [key: string]: string }; // 输出映射
  retryPolicy: {
    maxRetries: number;
    backoff: 'fixed' | 'exponential';
    delay: number;                  // 毫秒
  };
  condition?: string;                // 条件执行（如：上一步输出长度 > 100）
  timeout: number;                  // 毫秒
}

// 运行记录
interface PipelineRun {
  id: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';
  startedAt: Date;
  completedAt?: Date;
  steps: StepRun[];
  inputUnits: string[];            // ContentUnit IDs
  outputUnits: string[];
  logs: string[];
  error?: string;
}

// 发布配置
interface PublishProfile {
  id: string;
  name: string;
  platform: 'xiaohongshu' | 'twitter' | 'weibo' | 'notion' | 'obsidian' | 'markdown';
  credentials: Record<string, string>; // 加密存储
  defaultFormat: string;
  defaultTemplate: string;          // 发布模板
  autoPublish: boolean;             // 是否自动发布（false = 草稿）
  maxLength?: number;               // 字数限制（如小红书 1000 字）
  imageConfig?: {                   // 图片配置
    width: number;
    height: number;
    template: string;
  };
}
```

### 3.4 数据库 Schema 扩展

```sql
-- 新增表（基于现有 SQLite 架构扩展）

-- 内容单元表（核心）
CREATE TABLE content_units (
  id TEXT PRIMARY KEY,
  source_platform TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_author TEXT,
  source_published_at TIMESTAMP,
  type TEXT NOT NULL CHECK(type IN ('video','article','tweet','thread','audio','image','note')),
  title TEXT,
  description TEXT,
  extracted_text TEXT,
  summary TEXT,
  key_points TEXT, -- JSON array
  sentiment TEXT CHECK(sentiment IN ('positive','neutral','negative')),
  topics TEXT, -- JSON array
  translated_text TEXT,
  rewritten_text TEXT,
  status TEXT NOT NULL DEFAULT 'ingested',
  pipeline_id TEXT,
  tags TEXT, -- JSON array
  raw_metadata TEXT, -- JSON blob
  engagement_likes INTEGER DEFAULT 0,
  engagement_replies INTEGER DEFAULT 0,
  engagement_reposts INTEGER DEFAULT 0,
  engagement_views INTEGER DEFAULT 0,
  file_path TEXT, -- 本地存储路径
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
);

-- 流水线表
CREATE TABLE pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  steps TEXT NOT NULL, -- JSON PipelineStep[]
  trigger TEXT NOT NULL DEFAULT 'manual',
  schedule TEXT,
  input_config TEXT NOT NULL, -- JSON
  output_config TEXT NOT NULL, -- JSON
  enabled INTEGER DEFAULT 1,
  last_run_at TIMESTAMP,
  run_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 流水线运行记录
CREATE TABLE pipeline_runs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  steps TEXT, -- JSON StepRun[]
  input_unit_ids TEXT, -- JSON array
  output_unit_ids TEXT, -- JSON array
  logs TEXT, -- JSON array
  error TEXT,
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
);

-- 发布配置表
CREATE TABLE publish_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  credentials TEXT, -- 加密 JSON
  default_format TEXT,
  default_template TEXT,
  auto_publish INTEGER DEFAULT 0,
  max_length INTEGER,
  image_config TEXT, -- JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 发布历史
CREATE TABLE publish_history (
  id TEXT PRIMARY KEY,
  content_unit_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL, -- pending, published, failed
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  platform_post_id TEXT, -- 发布后的平台 ID
  platform_url TEXT,
  error TEXT,
  FOREIGN KEY (content_unit_id) REFERENCES content_units(id),
  FOREIGN KEY (profile_id) REFERENCES publish_profiles(id)
);

-- 扩展现有 downloads 表（保持向后兼容）
ALTER TABLE downloads ADD COLUMN content_unit_id TEXT REFERENCES content_units(id);
ALTER TABLE downloads ADD COLUMN is_content_forge INTEGER DEFAULT 0; -- 标记是否为 CF 任务
```

---

## 四、差距分析（Gap Analysis）

### 4.1 能力差距矩阵

| 能力 | 当前状态 | 目标状态 | 差距 | 填补方式 |
|------|----------|----------|------|----------|
| **Twitter 采集** | ❌ 无 | ✅ 读推文、时间线、搜索 | 🔴 大 | agent-reach 子进程调用 |
| **小红书采集** | ❌ 无 | ✅ 读笔记、搜索、评论 | 🔴 大 | agent-reach OpenCLI |
| **通用网页抓取** | ❌ 无 | ✅ 任意 URL → Markdown | 🟡 中 | Jina Reader HTTP API |
| **音频转文本** | ⚠️ 仅 VTT 字幕 | ✅ 任意视频音频转录 | 🟡 中 | agent-reach transcribe |
| **AI 摘要** | ❌ 无 | ✅ 长文本摘要、Bullet points | 🔴 大 | AI Engine + OpenAI API |
| **风格改写** | ❌ 无 | ✅ 推文→小红书、口语→书面 | 🔴 大 | AI Engine 提示工程 |
| **小红书文案格式** | ❌ 无 | ✅ 表情、标签、字数优化 | 🟡 中 | 模板 + 规则引擎 |
| **视频剪辑** | ❌ 无 | ✅ 裁剪、拼接、转码 | 🟡 中 | FFmpeg 子进程封装 |
| **字幕嵌入/翻译** | ⚠️ 仅提取 | ✅ 嵌入、翻译、格式转换 | 🟡 中 | FFmpeg + Whisper |
| **发布到小红书** | ❌ 无 | ✅ 内容准备+图片合成 | 🔴 大 | OpenCLI / xiaohongshu-mcp |
| **Notion/Obsidian 导出** | ❌ 无 | ✅ Markdown 同步 | 🟢 小 | Notion API / 文件写入 |
| **工作流编排** | ❌ 无 | ✅ DAG 流水线、定时触发 | 🔴 大 | 新开发 Pipeline Engine |
| **多源评分排序** | ❌ 无 | ✅ engagement 评分、聚类 | 🟡 中 | 移植 last30days 算法 |
| **插件系统** | ❌ 无 | ✅ Provider/Channel/Action 插件 | 🟡 中 | 新开发 Plugin Manager |
| **下载队列** | ✅ 已有 | ✅ 复用 | 🟢 无 | 不变 |
| **YouTube 下载** | ✅ 已有 | ✅ 复用 | 🟢 无 | 不变 |
| **SQLite 存储** | ✅ 已有 | ✅ 扩展表 | 🟢 小 | 扩展 Schema |
| **i18n** | ✅ 已有 | ✅ 扩展 | 🟢 小 | 新增翻译键 |

### 4.2 技术差距分析

| 技术栈 | 当前 | 新增 | 集成复杂度 |
|--------|------|------|----------|
| Python 运行时 | ❌ 无 | ✅ 需要 3.10+ | 🔴 高 — Go CLI 需要调用 Python，Docker 镜像变大 |
| agent-reach | ❌ 无 | ✅ pip 安装 | 🟡 中 — 子进程封装，JSON 输出解析 |
| faster-whisper | ❌ 无 | ✅ 可选本地模型 | 🟡 中 — 需要 CUDA/CPU 推理环境 |
| FFmpeg | ✅ 已有（yt-dlp 依赖） | ✅ 扩展用途 | 🟢 低 — 已有，增加调用场景 |
| OpenAI API | ❌ 无 | ✅ 核心依赖 | 🟡 中 — HTTP 调用，需密钥管理 |
| Ollama | ❌ 无 | ✅ 可选本地替代 | 🟢 低 — HTTP API，零配置 |
| Groq API | ❌ 无 | ✅ 免费转录 | 🟢 低 — HTTP API，免费额度 |
| Notion API | ❌ 无 | ✅ 可选 | 🟢 低 — 标准 REST API |
| OpenCLI | ❌ 无 | ✅ 小红书/社交平台 | 🟡 中 — npm 安装 + Chrome 扩展 |
| Playwright | ❌ 无 | ✅ 备选抓取方案 | 🟡 中 — 无头浏览器，资源占用 |

### 4.3 架构差距分析

| 架构维度 | 当前 | 目标 | 差距 |
|----------|------|------|------|
| 数据流 | 单向：URL → 下载 → 文件 | 双向：采集→处理→发布，可循环 | 需要 Pipeline Engine 串联多步骤 |
| 状态机 | 简单：pending→downloading→completed/failed | 复杂：ingested→processing→processed→editing→ready→published | 需要 ContentUnit 生命周期管理 |
| 插件化 | 无 | Provider/Channel/Action 可插拔 | 需要 Plugin Manager 和接口契约 |
| 外部依赖 | yt-dlp 单一 | 15+ 平台工具链 | 需要多后端路由和健康检查 |
| 配置模型 | 简单 JSON（config.json） | 分层配置（global/project/profile） | 需要配置管理升级 |
| 扩展点 | 硬编码 | 插件注册 + 工作流配置 | 需要开放扩展机制 |

---

## 五、冲击分析（Impact Analysis）

### 5.1 技术冲击

#### 5.1.1 对现有代码的冲击

| 现有组件 | 冲击类型 | 冲击程度 | 具体影响 | 缓解措施 |
|----------|----------|----------|----------|----------|
| **Go CLI (`cmd/`)** | 扩展 | 🟡 中 | 新增 4 个子命令（scrape, process, publish, pipeline） | 保持原有命令不变，新增独立命令组 |
| **Go CLI 配置** | 变更 | 🟡 中 | 需要新增 API Key、平台 Cookie、代理配置 | 扩展 config.json 结构，向后兼容 |
| **Rust 命令层 (`commands.rs`)** | 扩展 | 🟡 中 | 新增 IPC 命令（start_pipeline, get_content_units, publish） | 复用现有命令模式，新增独立模块 |
| **Rust 数据库层 (`database.rs`)** | 扩展 | 🟢 低 | 新增表和查询方法 | 使用现有数据库模式，增量添加 |
| **Rust 队列 (`queue.rs`)** | 扩展 | 🟡 中 | 新增 PipelineTask 类型，支持多步骤任务 | 扩展 Task 枚举，复用现有并发模型 |
| **Next.js 页面** | 扩展 | 🟡 中 | 新增 4 个页面（采集、处理、编辑、发布） | 复用 App Router 模式 |
| **Next.js 组件** | 扩展 | 🟡 中 | 新增 ~15 个组件 | 复用 packages/ui 共享组件 |
| **Zustand Store** | 扩展 | 🟢 低 | 新增 contentStore、pipelineStore | 复用现有 store 模式 |
| **API Client (`api-client.ts`)** | 扩展 | 🟢 低 | 新增 pipeline 相关命令 | 复用现有 invoke/listen 模式 |
| **Express 路由** | 扩展 | 🟢 低 | 新增 /api/pipeline/* 端点 | 复用现有路由模式 |
| **SQLite Schema** | 变更 | 🟡 中 | 新增 5 张表，扩展现有 downloads 表 | 迁移脚本 + 版本控制 |
| **Chrome 扩展** | 扩展 | 🟡 中 | 从 URL 提取器扩展为内容采集器 | 新增 content-script 注入 |

#### 5.1.2 对构建系统的冲击

| 冲击项 | 影响 | 应对 |
|--------|------|------|
| Docker 镜像体积增加 | 新增 Python 3.10+ 运行时（~100MB） | 多阶段构建，仅安装运行时 + agent-reach |
| 安装包体积增加 | Desktop 安装包增加 ~50MB（Python 运行时） | 可选安装：基础版（无 AI）vs 完整版 |
| 构建时间增加 | 新增 Python 依赖安装步骤 | 缓存 pip 依赖，CI/CD 优化 |
| 发布流程变更 | 新增 Python 环境验证步骤 | 发布前运行 `agent-reach doctor` 验证 |

#### 5.1.3 对运行时环境的冲击

| 冲击项 | 影响 | 应对 |
|--------|------|------|
| 需要 Python 3.10+ | 用户环境可能不满足 | 自动检测 + 引导安装（类似 agent-reach install） |
| 需要 Node.js 20+（OpenCLI） | 桌面用户需要较新 Node | 自动检测 + 安装引导 |
| 需要 Chrome 扩展（OpenCLI） | 小红书/Twitter 需要 | 提供备选方案（xiaohongshu-mcp 服务器版） |
| AI API 调用延迟 | 摘要/改写需要 1-5 秒 | 异步处理，队列管理，进度反馈 |
| 网络代理需求 | 中国大陆用户需要代理 | 内置代理配置，自动检测 |
| 磁盘空间增加 | 转录文件、缓存、本地模型 | 自动清理策略，用户配置保留天数 |

### 5.2 业务冲击

#### 5.2.1 用户群体变化

| 维度 | 当前（vYtDL） | 目标（ContentForge） | 冲击 |
|------|-------------|----------------------|------|
| **核心用户** | 视频下载需求者 | 内容创作者/社交媒体运营 | 用户画像拓宽，需要新 UX |
| **使用场景** | "下载这个视频" | "把 Twitter 内容变成小红书笔记" | 场景复杂度增加，需要引导 |
| **用户技能** | 懂 URL 和文件路径 | 需要理解 AI 摘要、风格改写、发布平台 | 认知门槛提高，需要教程 |
| **使用频率** | 按需下载（低频） | 可能每天使用（内容监控、定时发布） | 需要稳定性保障 |
| **付费意愿** | 免费工具（开源） | 可能引入 AI 使用成本 | 需要考虑免费/付费模式 |

#### 5.2.2 功能定位变化

| 维度 | 当前 | 目标 | 冲击 |
|------|------|------|------|
| **核心价值** | 下载工具 | 内容创作加速器 | 品牌认知需要重新建立 |
| **竞争替代** | yt-dlp GUI、4K Video Downloader | Notion AI、Claude、Copy.ai、各种社交媒体工具 | 进入竞争更激烈的赛道 |
| **差异化** | 下载稳定性、跨平台 | 采集→处理→发布一体化、本地优先、隐私安全 | 需要强化新差异化卖点 |
| **品牌** | vYtDL（下载器） | ContentForge（内容工厂） | 需要品牌重塑或子品牌策略 |

### 5.3 资源冲击

#### 5.3.1 时间估算

| 阶段 | 任务量 | 估算（单人全职） | 关键路径 |
|------|--------|------------------|----------|
| **Phase 0: 环境准备** | 安装依赖、验证 agent-reach、配置凭证 | 3 天 | 否 |
| **Phase 1: 基础设施** | AI Engine、Pipeline 框架、DB 扩展、Plugin 骨架 | 2 周 | 是 — 后续所有依赖 |
| **Phase 2: 采集域** | 封装 agent-reach、网页抓取、批量导入 | 2 周 | 是 |
| **Phase 3: 处理域** | 转录、摘要、格式转换、小红书文案 | 2 周 | 是 |
| **Phase 4: 编辑域** | FFmpeg 剪辑、字幕处理、音频提取 | 3 周 | 是（最长） |
| **Phase 5: 发布域** | 笔记导出、小红书发布、队列管理 | 2 周 | 是 |
| **Phase 6: 整合** | 工作流 UI、一键流水线、测试、文档 | 2 周 | 是 |
| **缓冲期** | Bug 修复、性能优化、用户测试 | 1 周 | 否 |
| **总计** | — | **15 周（约 3.5 个月）** | — |

**并行优化后的估算（假设可部分并行）：**
- Phase 1 + Phase 2 部分并行：节省 1 周
- Phase 4（编辑域）可与 Phase 3/5 部分并行：节省 1 周
- **优化后总估算：13 周（约 3 个月）**

#### 5.3.2 预算估算

| 成本项 | 开发期（3 个月） | 运营期（每月） | 说明 |
|--------|----------------|---------------|------|
| **OpenAI API** | $50-100 | $20-50 | 开发期测试消耗；运营期按用户量 |
| **Groq API** | $0（免费额度） | $0 | 免费 Whisper 转录，满足大部分需求 |
| **服务器/代理** | $0-10 | $3-10 | Webshare 代理，中国大陆用户需要 |
| **Notion API** | $0 | $0 | 免费 tier 足够 |
| **Docker/部署** | $0 | $0-20 | 可选，个人使用不需要 |
| **开发时间** | 13 周 × 1 人 | 维护时间 | 假设单人全职 |
| **总计** | **$50-110** | **$23-80/月** | 个人项目可承受 |

#### 5.3.3 技能需求

| 技能 | 当前掌握 | 需求程度 | 学习成本 |
|------|----------|----------|----------|
| **Go** | ✅ 已掌握 | 扩展 CLI | 低 |
| **Rust** | ✅ 已掌握 | 扩展 Tauri 后端 | 低 |
| **TypeScript/React** | ✅ 已掌握 | 扩展 Next.js 前端 | 低 |
| **Python** | ✅ 已掌握 | 封装 agent-reach | 低 |
| **AI 提示工程** | ⚠️ 基础 | 核心能力（摘要、改写） | 中（1-2 周） |
| **FFmpeg** | ⚠️ 基础 | 视频编辑封装 | 中（1-2 周） |
| **OpenCLI/浏览器自动化** | ❌ 无 | 小红书采集 | 中（1-2 周） |
| **多后端架构** | ❌ 无 | 平台稳定性 | 中（借鉴 agent-reach） |
| **插件系统设计** | ❌ 无 | 扩展性 | 中（1-2 周） |

---

## 六、架构设计（整合版）

### 6.1 与现有架构的整合策略

**核心原则：增量扩展，不推倒重来。**

```
vYtDL 现有架构
    ├── CLI (Go) ←──→ 新增: scrape, process, publish, pipeline 命令
    ├── Desktop (Tauri+Next) ←──→ 新增: 采集/处理/编辑/发布页面
    ├── Web Server (Express) ←──→ 新增: pipeline API 端点
    ├── Chrome Ext ←──→ 扩展: 一键采集当前页面内容
    ├── SQLite DB ←──→ 扩展: content_units, pipelines, publish_profiles 表
    └── yt-dlp ←──→ 不变，复用

新增基础设施
    ├── Python 运行时（3.10+）←──→ 用于 agent-reach 和 Whisper
    ├── agent-reach ←──→ 子进程依赖，提供 15+ 平台采集
    ├── AI Engine ←──→ 多 Provider 抽象（OpenAI/Claude/Ollama）
    ├── Pipeline Engine ←──→ 新开发，串联采集→处理→发布
    └── Plugin Manager ←──→ 新开发，支持第三方扩展
```

### 6.2 关键设计决策

#### 决策 1：Go CLI 如何调用 Python（agent-reach）

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **A. 子进程调用** | 简单，无需修改 agent-reach | 性能开销，需要解析输出 | ✅ **推荐** — 最务实 |
| **B. Python 嵌入 Go** | 性能更好 | 复杂（CGO/embedding），可移植性差 | ❌ 不推荐 |
| **C. HTTP 服务** | 跨语言通信标准化 | 需要常驻 Python 服务，增加复杂度 | ⚠️ 备选 — 大规模时考虑 |
| **D. 重写为 Go** | 无 Python 依赖 | 工作量巨大，失去生态优势 | ❌ 不推荐 |

**决策：采用方案 A（子进程调用）**，封装 `AgentReachIngestor` 层隔离变化。

#### 决策 2：AI Engine 架构

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **A. 抽象 Provider 接口** | 灵活，支持多后端 | 需要维护提示模板 | ✅ **推荐** |
| **B. 直接调用 OpenAI** | 简单 | 锁定单一供应商 | ❌ 不推荐 |
| **C. 本地模型优先** | 无 API 成本 | 质量不稳定，硬件要求高 | ⚠️ 备选 — 作为降级方案 |

**决策：采用方案 A（Provider-Adapter 模式）**，复用 `innate-aiswitcher` 的 Provider 设计。

#### 决策 3：编辑域实现方式

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **A. FFmpeg 子进程** | 成熟，功能完整 | 需要处理进程管理 | ✅ **推荐** |
| **B. 集成视频编辑库** | 更集成 | 选择少（Rust/Go 生态弱） | ❌ 不推荐 |
| **C. 外部编辑器调用** | 简单 | 用户体验差 | ❌ 不推荐 |

**决策：采用方案 A（FFmpeg 子进程）**，复用 yt-dlp 的子进程模式。

#### 决策 4：小红书发布方案

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **A. OpenCLI（浏览器自动化）** | 复用登录态，稳定 | 需要桌面 Chrome | ✅ **推荐（桌面）** |
| **B. xiaohongshu-mcp（无头浏览器）** | 服务器可用 | 需要扫码登录，服务常驻 | ✅ **推荐（服务器）** |
| **C. 内容准备 + 手动发布** | 简单，无风控 | 不能自动发布 | ⚠️ **MVP 阶段 fallback** |
| **D. 模拟 API 请求** | 快速 | 违反平台 ToS，风险高 | ❌ 不推荐 |

**决策：桌面用 OpenCLI，服务器用 xiaohongshu-mcp，始终支持"内容准备 + 手动导出"作为 fallback。**

---

## 七、技术实施路线图

### 7.1 详细里程碑

```
Month 1: 基础设施 + 采集域 MVP
├── Week 1-2: Phase 1
│   ├── Day 1-3: 安装 agent-reach，验证 doctor，配置凭证
│   ├── Day 4-7: 设计 AI Engine 接口（Provider-Adapter）
│   ├── Day 8-10: 实现 Pipeline Engine 骨架（DAG 执行）
│   ├── Day 11-14: 扩展 SQLite Schema（迁移脚本）
│   └── Go/No-Go 检查点 1: agent-reach 各平台可用性验证
│
├── Week 3-4: Phase 2 + Phase 3（并行启动）
│   ├── Day 15-21: 封装 agent-reach 采集器（Twitter, 网页, 小红书读取）
│   ├── Day 22-28: 集成 Whisper 转录（agent-reach transcribe）
│   └── Go/No-Go 检查点 2: 采集→转录端到端测试

Month 2: 处理域 + 发布域 MVP
├── Week 5-6: Phase 3（核心）
│   ├── Day 29-35: AI 摘要生成（提示工程 + 调用）
│   ├── Day 36-42: 小红书文案格式转换（模板 + 规则）
│   └── Go/No-Go 检查点 3: Twitter → 小红书文案 MVP 可用
│
├── Week 7-8: Phase 5（发布域）
│   ├── Day 43-49: Markdown/Obsidian 导出
│   ├── Day 50-56: 小红书内容准备（图片合成）
│   └── Go/No-Go 检查点 4: 端到端流水线可用（Twitter → 小红书文案）

Month 3: 编辑域 + 整合
├── Week 9-11: Phase 4（编辑域）+ Phase 6
│   ├── Day 57-63: FFmpeg 视频剪辑封装
│   ├── Day 64-70: 字幕提取/嵌入/翻译
│   ├── Day 71-77: 工作流 UI 设计（前端页面）
│   ├── Day 78-84: 一键流水线实现 + 测试覆盖
│   └── Go/No-Go 检查点 5: 完整功能集成测试
│
├── Week 12-13: 打磨 + 发布准备
│   ├── Day 85-91: Bug 修复、性能优化、文档
│   └── 发布 v0.1 ContentForge
```

### 7.2 各阶段详细任务清单

#### Phase 0: 环境验证（3 天）

| # | 任务 | 验收标准 | 风险 |
|---|------|----------|------|
| 0.1 | 安装 `pip install agent-reach` | `agent-reach --version` 返回版本号 | 无 |
| 0.2 | 运行 `agent-reach doctor --json` | JSON 输出包含各平台状态 | 部分平台不可用 |
| 0.3 | 测试 `twitter tweet URL` | 获取推文内容成功 | Twitter 需要 Cookie |
| 0.4 | 测试 `curl r.jina.ai/URL` | 获取 Markdown 内容成功 | 无 |
| 0.5 | 测试 `agent-reach transcribe URL` | 转录成功，需要 Groq Key | 无 Key 则跳过 |
| 0.6 | 配置 Groq API Key | `agent-reach configure groq-key ...` | 免费注册 |
| 0.7 | 验证 OpenCLI 安装（桌面） | `opencli doctor` 成功 | 需要 Chrome 扩展 |

#### Phase 1: 基础设施（2 周）

| # | 任务 | 输出文件 | 验收标准 |
|---|------|----------|----------|
| 1.1 | 设计 AI Engine 接口 | `ai-engine.ts`, `ai-engine.rs` | 支持 OpenAI/Claude/Ollama 切换 |
| 1.2 | 实现 OpenAI Provider | `providers/openai.ts` | 成功调用 GPT-4o-mini 生成摘要 |
| 1.3 | 实现 Pipeline Engine 骨架 | `pipeline/engine.ts` | 能执行简单的 2 步流水线 |
| 1.4 | 设计 Pipeline DSL | `pipeline/types.ts` | 支持 DAG、条件、重试 |
| 1.5 | 扩展 SQLite Schema | `migrations/002_contentforge.sql` | 新表创建成功，数据迁移无丢失 |
| 1.6 | 实现 Plugin Manager 接口 | `plugin/manager.ts` | 能加载/卸载虚拟插件 |
| 1.7 | 扩展 Config Manager | `config/schema.ts` | 支持新配置项，向后兼容 |
| 1.8 | 实现 ContentUnit 模型 | `models/content_unit.ts` | CRUD 操作完整 |

#### Phase 2: 采集域（2 周）

| # | 任务 | 输出文件 | 验收标准 |
|---|------|----------|----------|
| 2.1 | 实现 `AgentReachIngestor` | `ingestion/agent_reach.ts` | 封装 Twitter/网页/小红书采集 |
| 2.2 | 实现通用网页抓取 | `ingestion/web_scraper.ts` | Jina Reader 调用，返回 Markdown |
| 2.3 | 实现 RSS 采集器 | `ingestion/rss.ts` | 解析 RSS feed，返回 ContentUnit 列表 |
| 2.4 | 扩展批量导入 | `ingestion/batch_importer.ts` | 支持多源 URL（不仅是 YouTube） |
| 2.5 | 实现内容解析器 | `ingestion/parser.ts` | HTML → Markdown 标准化 |
| 2.6 | 实现平台健康检查 | `ingestion/health_check.ts` | 检测各平台可用性，返回状态 |
| 2.7 | 扩展 Chrome 扩展 | `url-extractor/content.js` | 支持一键采集当前页面内容 |
| 2.8 | 实现转录集成 | `processing/transcriber.ts` | 调用 agent-reach transcribe |

#### Phase 3: 处理域（2 周）

| # | 任务 | 输出文件 | 验收标准 |
|---|------|----------|----------|
| 3.1 | 实现文本提取器 | `processing/extractor.ts` | 从视频/文章/推文提取纯文本 |
| 3.2 | 实现 AI 摘要生成 | `processing/summarizer.ts` | 输入长文本，输出结构化摘要 |
| 3.3 | 设计摘要提示模板 | `prompts/summary.md` | 覆盖不同内容类型（推文/文章/视频） |
| 3.4 | 实现 Markdown 转换器 | `processing/converter.ts` | 任意内容 → Markdown |
| 3.5 | 实现小红书文案转换器 | `processing/xiaohongshu_converter.ts` | 生成带表情、标签的文案 |
| 3.6 | 设计小红书提示模板 | `prompts/xiaohongshu.md` | 输出符合小红书风格的文案 |
| 3.7 | 实现内容分析器 | `processing/analyzer.ts` | 主题提取、关键词、情感分析 |
| 3.8 | 实现翻译器 | `processing/translator.ts` | 多语言翻译，保留格式 |
| 3.9 | 实现 Engagement 评分 | `processing/scorer.ts` | 按互动量排序内容 |

#### Phase 4: 编辑域（3 周）

| # | 任务 | 输出文件 | 验收标准 |
|---|------|----------|----------|
| 4.1 | 实现 FFmpeg 封装 | `editing/ffmpeg.ts` | 子进程调用，错误处理 |
| 4.2 | 实现视频剪辑 | `editing/video_editor.ts` | 裁剪、拼接功能 |
| 4.3 | 实现字幕提取 | `editing/subtitle_extractor.ts` | 从视频提取 SRT/VTT |
| 4.4 | 实现字幕嵌入 | `editing/subtitle_embedder.ts` | 将字幕嵌入视频 |
| 4.5 | 实现字幕翻译 | `editing/subtitle_translator.ts` | 翻译字幕文件 |
| 4.6 | 实现音频提取 | `editing/audio_extractor.ts` | 视频 → MP3 |
| 4.7 | 实现视频转码 | `editing/transcoder.ts` | 格式转换、分辨率调整 |
| 4.8 | 实现视频预览组件 | `components/video_preview.tsx` | Desktop 中预览编辑效果 |

#### Phase 5: 发布域（2 周）

| # | 任务 | 输出文件 | 验收标准 |
|---|------|----------|----------|
| 5.1 | 实现 Markdown 导出 | `publishing/markdown_exporter.ts` | 导出到文件系统/Obsidian |
| 5.2 | 实现 Notion 发布适配 | `publishing/notion_publisher.ts` | 调用 Notion API 创建页面 |
| 5.3 | 实现小红书发布准备 | `publishing/xiaohongshu_publisher.ts` | 内容格式化 + 图片合成 |
| 5.4 | 实现图片合成 | `publishing/image_generator.ts` | 封面 + 正文卡片生成 |
| 5.5 | 实现发布队列 | `publishing/scheduler.ts` | 定时发布、批量发布 |
| 5.6 | 实现发布历史追踪 | `publishing/tracker.ts` | 记录发布状态、平台 URL |
| 5.7 | 实现发布配置 UI | `app/settings/publish_profiles.tsx` | 配置各平台凭证 |

#### Phase 6: 整合（2 周）

| # | 任务 | 输出文件 | 验收标准 |
|---|------|----------|----------|
| 6.1 | 实现工作流编排 UI | `app/workflows/page.tsx` | 创建/编辑/删除流水线 |
| 6.2 | 实现预设流水线 | `workflows/presets/` | Twitter→小红书, YouTube→笔记 |
| 6.3 | 实现一键执行 | `components/quick_action.tsx` | 选择流水线 → 输入 → 执行 |
| 6.4 | 实现进度追踪 UI | `components/pipeline_progress.tsx` | 实时显示每步状态 |
| 6.5 | 编写端到端测试 | `tests/e2e/` | 覆盖 3 个核心场景 |
| 6.6 | 编写用户文档 | `docs/` | 快速入门、场景指南 |
| 6.7 | 性能优化 | — | 转录 < 2x 时长，摘要 < 5 秒 |
| 6.8 | 错误处理完善 | — | 每步失败有明确错误信息和重试 |

---

## 八、风险矩阵与应对

### 8.1 完整风险矩阵

| 风险 ID | 风险描述 | 概率 | 影响 | 等级 | 应对策略 | 负责人 | 触发条件 |
|---------|----------|------|------|------|----------|--------|----------|
| **R1** | Twitter/X API 变动导致采集失效 | 高 | 高 | 🔴 | 多后端策略：twitter-cli → OpenCLI → 浏览器自动化；agent-reach 自动维护后端列表 | 架构 | 采集失败率 > 30% |
| **R2** | 小红书无官方 API，发布受限 | 高 | 高 | 🔴 | 桌面用 OpenCLI，服务器用 xiaohongshu-mcp；始终支持"内容准备+手动导出"作为 fallback | 采集/发布 | 发布失败率 > 50% |
| **R3** | AI API 成本过高 | 中 | 中 | 🟡 | 支持本地 Ollama 作为免费替代；Groq 免费转录；摘要使用轻量模型（GPT-4o-mini） | 处理 | 月成本 > $100 |
| **R4** | Python 运行时引入导致安装复杂 | 中 | 高 | 🟡 | 提供一键安装脚本（类似 agent-reach install）；Docker 镜像预装；基础版不包含 AI 功能 | 基础设施 | 安装失败率 > 20% |
| **R5** | 视频编辑性能不足 | 中 | 中 | 🟡 | FFmpeg 硬件加速（-hwaccel）；异步处理；进度反馈；限制并发数 | 编辑 | 转码速度 < 0.5x |
| **R6** | 平台反爬/风控 | 高 | 中 | 🟡 | 合理速率限制（2-3 秒/请求）；代理支持；用户 Cookie 复用；遵守 robots.txt | 采集 | 403/429 错误频繁 |
| **R7** | 内容版权/合规风险 | 低 | 高 | 🟡 | 明确工具仅提供采集能力，不托管内容；用户责任声明；提供使用指南 | 法律/产品 | 收到平台投诉 |
| **R8** | 开发时间超期 | 中 | 高 | 🟡 | 分阶段交付，每阶段有 MVP；Feature Flag 控制；先完成核心场景再扩展 | 项目管理 | 阶段延迟 > 1 周 |
| **R9** | 用户不接受新定位 | 低 | 高 | 🟡 | 保留现有下载功能不变；新增功能可关闭；渐进式引导 | 产品 | 用户反馈负面 > 50% |
| **R10** | 开源依赖停止维护 | 低 | 中 | 🟢 | 锁定版本；监控上游；多后端设计提供回退；准备备选方案 | 架构 | 上游 6 个月无更新 |
| **R11** | SQLite 性能瓶颈 | 低 | 中 | 🟢 | 内容量 < 10 万条时无问题；未来可迁移到 PostgreSQL；索引优化 | 基础设施 | 查询 > 500ms |
| **R12** | 转录质量差（Whisper 幻觉） | 中 | 中 | 🟡 | 支持后处理（标点修复）；段落重组；人工校对机制 | 处理 | 转录错误率 > 10% |
| **R13** | 小红书文案质量不达标 | 中 | 中 | 🟡 | 提示工程迭代；A/B 测试不同模板；用户可编辑后再发布 | 处理 | 用户修改率 > 80% |
| **R14** | Chrome 扩展安全审核 | 低 | 中 | 🟢 | 遵循 Manifest V3 规范；不请求过多权限；提供隐私政策 | 采集 | 审核被拒 |

### 8.2 风险监控指标

| 指标 | 监控方式 | 警戒线 | 动作 |
|------|----------|--------|------|
| 平台采集成功率 | 日志统计 | < 80% | 切换后端 / 检查配置 |
| AI API 调用成本 | 账单监控 | > $50/月 | 切换到 Ollama 本地模型 |
| 用户安装成功率 | 遥测（可选） | < 90% | 优化安装脚本 |
| 流水线执行成功率 | 日志统计 | < 95% | 检查错误日志，修复 |
| 转录质量评分 | 抽样人工评估 | < 7/10 | 优化提示/后处理 |
| 平均执行时间 | 性能监控 | 摘要 > 10s | 优化模型/缓存 |

---

## 九、关键决策点与里程碑

### 9.1 Go/No-Go 决策点

```
检查点 1: Week 2 结束（环境验证）
├── 决策: agent-reach 至少 3 个核心平台可用？
├── 条件: Twitter 可读, 网页可抓, YouTube 可转录
├── Go → 继续 Phase 1
├── No-Go → 调研备选方案（如自建抓取器），延期 1 周

检查点 2: Week 4 结束（采集域 MVP）
├── 决策: 采集→转录端到端可用？
├── 条件: 输入 URL → 获取内容 → 提取文本成功
├── Go → 继续 Phase 3（处理域）
├── No-Go → 简化范围（先做网页+RSS，跳过 Twitter）

检查点 3: Week 6 结束（处理域核心）
├── 决策: Twitter → 小红书文案 MVP 可用？
├── 条件: 输入 Twitter URL → 生成小红书风格文案 → 可手动发布
├── Go → 继续完整开发
├── No-Go → 重新评估 AI 提示工程，或切换模型

检查点 4: Week 8 结束（发布域）
├── 决策: 端到端流水线可用？
├── 条件: 一键执行 Twitter→小红书文案，成功输出
├── Go → 进入打磨阶段
├── No-Go → 聚焦发布域（先做 Markdown 导出，小红书延后）

检查点 5: Week 11 结束（整合测试）
├── 决策: 完整功能集成测试通过？
├── 条件: 3 个核心场景全部可用，无阻断性 Bug
├── Go → 发布 v0.1
├── No-Go → 修复 Bug，延期 1 周
```

### 9.2 里程碑与交付物

| 里程碑 | 时间 | 交付物 | 成功标准 |
|--------|------|--------|----------|
| **M1: 环境就绪** | Week 2 | agent-reach 集成验证报告 | 3+ 平台可用 |
| **M2: 采集域可用** | Week 4 | `AgentReachIngestor` 模块 | 支持 Twitter/网页/YouTube 采集 |
| **M3: 处理域可用** | Week 6 | AI 摘要 + 小红书文案生成 | Twitter → 小红书文案质量可接受 |
| **M4: 端到端 MVP** | Week 8 | 完整流水线（Twitter→小红书） | 一键执行成功 |
| **M5: 编辑域可用** | Week 11 | 视频剪辑 + 字幕处理 | FFmpeg 基础操作可用 |
| **M6: v0.1 发布** | Week 13 | ContentForge v0.1 | 3 个核心场景可用，文档完整 |

---

## 十、回退策略

### 10.1 分层回退机制

| 层级 | 触发条件 | 回退动作 | 影响 |
|------|----------|----------|------|
| **L1: 功能回退** | 某个平台采集失败 | 切换到备选后端；或降级为"内容准备+手动导出" | 用户体验轻微下降 |
| **L2: 场景回退** | 某个场景无法完成 | 保留该场景为"半成品"（仅采集+处理，不发布） | 功能不完整，但可用 |
| **L3: 模块回退** | 整个域（如编辑域）无法完成 | 从 v0.1 中移除该域，后续版本补充 | 发布范围缩小 |
| **L4: 项目回退** | 转型完全失败 | 保留所有新增代码为独立分支，主干保持 vYtDL | 零损失，可未来重启 |

### 10.2 回退保障措施

1. **Git 分支策略：**
   - `main`：保留 vYtDL 稳定版本
   - `contentforge`：转型开发分支
   - 每个 Phase 完成即打 tag，可随时回退到任一阶段

2. **Feature Flag：**
   - 所有新增功能通过 `ENABLE_CONTENT_FORGE` 标志控制
   - 用户可关闭所有新功能，回到纯下载模式

3. **数据隔离：**
   - 新增表不影响现有 `downloads` 表
   - 现有下载功能完全不受影响

4. **渐进式发布：**
   - v0.1：仅 CLI + 核心流水线（无 UI）
   - v0.2：Desktop UI + 预设流水线
   - v0.3：Web Server + 插件系统
   - 每版可独立评估是否继续

### 10.3 最坏情况预案

**场景：3 个月后无法完成转型**

- 保留所有新增代码（在 `contentforge` 分支）
- `main` 分支继续维护 vYtDL 下载功能
- 将已完成的部分作为独立工具发布（如 `cf-scrape` CLI 工具）
- 记录失败原因，为未来重启提供参考

**场景：AI 成本失控**

- 立即切换到 Ollama 本地模型（llama3.1 70B）
- 降低摘要质量预期（从 GPT-4o 降级到 GPT-4o-mini）
- 限制免费用户每日 AI 调用次数
- 引入付费模式（AI 调用按量计费）

**场景：平台封禁（Twitter/小红书）**

- 切换到浏览器自动化（Playwright / Kimi WebBridge）
- 降低采集频率，增加随机延迟
- 优先支持不需要登录的平台（网页、RSS、YouTube）
- 等待平台政策变化

---

## 十一、资源估算与预算

### 11.1 开发资源

| 资源 | 数量 | 周期 | 说明 |
|------|------|------|------|
| **开发工程师** | 1 人（全职） | 13 周 | 假设全栈能力（Go + Rust + TS + Python） |
| **AI 提示工程** | 0.2 人（兼职） | 贯穿全程 | 优化摘要、改写、文案生成提示 |
| **测试** | 0.2 人（兼职） | Week 8-13 | 端到端测试、用户体验测试 |
| **文档** | 0.1 人（兼职） | Week 11-13 | 用户文档、API 文档 |

### 11.2 基础设施成本

| 项目 | 开发期（3个月） | 运营期（月） | 备注 |
|------|----------------|------------|------|
| OpenAI API | $50-100 | $20-50 | GPT-4o-mini 为主 |
| Groq API | $0 | $0 | 免费 Whisper 额度充足 |
| 代理服务（Webshare） | $3-6 | $1-3 | 中国大陆用户需要 |
| Docker 托管 | $0 | $0-20 | 可选 |
| GitHub Actions CI | $0 | $0 | 免费 tier |
| 域名/SSL | $0 | $0 | 已有 |
| **总计** | **$53-106** | **$21-73/月** | 个人项目可承受 |

### 11.3 硬件需求

| 场景 | 最低配置 | 推荐配置 | 说明 |
|------|----------|----------|------|
| **开发** | 8GB RAM, 4 核 CPU | 16GB RAM, 8 核 CPU | Whisper 本地模型需要内存 |
| **运行** | 4GB RAM, 2 核 CPU | 8GB RAM, 4 核 CPU | 基础功能无需高配 |
| **本地 AI** | 8GB RAM | 16GB RAM + GPU（CUDA） | Ollama 运行 7B 模型需要 8GB |
| **视频编辑** | 4GB RAM | 8GB RAM | FFmpeg 硬件加速需要 GPU |

---

## 十二、技术选型总结

### 12.1 最终技术栈

| 层级 | 技术 | 用途 | 状态 |
|------|------|------|------|
| **CLI** | Go 1.24 + Cobra + Bubble Tea | 命令行界面 | 已有，扩展 |
| **Desktop** | Tauri v2 + Next.js 14 + React 19 + Tailwind | 桌面应用 | 已有，扩展 |
| **Web** | Node.js + Express + better-sqlite3 | Web API | 已有，扩展 |
| **数据库** | SQLite | 内容存储 | 已有，扩展 Schema |
| **采集** | agent-reach (Python CLI) | 15+ 平台内容获取 | 新增，pip 安装 |
| **转录** | Whisper (Groq免费 / faster-whisper本地) | 音频转文本 | 新增 |
| **视频编辑** | FFmpeg | 剪辑、字幕、转码 | 已有，扩展用途 |
| **AI 处理** | OpenAI GPT-4o-mini / Claude Haiku / Ollama | 摘要、改写、分析 | 新增 |
| **网页抓取** | Jina Reader (免费 API) | 任意 URL → Markdown | 新增 |
| **小红书** | OpenCLI (桌面) / xiaohongshu-mcp (服务器) | 采集+发布 | 新增 |
| **笔记发布** | Notion API / 文件写入 | 导出到笔记工具 | 新增 |
| **构建** | pnpm + Cargo + Go | 多语言构建 | 已有 |
| **Docker** | 多阶段构建（Python + Node + Go + Rust） | 部署 | 扩展 |

### 12.2 新增依赖清单

```toml
# Python 依赖（pip install）
agent-reach >= 1.5.0
faster-whisper >= 1.0.0    # 可选本地模型
requests >= 2.28
feedparser >= 6.0

# Node.js 依赖（npm/pnpm）
# OpenCLI（全局安装）
npm install -g opencli

# Rust 依赖（Cargo）
# 无新增

# Go 依赖（go get）
# 无新增

# 系统依赖
ffmpeg                        # 已有
tauri-cli                     # 已有
```

---

## 十三、下一步行动（立即执行）

### 13.1 本周行动清单（Week 0）

| # | 行动 | 预计时间 | 产出 | 优先级 |
|---|------|----------|------|--------|
| 1 | `pip install agent-reach` 并运行 `agent-reach doctor` | 30 分钟 | 平台可用性报告 | P0 |
| 2 | 注册 Groq API Key（console.groq.com） | 15 分钟 | 免费 API Key | P0 |
| 3 | 测试 `agent-reach transcribe` 对 YouTube 视频 | 30 分钟 | 验证转录功能 | P0 |
| 4 | 测试 `curl r.jina.ai/URL` 对任意网页 | 15 分钟 | 验证网页抓取 | P0 |
| 5 | 在 vYtDL 仓库创建 `contentforge` 分支 | 5 分钟 | 开发分支 | P0 |
| 6 | 编写 `contentforge/SKILL.md`（项目技能文档） | 2 小时 | 项目上下文 | P1 |
| 7 | 设计 AI Engine 接口（TypeScript + Rust） | 4 小时 | 接口定义 | P1 |
| 8 | 编写数据库迁移脚本（002_contentforge.sql） | 2 小时 | Schema 扩展 | P1 |
| 9 | 安装 OpenCLI（桌面）并验证 `opencli xiaohongshu` | 1 小时 | 小红书采集验证 | P1 |
| 10 | 起草 `contentforge/README.md`（项目愿景） | 1 小时 | 项目文档 | P2 |

### 13.2 决策确认

请在本周内确认以下决策：

- [ ] 确认转型方向（vYtDL → ContentForge）
- [ ] 确认品牌策略（完全更名 / 保留 vYtDL 增加 ContentForge 子品牌）
- [ ] 确认是否采用 agent-reach 作为采集基础设施
- [ ] 确认 AI Provider 优先级（OpenAI 主 / Claude 主 / Ollama 主）
- [ ] 确认是否支持本地 AI 模型（Ollama）
- [ ] 确认免费/付费模式（完全免费 / 基础免费+AI 付费 / 开源+托管服务）
- [ ] 确认首个 MVP 场景（Twitter→小红书 / YouTube→笔记 / 其他）

### 13.3 长期愿景

**v0.1（3 个月）**：核心流水线可用（Twitter→小红书, YouTube→笔记）
**v0.2（6 个月）**：Desktop UI 完整，支持 5+ 预设流水线，插件系统初步可用
**v0.3（9 个月）**：Web Server 完整部署，工作流定时触发，多用户支持
**v1.0（12 个月）**：完整的插件生态，支持任意平台采集→任意平台发布，社区贡献的插件市场

---

## 十四、附录

### 14.1 参考文档

- [plan-contentforge.md](./plan-contentforge.md) — 初始功能规划与模块设计
- [analysis-agent-reach-last30days.md](./analysis-agent-reach-last30days.md) — 两个仓库的技术分析
- [agent-reach/](./agent-reach/) — 克隆的 agent-reach 仓库
- [last30days-skill/](./last30days-skill/) — 克隆的 last30days-skill 仓库

### 14.2 术语表

| 术语 | 定义 |
|------|------|
| **ContentForge** | 项目新名称，内容获取→处理→发布工具链 |
| **ContentUnit** | 核心数据模型，代表一个内容单元（视频/文章/推文等） |
| **Pipeline** | 流水线，定义采集→处理→编辑→发布的步骤序列 |
| **PipelineRun** | 流水线的一次执行实例 |
| **Channel** | 采集平台（如 Twitter、小红书、YouTube） |
| **Provider** | AI 服务提供商（如 OpenAI、Claude、Ollama） |
| **agent-reach** | 外部依赖，提供 15+ 平台的内容采集能力 |
| **last30days** | 外部参考，提供内容评分、聚类、合成的方法论 |
| **OpenCLI** | 浏览器自动化工具，复用 Chrome 登录态访问社交平台 |
| **Jina Reader** | 免费网页抓取 API，任意 URL → Markdown |
| **Groq** | 免费 Whisper API 提供商，音频转文本 |

### 14.3 变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2025-07-09 | v0.1 | 初始版本，整合两份分析文档，增加完整冲击分析 |
