# vYtDL 转型规划：从视频下载到社交媒体内容工厂

## 项目新定位

将 `vYtDL` 从单一的 YouTube 下载工具，升级为**内容获取→内容处理→内容发布**的完整工具链。命名为 **ContentForge**（或保留 vYtDL 品牌，增加 Content 子系统）。

核心场景：
1. 抓取 Twitter/X 内容 → 智能摘要/笔记 → 发布到小红书/微博
2. 下载 YouTube 视频 → 提取文本/字幕 → AI 分析 → 二次创作视频
3. 视频基础编辑（剪辑、字幕、音频提取）

---

## 一、功能划分（Feature Domain）

### 1.1 四大能力域

| 能力域 | 说明 | 对应场景 |
|--------|------|----------|
| **采集域 (Ingestion)** | 从各平台获取原始内容 | 场景1、2 |
| **处理域 (Processing)** | 内容转换、分析、生成 | 场景1、2 |
| **编辑域 (Editing)** | 视频/音频基础编辑 | 场景2、3 |
| **发布域 (Distribution)** | 发布到各社交媒体 | 场景1 |

### 1.2 各域详细功能

#### 采集域 (Ingestion Domain)

| 功能 | 平台 | 技术方式 | 优先级 |
|------|------|----------|--------|
| Twitter/X 推文抓取 | Twitter/X | API (官方) / 无头浏览器 (备选) | P1 |
| YouTube 视频下载 | YouTube | 复用现有 yt-dlp | 已有 |
| YouTube 字幕/文本提取 | YouTube | 复用现有 VTT 解析 | 已有 |
| 网页文章抓取 | 通用 | Readability / Markdownify | P2 |
| RSS 订阅采集 | 通用 | RSS 解析器 | P2 |
| 小红书/抖音/微博 内容获取 | 中社媒 | 无头浏览器 / 扩展 | P2 |
| 批量 URL 导入 | 通用 | 复用现有批量导入 | 已有 |

#### 处理域 (Processing Domain)

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 文本提取 (Transcription) | 视频/音频转文本 (Whisper/Whisper API) | P1 |
| 智能摘要 (Summarization) | 长文本生成摘要、Bullet points | P1 |
| 内容转换 (Format Conversion) | 推文 → Markdown / 笔记 / 小红书文案 | P1 |
| 内容分析 (Analysis) | 主题提取、关键词、情感分析 | P2 |
| 多语言翻译 | 目标语言翻译 | P2 |
| 风格改写 (Style Rewrite) | 口语化 → 书面化，学术 → 通俗 | P2 |
| 内容合规检查 | 敏感词检测、字数限制检查 | P2 |

#### 编辑域 (Editing Domain)

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 视频基础剪辑 | 裁剪、拼接、转码 | P1 |
| 字幕处理 | 提取/嵌入/翻译字幕 | P1 |
| 音频提取 | 视频 → 音频 (MP3) | P1 |
| 音频转文本 | 复用 Transcription | P1 |
| 视频压缩/转码 | 格式转换、分辨率调整 | P2 |
| B-Roll 自动匹配 | 根据文本匹配视频片段 | P3 |

#### 发布域 (Distribution Domain)

| 功能 | 平台 | 说明 | 优先级 |
|------|------|------|--------|
| 小红书图文发布 | 小红书 | 模拟发布或 API | P1 |
| Markdown 笔记导出 | 通用 | 导出到 Obsidian/Notion 等 | P1 |
| Twitter/X 发布 | Twitter/X | 官方 API | P2 |
| 微博发布 | 微博 | 开放平台 API | P2 |
| 发布队列管理 | 通用 | 定时发布、批量发布 | P2 |
| 发布效果追踪 | 通用 | 阅读量、互动数据追踪 | P3 |

---

