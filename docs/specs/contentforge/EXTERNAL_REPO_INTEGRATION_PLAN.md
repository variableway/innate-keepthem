# ContentForge 外部仓库整合规划

> 基于对 7 个 GitHub 仓库的深入分析，本文档提供完整的整合优先级、路径规划和实施建议。
> 分析时间: 2026-07-25

---

## 一、仓库整合评估总览

| # | 仓库 | 功能定位 | 技术栈 | 整合价值 | 整合策略 |
|---|------|----------|--------|---------|---------|
| 1 | **skill-studio** | Skill 资产管理器（45+ 平台） | Tauri v2 + React + Rust + SQLite | 🔴 **高** | 架构借鉴 + 部分模块移植 |
| 2 | **frameflow** | AI 视频处理 + 时间线编辑 | Electron + Vue 3 + FFmpeg | 🔴 **高** | 算法移植 + Pipeline 借鉴 |
| 3 | **capsummarize** | Chrome 扩展：视频转录 + 34 种 AI 模板 | Chrome Extension + TypeScript | 🔴 **高** | Prompt 资产迁移 + VTT 模块 |
| 4 | **youtube-rag-system (ClipIQ)** | YouTube RAG 问答引擎 | FastAPI + Python + LangChain | 🔴 **高** | Python Sidecar 微服务 |
| 5 | **OpenMontage** | AI 编排视频生产平台 | Python + Remotion + FastAPI | 🔴 **高** | 架构借鉴 + 渲染引擎集成 |
| 6 | **skill-zoo** | Agent Skill 包管理器 | Tauri v2 + React + Rust | 🟡 **中** | 架构参考（UI/IPC/状态管理） |
| 7 | **Video-Note-Extractor** | Python 视频转笔记脚本 | Python + Whisper + Gemini | 🟢 **低** | Prompt 模板参考即可 |

---

## 二、整合优先级矩阵

### P0 — 立即整合（1-2 周）

| 来源 | 可复用资产 | 整合方式 | 工作量 |
|------|-----------|---------|--------|
| capsummarize | 34 种 AI Prompt 模板 | 迁移为 ContentForge Skill JSON | 1-2 天 |
| capsummarize | VTT 解析逻辑 (`vtt.ts`) | 移植到前端 utils | 1 天 |
| youtube-rag-system | 5层 fallback 转录提取 | Python Sidecar FastAPI 服务 | 3-5 天 |
| frameflow | FFmpeg 封装命令 | Rust Tauri 后端命令 | 2-3 天 |

### P1 — 短期整合（2-4 周）

| 来源 | 可复用资产 | 整合方式 | 工作量 |
|------|-----------|---------|--------|
| youtube-rag-system | RAG 问答/摘要 Pipeline | 扩展 Sidecar 服务接口 | 1-2 周 |
| frameflow | 场景检测 (PySceneDetect) | 集成为视频分析 Skill | 3-5 天 |
| frameflow | 时间线数据模型 | 视频编辑功能蓝本 | 1 周 |
| OpenMontage | 视频合成引擎 (Remotion) | Node.js 子进程渲染 | 1-2 周 |
| skill-studio | 平台检测与同步逻辑 | Rust 后端移植 | 3-5 天 |
| skill-studio | Diff 组件 | React 组件复用 | 2-3 天 |

### P2 — 中期整合（1-2 月）

| 来源 | 可复用资产 | 整合方式 | 工作量 |
|------|-----------|---------|--------|
| OpenMontage | 技能系统三层架构 | 升级 Agent 能力设计 | 2-3 周 |
| OpenMontage | 质量门控与审计追踪 | 内容质量保障层 | 1-2 周 |
| OpenMontage | 预算控制系统 | API 成本治理 | 1 周 |
| skill-zoo | Tauri IPC 命令组织模式 | 重构 Rust 后端 | 1-2 周 |
| skill-zoo | 前端状态管理模式 | Zustand 优化参考 | 3-5 天 |

### P3 — 参考借鉴（不直接整合）

