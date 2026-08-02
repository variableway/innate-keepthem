## capsummarize 仓库分析

**分析日期**: 2026-07-25  
**仓库路径**: `/Users/patrick/innate/projects/innate-keepthem/contentforge/external-repos/capsummarize/`  
**版本**: 1.1.0  
**许可证**: MIT

---

### 1. 项目概述

**CapSummarize** 是一个免费的、开源的 Chrome 浏览器扩展，核心功能是从在线视频（YouTube、Google Drive、Udemy、Zoom 等）的字幕/转录文本中提取内容，并利用用户选择的 AI Provider 生成多种格式的 AI 摘要、缩略图和视频片段。

**核心定位**: 浏览器内的视频内容再创作助手 —— 将视频转录文本转化为结构化内容（摘要、博客、笔记、社交媒体文案、图像、短视频脚本等）。

**关键特点**:
- **纯前端架构**: 无后端服务器，所有 prompt 模板本地打包，数据处理在浏览器内完成
- **隐私优先**: 不收集用户数据，字幕拦截和转录提取完全本地执行
- **多 Provider 支持**: 通过浏览器标签页注入的方式与 11 个 AI 聊天服务集成
- **免费无限制**: 通过本地 prompt 模板 + 用户自有 AI 账户实现零成本使用

---

### 2. 功能分析

#### 2.1 核心功能模块

| 模块 | 功能描述 | 实现方式 |
|------|----------|----------|
| **字幕拦截提取** | 拦截视频页面的 VTT/WebVTT 字幕请求 | `interceptor.ts` 覆盖 `fetch()` 和 `XMLHttpRequest` |
| **VTT 解析** | 将 VTT 格式转为纯文本，支持 YouTube JSON 格式转 VTT | `vtt.ts` + `vtt-connectors.ts`（Connector 模式） |
| **文本摘要生成** | 15+ 种风格的 AI 文本摘要 | 本地 prompt 模板 → 注入 AI Provider 页面 |
| **AI 图像生成** | 基于转录内容生成缩略图、信息图等 | 支持 ChatGPT/Gemini/Grok，可选参考图 |
| **AI 视频生成** | 基于转录内容生成短视频片段 | 仅 Gemini 支持（8秒限制） |
| **Provider 注入** | 将 prompt 自动填入 AI 聊天页面并提交 | `chrome.scripting.executeScript` DOM 操作 |
| **历史记录** | 保存已提取的字幕和生成的摘要 | IndexedDB 本地存储 |
| **自定义模板** | 用户可创建自己的摘要风格模板 | IndexedDB + 动态加载 |

#### 2.2 支持的摘要风格（文本类）

| 风格 | 用途 | 输出格式 |
|------|------|----------|
| `default` | 通用平衡摘要 | 结构化 Markdown |
| `educational` | 教育/学习用途 | 含学习目标、知识点、自测题 |
| `technical` | 技术内容 | 含代码块、实现步骤、最佳实践 |
| `executive` | 高管简报 | 决策导向、行动项、风险评估 |
| `marketing` | 营销文案 | 转化导向、CTA、情感诉求 |
| `news` | 新闻报道 | 倒金字塔结构、客观事实 |
| `blog` | SEO 博客文章 | 含标题优化、代码示例、Mermaid 图 |
| `youtube` | YouTube 章节 | 带时间戳的章节导航 |
| `podcast` | 播客笔记 | 嘉宾信息、亮点时刻、引用 |
| `cheatsheet` | 技术速查表 | 卡片式 Markdown |
| `x` / `shorts` | 社交媒体 | Twitter 线程 / 短视频脚本 |
| `casual` / `kids` | 口语化/儿童友好 | 轻松叙事风格 |
| `recap` / `interview` | 快速回顾 / 面试准备 | 60秒回顾 / Q&A 格式 |

#### 2.3 支持的视觉生成风格

| 风格 | 用途 |
|------|------|
| `thumbnail` (+ 6 种子风格) | YouTube 缩略图（MrBeast/Casey/Tech/DIY 等风格） |
| `infographic` | 信息图 |
| `comic` | 漫画风格故事 |
| `mindmap` | 思维导图 |
| `whiteboard` | 手绘白板风格 |
| `quote-card` | 金句卡片 |
| `scene` | 关键场景可视化 |

---

### 3. 技术栈

#### 3.1 开发技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|----------|
| **语言** | TypeScript | 5.9.3 |
| **构建工具** | Bun | 主要构建工具（也支持 npm） |
| **打包工具** | Bun Bundler | `--target browser` 模式 |
| **样式** | Tailwind CSS | v4.1.17 + @tailwindcss/postcss |
| **代码规范** | ESLint + Prettier | 标准配置 |
| **Chrome API** | Manifest V3 | Service Worker + Content Script + Side Panel |
| **存储** | IndexedDB | 自定义封装（大容量数据） |

