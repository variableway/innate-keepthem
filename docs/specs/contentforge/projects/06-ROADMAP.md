# ContentForge — 路线图

> 文档版本: v1.0  
> 更新日期: 2026-08-03  
> 当前阶段: Phase 1 — 核心基础

---

## 一、阶段总览

```
Phase 1 (现在-2周)    Phase 2 (2-6周)      Phase 3 (6-10周)     Phase 4 (10-14周)
核心基础               功能增强              生态扩展              产品化
  │                    │                    │                    │
  ▼                    ▼                    ▼                    ▼
┌─────────┐          ┌─────────┐          ┌─────────┐          ┌─────────┐
│Chat UI  │          │多平台   │          │Chrome   │          │Skill    │
│端到端   │    →     │采集     │    →     │扩展     │    →     │市场     │
│贯通     │          │Plugin   │          │发布     │          │上线     │
└─────────┘          └─────────┘          └─────────┘          └─────────┘
```

---

## 二、Phase 1: 核心基础（现在 — 2 周）

**目标**: 让 Chat 对话框真正可用，完成第一个端到端工作流

### 2.1 关键交付物

| # | 任务 | 优先级 | 负责人 | 验收标准 |
|---|------|--------|--------|----------|
| 1.1 | Chat UI 完整实现 | 🔴 P0 | Frontend | 消息列表、流式渲染、工具调用卡片、Agent 切换器 |
| 1.2 | Agent 运行环境联调 | 🔴 P0 | Backend | Rust `agent_runner.rs` ↔ Python `chat_engine.py` 通信贯通 |
| 1.3 | 流式事件系统 | 🔴 P0 | Backend | `message.delta` / `tool.call.*` 端到端事件流 |
| 1.4 | Twitter Plugin 实现 | 🔴 P0 | Core | agent-reach 集成，完成首个非 YouTube 采集源 |
| 1.5 | 资产 CRUD 完整实现 | 🔴 P0 | Fullstack | Rust 后端 + 前端联调，资产列表/详情/编辑 |
| 1.6 | YouTube → 笔记 Pipeline | 🟡 P1 | Core | 下载 → 字幕 → 摘要 → 笔记，一键执行 |
| 1.7 | 仪表盘首页 | 🟡 P1 | Frontend | 快捷入口、最近活动、统计概览 |

### 2.2 技术要点

```
Phase 1 技术焦点:

┌─────────────────────────────────────────────────────────────┐
│  1. Rust ↔ Python 通信协议                                    │
│     • IPC Command → 启动 Python Agent 进程                     │
│     • stdout JSON 流式解析                                    │
│     • 错误处理和超时机制                                       │
│                                                              │
│  2. Tauri Event 流式系统                                      │
│     • emit() 推送增量 token                                   │
│     • listen() 前端实时渲染                                   │
│     • 取消机制（中断 LLM 生成）                                │
│                                                              │
│  3. Agent Session 状态管理                                    │
│     • 多轮对话上下文维护                                       │
│     • 工具调用结果注入                                         │
│     • Agent 切换时上下文保持                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、Phase 2: 功能增强（2-6 周）

**目标**: 扩展采集源覆盖，丰富 AI 处理能力

### 3.1 关键交付物

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 2.1 | RSS Plugin | 🟡 P1 | RSS Feed 采集和解析 |
| 2.2 | Web Page Plugin | 🟡 P1 | Jina Reader / crawl4ai 网页采集 |
| 2.3 | 流水线引擎完善 | 🟡 P1 | 错误恢复、重试机制、预设模板丰富化 |
| 2.4 | capsummarize 整合 | 🟡 P1 | 迁移 34 种 AI Prompt 模板为 Skill |
| 2.5 | VTT 解析器增强 | 🟡 P1 | 多平台字幕解析（YouTube/Zoom/Udemy） |
| 2.6 | 采集页面 | 🟡 P1 | URL 输入、批量导入、Plugin 选择 UI |
| 2.7 | 内容处理页面 | 🟡 P1 | AI 处理操作面板（摘要/翻译/分析/改写） |
| 2.8 | 发布/导出页面 | 🟡 P1 | 多格式导出、发布 Profile 管理 |
| 2.9 | youtube-rag-system 整合 | 🟢 P2 | Python Sidecar: 5层 fallback 转录 + RAG |
| 2.10 | 双视频对比 | 🟢 P2 | 多视频分析对比功能 |

### 3.2 外部仓库整合 Phase 1

| 仓库 | 整合内容 | 工作量 | 方式 |
|------|---------|--------|------|
| capsummarize | 34 Prompt 模板 | 1-2 天 | 迁移为 Skill JSON |
| capsummarize | VTT 解析器 | 1 天 | 移植到前端 utils |
| youtube-rag-system | 转录提取 | 3-5 天 | Python Sidecar FastAPI |
| frameflow | FFmpeg 封装 | 2-3 天 | Rust Tauri 后端命令 |

---

## 四、Phase 3: 生态扩展（6-10 周）

**目标**: 构建内容创作生态，支持视频生成和浏览器扩展

### 4.1 关键交付物

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 3.1 | Chrome 扩展 | 🟡 P1 | URL 提取、一键采集、与 Desktop 通信 |
| 3.2 | Remotion 视频渲染 | 🟡 P1 | 视频摘要 → Remotion 合成 → MP4 输出 |
| 3.3 | 场景检测 | 🟡 P1 | PySceneDetect 集成，视频自动分割 |
| 3.4 | Skill 编辑器 | 🟢 P2 | 可视化 Skill 创建和编辑 |
| 3.5 | Plugin 管理面板 | 🟢 P2 | 安装/配置/启用禁用 Plugin |
| 3.6 | 质量门控 | 🟢 P2 | 内容质量评分、自动校验 |
| 3.7 | API 预算控制 | 🟢 P2 | AI 调用成本追踪和限制 |
| 3.8 | 播客 Plugin | 🟢 P2 | RSS + 音频下载 + Whisper 转录 |
| 3.9 | Reddit / HN Plugin | 🟢 P2 | 社区内容采集 |
| 3.10 | frameflow 整合 | 🟢 P2 | 场景检测、时间线模型 |

### 4.2 外部仓库整合 Phase 2

| 仓库 | 整合内容 | 工作量 |
|------|---------|--------|
| youtube-rag-system | RAG Pipeline（单视频问答） | 1-2 周 |
| frameflow | 场景检测 + 时间线数据模型 | 1 周 |
| OpenMontage | Remotion 渲染集成 | 1-2 周 |
| skill-studio | 平台检测 + Diff 组件 | 3-5 天 |

---

## 五、Phase 4: 产品化（10-14 周）

**目标**: 打磨用户体验，构建 Skill 市场

### 5.1 关键交付物

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 4.1 | Skill 市场 | 🟡 P1 | 浏览/搜索/安装/分享 Skill |
| 4.2 | 系统托盘 | 🟢 P2 | macOS 菜单栏常驻 |
| 4.3 | 全局快捷键 | 🟢 P2 | 快捷键唤起采集 |
| 4.4 | 通知系统 | 🟢 P2 | 下载/处理完成通知 |
| 4.5 | 多语言完整支持 | 🟢 P2 | i18n 全量翻译 |
| 4.6 | 移动端适配 | 🟢 P2 | 响应式布局 |
| 4.7 | 自动化/定时任务 | 🟢 P2 | Cron 式定时采集 |
| 4.8 | 团队协作 | 🟢 P2 | 共享资产、共享 Skill |
| 4.9 | 数据分析面板 | 🟢 P2 | 使用统计、成本分析 |
| 4.10 | 文档完善 | 🟢 P2 | 用户文档、API 文档 |

---

## 六、里程碑

```
Milestone 1 — Chat 可用（Phase 1 结束）
├── ✅ 完整的 Chat 对话体验
├── ✅ Agent 自动切换
├── ✅ 工具调用可视化
├── ✅ 至少 2 个采集源（YouTube + Twitter）
└── ✅ 资产上下文关联