| 来源 | 借鉴内容 | 用途 |
|------|---------|------|
| Video-Note-Extractor | 四段式笔记 Prompt 模板 | 笔记生成 Skill 默认 Prompt |
| skill-zoo | Markdown 编辑器/文件树 UI | 前端组件设计参考 |
| frameflow | 视频编辑器 PRD（10万字符） | 产品规划参考 |

---

## 三、技术架构整合方案

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ContentForge Desktop App                         │
│                    (Tauri v2 + Next.js + React + Rust)                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Chat UI    │  │  Skill Panel │  │ Content View │  │ Video Editor │ │
│  │  (React)     │  │  (React)     │  │  (React)     │  │  (React)     │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │                 │         │
│  ┌──────▼─────────────────▼─────────────────▼─────────────────▼───────┐ │
│  │                      Zustand Store Layer                            │ │
│  │         (downloadStore | settingsStore | skillStore | chatStore)    │ │
│  └──────┬─────────────────┬─────────────────┬─────────────────┬───────┘ │
│         │                 │                 │                 │         │
│  ┌──────▼──────┐  ┌───────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐  │
│  │ Tauri IPC   │  │ Tauri IPC    │  │ Tauri IPC   │  │  HTTP API   │  │
│  │ Commands    │  │ Commands     │  │ Commands    │  │  (Sidecar)  │  │
│  └──────┬──────┘  └───────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────┘
          │                 │                 │                 │
┌─────────▼─────────────────▼─────────────────▼─────────────────▼─────────┐
│                         Rust Backend (Tauri)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  Download   │  │  Database   │  │  FFmpeg     │  │  Skill Registry │ │
│  │  Manager    │  │  (SQLite)   │  │  Wrapper    │  │  (Rust)         │ │
│  │  (yt-dlp)   │  │             │  │             │  │                 │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└────────────────────────────────────────┬────────────────────────────────┘
                                         │
                              ┌──────────▼──────────┐
                              │   Python Sidecar    │
                              │   (FastAPI Server)  │
                              ├─────────────────────┤
                              │ • RAG Pipeline      │
                              │ • Transcript Extract│
                              │ • LangChain Chains  │
                              │ • ChromaDB          │
                              │ • Whisper Transcribe│
                              └──────────┬──────────┘
                                         │
                              ┌──────────▼──────────┐
                              │   Remotion Render   │
                              │   (Node.js Child)   │
                              └─────────────────────┘
```

### 3.2 模块整合详细设计

#### A. Capsummarize → ContentForge Skill 系统

```
capsummarize 34 Prompt 模板 ──→ ContentForge Skill JSON 格式

before:
  Chrome Extension 直接注入 ChatGPT DOM

after:
  1. Prompt 模板 → src-tauri/skills/capsummarize/
     ├── summary.json          # 文本摘要
     ├── key-points.json       # 关键点提取
     ├── short-video-script.json
     ├── thumbnail-idea.json
     └── ... (34 templates)

  2. VTT 解析 → apps/desktop/src/lib/vtt-parser.ts
     ├── YouTube VTT
     ├── Zoom VTT
     └── Udemy VTT

  3. UI → apps/desktop/src/components/skill-output-panel.tsx
     ├── 输出类型切换器
     └── 风格选择器
```

#### B. youtube-rag-system → Python Sidecar

```
ClipIQ FastAPI Backend ──→ ContentForge Sidecar Process

整合方案:
  1. 打包为独立 Python 可执行文件 (PyInstaller/uv)
  2. Tauri 启动时作为 sidecar 进程启动
  3. Next.js 前端通过 HTTP API 调用

接口映射:
  POST /api/analyze        → 单视频 RAG 分析
  POST /api/compare        → 双视频对比
  POST /api/transcript     → 转录提取（带 fallback）
  POST /api/qa             → 时间戳问答

环境变量注入:
  - OPENROUTER_API_KEY
  - YOUTUBE_DATA_API_KEY
  - OLLAMA_HOST
```

#### C. frameflow → 视频处理模块

```
FrameFlow FFmpeg/Vue ──→ ContentForge Rust + React