#### 3.2 Chrome 扩展架构

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Page (youtube.com, etc.)                           │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ interceptor.js  │  │ content.js      │                  │
│  │ (injected into  │  │ (content script)│                  │
│  │  page context)  │  │                 │                  │
│  │ • Override fetch│  │ • Inject        │                  │
│  │ • Override XHR  │  │   interceptor   │                  │
│  │ • Post VTT data │→ │ • Relay to BG   │                  │
│  └─────────────────┘  └────────┬────────┘                  │
│                                │ postMessage                │
└────────────────────────────────┼────────────────────────────┘
                                 │ chrome.runtime.sendMessage
┌────────────────────────────────┼────────────────────────────┐
│  Extension Background          │                            │
│  ┌─────────────────────────────┴──────────┐                │
│  │ background.ts (Service Worker)         │                │
│  │ • VTT Cache Manager                    │                │
│  │ • Message Router                       │                │
│  │ • Side Panel State                     │                │
│  │ • History Management                   │                │
│  └────────────────────────────────────────┘                │
│                           │                                 │
│  ┌────────────────────────┴────────────────┐               │
│  │ Side Panel UI (sidepanel.html/ts)       │               │
│  │ • Variant Selector (Custom Dropdown)    │               │
│  │ • Provider Buttons                      │               │
│  │ • Output Type Toggle (text/image/video) │               │
│  │ • Aspect Ratio Toggle (wide/vertical)  │               │
│  │ • Reference Image Upload               │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3 关键设计模式

- **Connector 模式** (`vtt-connectors.ts`): 可扩展的 VTT 格式解析器，当前支持 YouTube JSON 格式和标准 VTT
- **Prompt 模板系统** (`prompts.ts`): 集中管理 28+ 种 prompt 模板，通过 `{transcript}` 占位符注入转录文本
- **Provider 配置驱动** (`providers.ts`): 每个 AI 服务通过 DOM selector 配置（prompt 输入框、提交按钮、前置操作），实现统一的注入逻辑
- **Variant 缓存分层** (`variantsCache.ts` / `promptHelpers.ts`): 系统模板 + 用户自定义模板的分层加载

---

### 4. 文件结构

```
capsummarize/
├── src/
│   ├── background.ts              # Service Worker 入口
│   ├── background/
│   │   ├── messageHandlers.ts     # 消息分发器
│   │   ├── sidePanelManager.ts    # Side Panel 状态管理
│   │   ├── storageHelpers.ts      # 存储工具
│   │   └── vttCacheManager.ts     # VTT 缓存管理
│   ├── content.ts                 # Content Script（注入 interceptor）
│   ├── interceptor.ts             # 页面内脚本：拦截 VTT 请求
│   ├── floating-icon.ts           # 浮动图标（页面内提示）
│   ├── manifest.ts                # Manifest V3 配置生成器
│   ├── config/
│   │   ├── prompts.ts             # 28+ AI Prompt 模板（~2178 行）
│   │   ├── promptHelpers.ts       # Prompt 模板辅助函数
│   │   ├── prePromptScripts.ts    # Provider 前置操作脚本
│   │   └── providers.ts           # AI Provider 配置（URL + Selector）
│   ├── services/
│   │   └── providerService.ts     # Provider 注入服务（DOM 操作核心）
│   ├── ui/
│   │   ├── components/
│   │   │   ├── HistoryList.ts     # 历史记录列表组件
│   │   │   └── SettingsForm.ts    # 设置表单组件
│   │   ├── state/
│   │   │   └── sidePanelState.ts  # Side Panel 状态
│   │   ├── sidepanel.ts           # Side Panel 主逻辑（~1803 行）
│   │   ├── settings.ts            # 设置页面逻辑
│   │   ├── ui-utils.ts            # UI 工具函数
│   │   ├── sidepanel.html         # Side Panel HTML
│   │   ├── settings.html          # 设置页面 HTML
│   │   └── llm-providers/         # Provider 图标资源
│   ├── utils/
│   │   ├── vtt.ts                 # VTT 文本提取 + 缩略图检测
│   │   ├── vtt-connectors.ts      # VTT Connector 注册表
│   │   ├── vttHistory.ts          # VTT 历史记录
│   │   ├── storage.ts             # IndexedDB 封装
│   │   ├── variantsCache.ts       # Variant 加载器
│   │   ├── promptsCache.ts        # Prompt 使用统计
│   │   ├── security.ts            # XSS 过滤 + Prompt 验证
│   │   ├── logger.ts              # 日志工具
│   │   ├── caption-enabler.ts     # 自动启用字幕
│   │   └── constants.ts           # 全局常量
│   ├── types/                     # TypeScript 类型定义
│   └── styles/
│       └── globals.css            # Tailwind 全局样式
├── examples/                      # 示例输出
│   ├── summaries/                 # 各风格摘要示例
│   └── images/                    # 生成图像示例 + Prompt
├── icons/                         # 扩展图标
├── scripts/
│   └── build-with-env.js          # 环境变量注入构建脚本
├── build-css.js                   # CSS 构建脚本
├── package.json                   # 项目配置（Bun 优先）
├── tailwind.config.js             # Tailwind 配置
├── tsconfig.json                  # TypeScript 配置
├── wrangler.jsonc                 # Cloudflare Wrangler 配置
├── AGENTS.md                      # AI Agent 上下文
├── CONTRIBUTING.md                # 贡献指南
├── LICENSE                        # MIT 许可证
└── README.md                      # 项目文档
```