## 二、模块划分（Module Architecture）

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      ContentForge 系统                          │
├─────────────────────────────────────────────────────────────────┤
│  CLI Layer  │  Desktop Layer  │  Web Layer  │  Extension      │
│  (Go/Cobra) │  (Tauri+Next)   │  (Docker)   │  (Chrome)       │
├─────────────────────────────────────────────────────────────────┤
│                    API Gateway / IPC Layer                        │
│              (统一调用: 采集→处理→编辑→发布)                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Ingestion│  │ Processor│  │  Editor  │  │ Distributor│    │
│  │  采集域   │  │  处理域   │  │  编辑域   │  │  发布域   │    │
│  │          │  │          │  │          │  │          │    │
│  │• Scraper │  │• Extract │  │• Video   │  │• Publisher│    │
│  │• Downloader│ │• Summarize│ │  Editor │  │• Scheduler│    │
│  │• Parser  │  │• Translate│ │• Subtitle│  │• Tracker  │    │
│  │• Importer│  │• Rewrite │  │• Audio   │  │• Exporter │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │  AI Engine│  │  Queue   │  │  Storage │                      │
│  │  (LLM/AI) │  │  Manager │  │  (SQLite/FS)│                  │
│  │           │  │          │  │          │                      │
│  │• OpenAI   │  │• Task    │  │• Content │                      │
│  │• Claude   │  │  Queue   │  │  DB      │                      │
│  │• Ollama   │  │• Concur- │  │• File   │                      │
│  │• Local    │  │  rency   │  │  Storage │                      │
│  │  Models   │  │          │  │          │                      │
│  └──────────┘  └──────────┘  └──────────┘                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │  External │  │  Config  │  │  Plugin  │                      │
│  │  Adapters │  │  Manager │  │  System  │                      │
│  │           │  │          │  │          │                      │
│  │• Twitter │  │• Settings│  │• Provider│                      │
│  │  API     │  │• Profiles│  │  Plugin  │                      │
│  │• YouTube │  │• Secrets  │  │• Action  │                      │
│  │  (yt-dlp)│  │  (API Keys)│  │  Plugin  │                      │
│  │• Xiaohong│  │          │  │          │                      │
│  │  shu     │  │          │  │          │                      │
│  │• Notion  │  │          │  │          │                      │
│  │  API     │  │          │  │          │                      │
│  └──────────┘  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 模块层级定义

```
Presentation Layer (前端)
├── CLI App (Go + Bubble Tea) — 复用现有
├── Desktop App (Tauri + Next.js) — 复用现有
├── Web App (Next.js + Express) — 复用现有
└── Chrome Extension (url-extractor) — 复用/扩展

Application Layer (业务编排)
├── Content Pipeline Service — 内容流水线编排
├── Task Orchestrator — 任务编排（采集→处理→编辑→发布）
├── Workflow Engine — 工作流定义与执行
└── Plugin Manager — 插件生命周期管理

Domain Layer (核心领域)
├── Ingestion Domain
│   ├── Scraper (网页抓取)
│   ├── Downloader (视频下载) — 复用现有
│   ├── Parser (内容解析)
│   └── Importer (批量导入) — 复用现有
├── Processing Domain
│   ├── Extractor (文本提取/转录)
│   ├── Summarizer (摘要生成)
│   ├── Converter (格式转换)
│   ├── Analyzer (内容分析)
│   └── Translator (翻译)
├── Editing Domain
│   ├── VideoEditor (视频编辑)
│   ├── SubtitleEditor (字幕编辑)
│   ├── AudioEditor (音频编辑)
│   └── Transcoder (转码压缩)
└── Distribution Domain
    ├── Publisher (发布器)
    ├── Scheduler (定时调度)
    ├── Tracker (效果追踪)
    └── Exporter (导出)

Infrastructure Layer (基础设施)
├── AI Engine (LLM/AI 服务抽象)
│   ├── OpenAI Provider
│   ├── Claude Provider
│   ├── Ollama Provider (本地)
│   └── Custom Provider
├── Queue Manager (任务队列) — 复用现有
├── Storage
│   ├── Content DB (SQLite) — 复用现有
│   ├── File Storage (本地文件)
│   └── Cache (Redis / 内存)
├── External Adapters
│   ├── Twitter/X Adapter
│   ├── YouTube Adapter (yt-dlp) — 复用现有
│   ├── Xiaohongshu Adapter
│   ├── Notion Adapter
│   └── Generic Web Adapter
└── Config Manager (配置管理) — 复用现有
```

### 2.3 核心数据模型

```typescript
// 内容单元（Content Unit）
interface ContentUnit {
  id: string;
  source: SourceInfo;          // 来源信息（URL, 平台, 作者等）
  type: 'video' | 'article' | 'tweet' | 'thread' | 'audio' | 'image';
  rawData: RawData;            // 原始内容（二进制或文本）
  extractedText: string;       // 提取的文本
  metadata: Metadata;        // 元数据（标题、时长、语言等）
  processed: ProcessedData;    // 处理后的数据
  status: 'ingested' | 'processing' | 'processed' | 'editing' | 'ready' | 'published' | 'failed';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 工作流任务（Pipeline Task）
interface PipelineTask {
  id: string;
  workflowId: string;
  steps: TaskStep[];
  currentStep: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  output: ContentUnit | null;
  createdAt: Date;
}

// 发布配置
interface PublishConfig {
  platform: 'xiaohongshu' | 'twitter' | 'weibo' | 'notion' | 'obsidian';
  credentials: Credentials;
  format: 'text' | 'markdown' | 'image' | 'video' | 'carousel';
  schedule?: Date;
  options: Record<string, any>;
}
```