可移植模块:
  1. FFmpeg 命令封装
     - 降采样: `-vf scale=480:-2`
     - 音频提取: `-vn -acodec copy`
     - 静音检测: `silencedetect`
     - 视频组装: `concat`

  2. 场景检测 Pipeline
     PySceneDetect ──→ Python Sidecar 接口
     POST /api/scene-detect {video_path}

  3. 时间线数据模型 (TypeScript)
     interface Timeline {
       tracks: Track[];
       duration: number;
       fps: number;
     }
     interface Track {
       id: string;
       type: 'video' | 'audio' | 'text';
       items: TimelineItem[];
     }
```

#### D. OpenMontage → 视频渲染引擎

```
OpenMontage Remotion ──→ ContentForge Video Export

整合方案:
  1. 在 Rust 后端添加 Node.js 子进程调用
  2. 前端传入：视频片段列表 + 字幕 + BGM + 风格模板
  3. Remotion 渲染输出 MP4/WebM

渲染 Pipeline:
  ContentForge UI ──→ Rust IPC ──→ Node.js Script
                                      ↓
                                Remotion Composition
                                      ↓
                                FFmpeg 后处理
                                      ↓
                                输出到下载目录
```

#### E. skill-studio → Skill 管理中心

```
Skill Studio 平台检测 ──→ ContentForge 平台适配器

可移植模块:
  1. 45+ 平台目录识别逻辑 (Rust)
  2. Skill 快照/版本管理 (SQLite Schema)
  3. Diff 组件 (React)
  4. 文件系统操作封装 (Rust)

不移植:
  - Ant Design UI（改为 Tailwind）
  - Vite 配置（已有 Next.js）
  - React Context（已有 Zustand）