---

### 5. 与 ContentForge 整合评估

#### 5.1 整合价值总评: **高**

CapSummarize 与 ContentForge 在**视频内容分析 → AI 内容生成**这条核心工作流上高度对齐。虽然两者的运行时环境不同（Chrome 扩展 vs Tauri 桌面应用），但 CapSummarize 的 **Prompt 模板系统**、**内容风格体系**和**VTT 处理逻辑**是可直接迁移的高价值资产。

#### 5.2 功能重叠度分析

| ContentForge 功能 | CapSummarize 对应功能 | 重叠度 |
|-------------------|----------------------|--------|
| YouTube 视频下载 | 字幕/转录提取 | 互补（下载 vs 在线分析） |
| 视频分析/转录 | VTT 解析 + 字幕拦截 | **高度重叠** |
| AI 内容生成 | 15+ 风格摘要 + 图像/视频生成 | **高度重叠** |
| 多 Agent 对话 | 单 Provider 注入模式 | 低重叠（架构不同） |
| Skill 系统 | Prompt 模板 + 自定义 Variant | **高度可借鉴** |
| Markdown/Notes/XHS/Slides/Video 输出 | Blog/X/Twitter/YouTube/图像/视频 | **输出类型对齐** |
| Tauri + Rust 后端 | Chrome 扩展架构 | 不重叠（需适配） |

---

### 6. 整合建议

#### 6.1 高优先级 — 直接复用/移植

**1. Prompt 模板系统 → ContentForge Skill 系统**
- **复用范围**: `src/config/prompts.ts` 中全部 28+ 种 prompt 模板
- **移植方式**: 将 prompt 模板迁移为 ContentForge 的 Skill 定义格式（JSON/YAML + 模板字符串）
- **适配点**:
  - 将 `{transcript}` 占位符替换为 ContentForge 的输入管道变量
  - 增加 `systemPrompt` / `userPrompt` 分离以适配多 Agent 架构
  - 为每种风格添加 Skill 元数据（icon、description、outputFormat、tags）
- **预期收益**: 直接获得 15+ 种成熟的文本生成风格和 12+ 种视觉生成风格，省去大量 prompt 工程工作

**2. VTT 解析逻辑 → 视频转录处理模块**
- **复用范围**: `src/utils/vtt.ts` + `src/utils/vtt-connectors.ts`
- **移植方式**: 将浏览器环境下的 VTT 解析提取为纯 TypeScript 工具函数
- **适配点**:
  - 移除浏览器相关依赖（`window`、DOM 操作）
  - 保留 `extractTextFromVTT()` 和 `isThumbnailVTT()` 核心逻辑
  - Connector 注册表模式可直接复用，方便未来支持更多平台格式
- **预期收益**: 获得经过实战验证的 YouTube/Zoom/Udemy 多平台字幕解析能力

**3. Provider 配置模式 → AI Provider 统一配置**
- **复用范围**: `src/config/providers.ts` 的配置结构理念
- **移植方式**: 参考其 `ProviderConfig` 接口设计 ContentForge 的 Provider 配置 schema
- **适配点**:
  - CapSummarize 使用 DOM selector 注入（浏览器特有），ContentForge 应改为 API/IPC 调用模式
  - 保留 `textConfig` / `imageConfig` / `videoConfig` 的分层配置思想
  - 参考其 `isImageCapableProvider()` / `isVideoCapableProvider()` 的能力检测模式
- **预期收益**: 建立统一的 Provider 能力声明体系，避免在 Tauri 端硬编码 Provider 能力

#### 6.2 中优先级 — 设计参考/部分复用

**4. UI 交互模式 → ContentForge 前端组件**
- **参考范围**: `src/ui/sidepanel.ts` 中的输出类型切换、风格选择器、参考图上传
- **可借鉴设计**:
  - Output Type Toggle（文本/图像/视频三段式切换）+ 条件渲染对应选项
  - Custom Dropdown 组件（带搜索/分类/自定义标签）
  - 参考图上传 → 预览 → 删除的完整交互流
  - Provider 能力过滤（根据 outputType 动态显示可用 Provider）