---

## 三、执行计划与步骤

### 3.1 阶段总览

```
Phase 1: 基础设施扩展（1-2 周）
    ├── AI Engine 抽象层
    ├── Pipeline 框架
    ├── 内容存储模型升级
    └── 插件系统骨架

Phase 2: 采集域建设（2-3 周）
    ├── Twitter/X 抓取器
    ├── 通用网页抓取器
    ├── 复用 YouTube 下载器
    └── 批量导入增强

Phase 3: 处理域建设（2-3 周）
    ├── 文本提取（Whisper 集成）
    ├── AI 摘要与改写
    ├── Markdown/小红书格式转换
    └── 内容分析

Phase 4: 编辑域建设（3-4 周）
    ├── 视频基础剪辑（FFmpeg 封装）
    ├── 字幕处理
    ├── 音频提取/转码
    └── 视频合成功能

Phase 5: 发布域建设（2-3 周）
    ├── Markdown 笔记导出
    ├── 小红书发布适配
    ├── 通用发布框架
    └── 发布队列管理

Phase 6: 整合与打磨（2 周）
    ├── 工作流编排 UI
    ├── 一键流水线
    ├── 测试覆盖
    └── 文档完善
```

### 3.2 各阶段详细步骤

#### Phase 1: 基础设施扩展

| 步骤 | 任务 | 涉及模块 | 输出 |
|------|------|----------|------|
| 1.1 | 设计 AI Engine 接口，支持多 Provider 切换 | AI Engine | `ai-engine.ts` 接口定义 |
| 1.2 | 实现 OpenAI/Claude 适配器 | AI Engine | 第一个可用 Provider |
| 1.3 | 设计 Pipeline 框架（DAG 任务流） | Pipeline Service | 流水线编排接口 |
| 1.4 | 升级数据库 Schema（ContentUnit 模型） | Storage | 新表结构 + 迁移脚本 |
| 1.5 | 设计插件注册/加载机制 | Plugin Manager | 插件系统接口 |
| 1.6 | 定义配置扩展（API Keys、Profile） | Config Manager | 新配置结构 |

#### Phase 2: 采集域建设

| 步骤 | 任务 | 涉及模块 | 输出 |
|------|------|----------|------|
| 2.1 | Twitter/X 抓取器（WebBridge / nitter） | Scraper | Twitter 内容采集功能 |
| 2.2 | 通用网页文章抓取（Readability + Markdownify） | Scraper | 文章采集功能 |
| 2.3 | 复用现有 YouTube 下载器，增加元数据提取 | Downloader | 增强版下载器 |
| 2.4 | 复用现有批量导入，增加多源支持 | Importer | 增强版导入 |
| 2.5 | 内容解析器（HTML → Markdown 标准化） | Parser | 统一解析接口 |

#### Phase 3: 处理域建设

| 步骤 | 任务 | 涉及模块 | 输出 |
|------|------|----------|------|
| 3.1 | 集成 Whisper 或 Whisper API，实现视频转文本 | Extractor | 转录功能 |
| 3.2 | 实现 AI 摘要生成（调用 AI Engine） | Summarizer | 摘要生成 |
| 3.3 | 实现 Markdown 格式转换器 | Converter | Markdown 输出 |
| 3.4 | 实现小红书文案格式转换（表情、标签、字数优化） | Converter | 小红书文案生成 |
| 3.5 | 实现内容主题分析、关键词提取 | Analyzer | 分析功能 |
| 3.6 | 实现多语言翻译 | Translator | 翻译功能 |

#### Phase 4: 编辑域建设

| 步骤 | 任务 | 涉及模块 | 输出 |
|------|------|----------|------|
| 4.1 | FFmpeg 封装层，实现基础视频操作 | VideoEditor | 视频剪辑基础功能 |
| 4.2 | 字幕提取/嵌入/翻译 | SubtitleEditor | 字幕处理 |
| 4.3 | 音频提取与基础处理 | AudioEditor | 音频功能 |
| 4.4 | 视频拼接与转码 | Transcoder | 视频合成功能 |
| 4.5 | 视频内容预览组件 | Desktop UI | 视频预览功能 |