```

---

## 四、实施路线图

### Phase 1: 基础能力补齐（第 1-2 周）

**目标**: 快速获得 Prompt 模板库和转录能力

| 天数 | 任务 | 来源仓库 |
|------|------|---------|
| 1-2 | 迁移 34 种 Prompt 模板为 Skill JSON | capsummarize |
| 2-3 | 移植 VTT 解析器到前端 | capsummarize |
| 3-5 | 搭建 Python Sidecar FastAPI 框架 | youtube-rag-system |
| 5-7 | 集成 5层 fallback 转录提取 | youtube-rag-system |
| 7-10 | 封装 FFmpeg Rust 命令 | frameflow |
| 10-14 | 联调测试 + Bug 修复 | - |

**交付物**:
- `src-tauri/skills/capsummarize/` — 34 个 Skill 模板
- `apps/desktop/src/lib/vtt-parser.ts` — VTT 解析器
- `sidecar/` — Python FastAPI Sidecar 服务
- 视频转录功能可用

### Phase 2: 核心功能增强（第 3-6 周）

**目标**: RAG 问答、场景检测、视频合成

| 周次 | 任务 | 来源仓库 |
|------|------|---------|
| 3 | RAG Pipeline 集成（单视频分析） | youtube-rag-system |
| 4 | 场景检测 + 关键帧提取 | frameflow |
| 5 | Remotion 视频渲染集成 | OpenMontage |
| 6 | Skill 管理中心基础版 | skill-studio |

**交付物**:
- 视频智能问答功能
- 视频场景自动分割
- 基础视频合成功能（片段+字幕+BGM）
- Skill 版本管理 UI

### Phase 3: 高级功能（第 7-10 周）

**目标**: 双视频对比、质量门控、预算控制

| 周次 | 任务 | 来源仓库 |
|------|------|---------|
| 7-8 | 双视频对比分析 | youtube-rag-system |
| 8-9 | 内容质量门控 | OpenMontage |
| 9-10 | API 预算控制 + 成本追踪 | OpenMontage |

**交付物**:
- 多视频对比视图
- 内容质量评分
- API 调用成本仪表盘

### Phase 4: 架构优化（第 11-12 周）

**目标**: 重构和性能优化

| 周次 | 任务 | 来源仓库 |
|------|------|---------|
| 11 | Rust 后端模块化重构 | skill-zoo |
| 12 | 前端状态管理优化 | skill-zoo |

**交付物**:
- 清晰的模块边界
- 可扩展的 IPC 命令体系

---

## 五、风险评估与对策

| 风险 | 等级 | 对策 |
|------|------|------|
| **AGPL 许可证冲突** (OpenMontage) | 🔴 高 | 仅架构借鉴，不直接引用代码；独立实现关键模块 |
| **Python Sidecar 打包复杂** | 🟡 中 | 使用 `uv` + `PyInstaller` 或 Docker 容器化 |
| **技术栈差异大** (Vue→React, Electron→Tauri) | 🟡 中 | 只移植算法/逻辑，UI 全部重写 |
| **依赖管理膨胀** | 🟡 中 | 按需加载 Python 依赖；Sidecar 独立环境 |
| **API Key 安全** | 🟡 中 | Tauri secure storage + 环境变量注入 |
| **Remotion 商业许可** | 🟡 中 | 开源项目免费；确认使用条款 |
| **项目成熟度** (skill-studio v0.1.0) | 🟢 低 | 仅借鉴已验证的模式，不依赖不稳定 API |
| **Video-Note-Extractor 价值低** | 🟢 低 | 仅参考 Prompt 设计，不引入代码 |

---

## 六、文件结构建议（整合后）

```
contentforge/
├── apps/
│   └── desktop/              # Next.js + Tauri 桌面应用
│       ├── src/
│       │   ├── app/          # Next.js 页面
│       │   ├── components/   # React 组件
│       │   ├── lib/
│       │   │   ├── api-client.ts
│       │   │   ├── vtt-parser.ts          # ← from capsummarize
│       │   │   └── sidecar-client.ts      # ← Python Sidecar HTTP 客户端
│       │   ├── store/        # Zustand stores
│       │   └── skills/       # Skill 配置
│       │       └── capsummarize/          # ← 34 Prompt 模板
│       └── src-tauri/
│           ├── src/
│           │   ├── commands/ # Tauri IPC 命令
│           │   ├── services/ # Rust 服务层
│           │   ├── ffmpeg.rs              # ← from frameflow
│           │   └── skill_registry.rs      # ← from skill-studio
│           └── skills/
│               └── capsummarize.json
├── sidecar/                  # Python Sidecar 服务
│   ├── main.py               # FastAPI 入口
│   ├── transcript.py         # ← from youtube-rag-system
│   ├── pipeline.py           # ← RAG Pipeline
│   ├── multi_video_pipeline.py
│   ├── scene_detect.py       # ← from frameflow
│   └── requirements.txt
├── render/                   # Remotion 渲染引擎
│   ├── src/
│   │   ├── compositions/
│   │   └── templates/
│   └── package.json
├── docs/
│   ├── spec/                 # SPEC 文档
│   └── external-analysis/    # 外部仓库分析报告
│       ├── skill-zoo_ANALYSIS.md
│       ├── skill-studio_ANALYSIS.md
│       ├── capsummarize_ANALYSIS.md
│       ├── frameflow_ANALYSIS.md
│       ├── youtube-rag-system_ANALYSIS.md
│       └── OpenMontage_ANALYSIS.md
└── external-repos/           # 克隆的外部仓库（参考用）
    ├── skill-zoo/
    ├── skill-studio/
    ├── capsummarize/
    ├── frameflow/
    ├── youtube-rag-system/
    ├── OpenMontage/
    └── Video-Note-Extractor/
```

---

## 七、各仓库详细分析索引

每个仓库的完整分析报告位于：

| 仓库 | 报告路径 | 大小 |
|------|---------|------|
| skill-zoo | `external-repos/skill-zoo_ANALYSIS.md` | 14 KB |
| skill-studio | `external-repos/skill-studio_ANALYSIS.md` | 17 KB |
| Video-Note-Extractor | `external-repos/Video-Note-Extractor_ANALYSIS.md` | 8.7 KB |
| frameflow | `external-repos/frameflow_ANALYSIS.md` | 19 KB |
| capsummarize | `external-repos/capsummarize_ANALYSIS.md` | 19 KB |
| youtube-rag-system | `external-repos/youtube-rag-system_ANALYSIS.md` | 18 KB |
| OpenMontage | `external-repos/OpenMontage_ANALYSIS.md` | 21 KB |

---

*文档版本: v1.0*
*ContentForge 整合规划*