- **移植方式**: 将 DOM 操作逻辑改写为 React 组件状态管理

**5. 历史记录与存储模式**
- **参考范围**: `src/utils/storage.ts`（IndexedDB 封装）+ `src/utils/vttHistory.ts`
- **可借鉴点**:
  - 大容量数据（转录文本）与小数据（设置）分层存储策略
  - 带时间戳的数据版本管理
  - 过期数据自动清理机制
- **移植方式**: 将 IndexedDB 逻辑替换为 Tauri SQLite/文件系统存储

**6. 安全过滤机制**
- **复用范围**: `src/utils/security.ts`
- **移植方式**: 直接复用 `sanitizeInput()`、`sanitizeVTTContent()`、`isValidPrompt()` 三个函数
- **预期收益**: 获得经过 Chrome Web Store 安全审核验证的输入过滤逻辑

#### 6.3 低优先级 — 架构差异较大

**7. Chrome 扩展特有模块 — 不可直接复用**

| 模块 | 不可复用原因 | 替代方案（ContentForge） |
|------|------------|----------------------|
| `interceptor.ts` | 依赖 `window.fetch`/`XMLHttpRequest` 覆盖和 `window.postMessage` | 在 Tauri 中通过 Rust 后端调用 yt-dlp 提取字幕 |
| `content.ts` | Content Script 是 Chrome 扩展特有概念 | 无需对应，ContentForge 是桌面应用 |
| `background.ts` | Service Worker 生命周期和 API 与 Tauri 完全不同 | Tauri 的主进程（Rust）+ 事件系统 |
| `providerService.ts` 注入逻辑 | 依赖 `chrome.scripting.executeScript` 和 DOM 操作 | 改为直接调用各 Provider API（OpenAI/Claude/Gemini 等 SDK） |
| Side Panel UI | Chrome Side Panel API 特有 | 改为 ContentForge 的 React 页面路由 |

#### 6.4 推荐的整合实施路径

```
Phase 1: Prompt 资产迁移（1-2 天）
├── 提取 prompts.ts 中所有 prompt 模板
├── 转换为 ContentForge Skill 格式
├── 建立 Skill 分类体系（text / image / video）
└── 在 ContentForge 中注册并测试输出质量

Phase 2: VTT 工具函数移植（1 天）
├── 提取 vtt.ts 和 vtt-connectors.ts 核心逻辑
├── 移除浏览器依赖，转为纯 Node.js/TypeScript 模块
├── 集成到 ContentForge 的视频分析管道
└── 测试多平台字幕解析（YouTube/Zoom/Udemy）

Phase 3: Provider 配置适配（1 天）
├── 参考 providers.ts 设计 ContentForge Provider schema
├── 实现 Provider 能力声明和过滤
└── 将注入模式改为 API 调用模式

Phase 4: UI 组件开发（2-3 天）
├── 基于 sidepanel.ts 交互设计开发 React 组件
├── 实现风格选择器、输出类型切换、参考图上传
└── 集成到 ContentForge 的下载/分析结果页面
```

#### 6.5 整合注意事项

1. **Prompt 版权**: CapSummarize 使用 MIT 许可证，prompt 模板可直接复用，建议保留原作者致谢
2. **Provider 注入 vs API 调用**: CapSummarize 的 Provider 注入模式（打开网页自动填 prompt）是其架构限制下的巧妙方案。ContentForge 作为桌面应用，应直接使用各 Provider 的官方 SDK/HTTP API，体验更佳
3. **图像/视频生成**: CapSummarize 的图像/视频 prompt 模板质量很高，但 ContentForge 需要集成对应的图像生成 API（DALL-E、Midjourney API、Stable Diffusion 等）而非依赖网页注入
4. **历史数据不兼容**: CapSummarize 的 IndexedDB 数据格式与 ContentForge 的 SQLite schema 不同，历史记录无法直接迁移

---

### 附录：Prompt 模板完整清单

**文本摘要（16 种）**: `default`, `educational`, `technical`, `executive`, `marketing`, `news`, `podcast`, `kids`, `blog`, `youtube`, `cheatsheet`, `recap`, `interview`, `x`, `shorts`, `casual`

**图像生成（12 种）**: `thumbnail`, `thumbnail-mrbeast`, `thumbnail-casey`, `thumbnail-theo`, `thumbnail-5min`, `thumbnail-tweet`, `infographic`, `comic`, `mindmap`, `whiteboard`, `quote-card`, `scene`

**视频生成（6 种）**: `video-ad`, `video-trailer`, `video-recap`, `video-explainer`, `video-cinematic`, `video-social`

**总计**: 34 种内置模板 + 用户自定义模板扩展