#### Phase 5: 发布域建设

| 步骤 | 任务 | 涉及模块 | 输出 |
|------|------|----------|------|
| 5.1 | Markdown 笔记导出（文件系统/Obsidian） | Exporter | 笔记导出 |
| 5.2 | Notion 页面发布适配 | Publisher | Notion 发布 |
| 5.3 | 小红书发布适配（格式+图片合成） | Publisher | 小红书发布准备 |
| 5.4 | 发布队列与定时调度 | Scheduler | 发布队列管理 |
| 5.5 | 发布历史与状态追踪 | Tracker | 发布记录 |

#### Phase 6: 整合与打磨

| 步骤 | 任务 | 涉及模块 | 输出 |
|------|------|----------|------|
| 6.1 | 设计工作流编排 UI（拖拽式/表单式） | Desktop UI | 工作流配置界面 |
| 6.2 | 实现常用一键流水线（Twitter→小红书、YouTube→笔记） | Pipeline | 预设工作流 |
| 6.3 | 端到端测试 | All | 测试覆盖 |
| 6.4 | 用户文档和架构文档 | Docs | 完整文档 |
| 6.5 | 性能优化与错误处理 | All | 稳定版本 |

---

## 四、技术选型与建议

### 4.1 新增技术栈

| 技术 | 用途 | 集成方式 |
|------|------|----------|
| **Whisper / faster-whisper** | 音频转文本 | Python 子进程 / 本地模型 |
| **FFmpeg** | 视频/音频处理 | 子进程调用（复用现有 yt-dlp 模式） |
| **Readability-lxml** | 网页内容提取 | Python 子进程 / Node.js 库 |
| **Playwright / Puppeteer** | 无头浏览器抓取 | 独立服务或子进程 |
| **OpenAI API / Claude API** | AI 摘要/改写 | HTTP API 调用 |
| **Ollama** | 本地 LLM 运行 | HTTP API 调用 |
| **Notion API** | 笔记发布 | 官方 HTTP API |

### 4.2 架构适配建议

1. **保持现有 Tauri 桌面架构不变**，扩展 Rust 命令层和前端组件
2. **Web Server 增加新的 API 端点**，对应新领域
3. **CLI 扩展新的子命令**：`scrape`, `process`, `publish`, `pipeline`
4. **Chrome 扩展扩展功能**：从单纯 URL 提取，变为内容一键采集
5. **AI Engine 使用 Provider-Adapter 模式**：复用 `innate-aiswitcher` 的 Provider 设计哲学

### 4.3 与现有项目的关系

| 现有组件 | 新角色 | 变更程度 |
|----------|--------|----------|
| vYtDL CLI | ContentForge CLI | 扩展新命令，保持下载功能 |
| vYtDL Desktop | ContentForge Desktop | 扩展新 UI，保持下载界面 |
| Web Server | ContentForge Web API | 扩展新端点 |
| URL Extractor | ContentForge Collector | 扩展采集功能 |
| yt-dlp | 视频下载子系统 | 不变 |
| SQLite DB | 内容存储数据库 | 扩展表结构 |
| Queue Manager | 任务队列 | 扩展新任务类型 |

---

## 五、风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| Twitter/X API 变动/限制 | 采集功能失效 | 多源策略：API + WebBridge + Nitter 备选 |
| 小红书无官方 API | 发布功能受限 | 先实现内容准备，发布通过 WebBridge 或手动导出 |
| AI 处理成本 | 费用累积 | 支持本地 Ollama 模型作为免费替代 |
| 视频处理性能 | 转码/编辑慢 | FFmpeg 硬件加速，队列异步处理 |
| 平台反爬 | 采集失败 | 遵守 robots.txt，使用合理速率限制，WebBridge 兜底 |
| 内容版权风险 | 法律问题 | 明确用户责任，仅提供工具，不托管内容 |

---

## 六、下一步建议

1. **先选择第一个 MVP**：Twitter → Markdown → 小红书文案，这个场景最清晰，技术依赖最少
2. **保持现有下载功能不变**：作为核心功能继续存在，新增功能围绕它扩展
3. **按阶段推进**：完成 Phase 1 和 Phase 2 后就能产出第一个可用版本
4. **做好配置管理**：各平台的 API Key、账号信息需要安全的配置管理