Milestone 2 — 工作流可用（Phase 2 结束）
├── ✅ 5+ 采集源覆盖
├── ✅ 5+ 预设 Pipeline
├── ✅ 30+ Skill 模板
├── ✅ 多格式导出（MD/小红书/笔记）
└── ✅ 视频转录+摘要 Pipeline

Milestone 3 — 生态成型（Phase 3 结束）
├── ✅ Chrome 扩展发布
├── ✅ 视频生成功能
├── ✅ Skill 编辑器
├── ✅ Plugin 市场雏形
└── ✅ 质量门控系统

Milestone 4 — 产品发布（Phase 4 结束）
├── ✅ Skill 市场上线
├── ✅ 完整文档
├── ✅ 多语言支持
├── ✅ 稳定版本发布
└── ✅ 开源社区运营
```

---

## 七、风险与对策

| 风险 | 可能性 | 影响 | 对策 |
|------|--------|------|------|
| Twitter API 变动 | 高 | 高 | 多策略备份（agent-reach/Nitter/浏览器扩展） |
| yt-dlp 被 YouTube 封锁 | 中 | 高 | 关注 yt-dlp 更新，准备备用方案 |
| AI API 成本超支 | 中 | 中 | 预算控制、本地 Ollama 支持、Token 预算管理 |
| Rust ↔ Python 通信复杂 | 中 | 高 | 早期重点验证，预留 HTTP Sidecar 方案 |
| 前端性能问题 | 低 | 中 | 虚拟滚动、分页加载、按需渲染 |
| 开源许可证冲突 | 低 | 高 | OpenMontage AGPL 仅架构借鉴，独立实现 |

---

## 八、相关文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 项目愿景 | [00-PROJECT-VISION.md](00-PROJECT-VISION.md) | 愿景、核心概念 |
| 架构总览 | [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) | 系统架构 |
| 模块状态 | [02-MODULE-STATUS.md](02-MODULE-STATUS.md) | 各模块功能状态 |
| Plugin 系统 | [03-PLUGIN-SYSTEM.md](03-PLUGIN-SYSTEM.md) | Plugin 架构 |
| Skill 系统 | [04-SKILL-SYSTEM.md](04-SKILL-SYSTEM.md) | Skill 设计 |
| 内容生命周期 | [05-CONTENT-LIFECYCLE.md](05-CONTENT-LIFECYCLE.md) | 生命周期 |
