## skill-zoo 仓库分析

> 分析日期：2026-07-25
> 仓库路径：`/Users/patrick/innate/projects/innate-keepthem/contentforge/external-repos/skill-zoo/`
> 原始仓库：https://github.com/luochang212/skill-zoo

---

### 1. 项目概述

**skill-zoo** 是一个开源的**本地 Agent Skill 管理器**（Local Agent Skills Manager），用于为 AI 编码工具发现、安装、创建和管理 Skill 文件。项目核心洞察是："一个 Skill 就是一个文件"——这个应用本质上是一个带有专用 UI 的文件管理器。

**项目定位**：面向 AI 编码助手（Claude Code、Codex、Gemini、Cursor、Trae 等）的 Skill 生态管理工具，提供桌面 GUI + CLI 双重控制界面。

**版本**：v0.3.40 | **License**：MIT | **平台**：macOS / Windows / Linux

**分发形态**：
- **Desktop App**：Tauri v2 桌面应用（主产品）
- **CLI**：npm 包 `skill-zoo`（`skill-zoo list`、`skill-zoo doctor`、`skill-zoo wui` 等）
- **WUI**：CLI 启动的轻量本地 Web UI

---

### 2. 功能分析

#### 2.1 核心功能

| 功能模块 | 说明 |
|---------|------|
| **浏览与发现** | 从 GitHub 仓库搜索 Skill，支持推荐仓库轮播、关键词搜索 |
| **安装与更新** | 从 GitHub 下载 ZIP 解压安装，支持单 Skill / 批量更新，追踪 commit SHA |
| **Skill 创作** | 内置 Markdown 编辑器，支持 YAML frontmatter（name / description），实时预览 |
| **批量操作** | 批量安装、删除、合并重复 Skill、归档/恢复 |
| **安全审计** | 集成 skills.sh 社区审计分数，显示 pass/warn/fail 状态 |
| **一致性检查** | 主动检测三类不一致：duplicate（重复）、conflict（冲突）、mismatch（不匹配） |
| **Skill 归档** | 将 Skill 移入 `~/.skill-zoo/archive/` 作为临时存储，减少 Agent 上下文负载 |
| **外部导入** | 扫描本地磁盘上的 Skill 目录并作为 symlink 导入管理，不移动源文件 |
| **多 Agent 兼容** | 支持 17 种 AI 编码工具，通过 symlink/junction 统一管理 |
| **使用追踪** | 解析 Agent 的使用记录（仅 Claude Code / Codex / OpenCode 支持） |

#### 2.2 Skill 生命周期

```
GitHub 仓库 ──→ 下载 ZIP ──→ 解压到 ~/.agents/skills/<name>/ ──→ 向各 Agent 目录创建 symlink
     ↑                                                              │
     └──────── 检测 commit SHA 差异 ─────────────────────────────────┘

本地 Skill 目录 ──→ 外部导入 ──→ 注册到 imports.json ──→ 向 Agent 目录创建 symlink
```

#### 2.3 设计哲学

- **文件系统是真相来源**：缓存不是真相，文件系统才是。缓存从文件系统状态重建。
- **SSOT + Symlinks**：`~/.agents/skills/` 是规范存储，Agent 目录只包含指向真实位置的 symlink/junction。
- **尊重用户文件**：本地 Skill 绝不复制或移动，直接 symlink。
- **Tauri IPC 是唯一桥梁**：前端从不触碰文件系统，所有外部交互通过类型化的 Rust 命令完成。

---

### 3. 技术栈

#### 3.1 前端层

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.2.7 | UI 框架 |
| TypeScript | ^6.0.3 | 类型系统 |
| Vite | ^8.1.3 | 构建工具 |
| Tailwind CSS | ^4.3.2 | 原子化样式 |
| shadcn/ui | — | UI 组件基座（Radix UI 封装） |
| TanStack React Query | ^5.101.2 | 服务端状态管理 |
| Framer Motion | ^12.42.2 | 动画过渡 |
| i18next + react-i18next | ^26.3.4 | 国际化（中/英） |
| react-markdown + rehype | ^10.1.0 | Markdown 渲染 |
| @dnd-kit/react | 0.5.0 | 拖放交互 |
| lucide-react | ^1.23.0 | 图标 |
| modern-screenshot | ^4.7.0 | 截图 |

#### 3.2 后端层（Rust / Tauri v2）

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | v2 | 桌面运行时 |
| reqwest | 0.13 | HTTP 客户端（GitHub API / ZIP 下载） |
| tokio | 1.x | 异步运行时 |
| serde + serde_json | 1.0 | 序列化 |
| serde_yaml | 0.9 | YAML frontmatter 解析 |
| rusqlite | 0.32 | SQLite（bundled） |
| chrono | 0.4 | 时间处理 |
| sha2 | 0.11 | 内容哈希 |
| zip | 8.6 | ZIP 解压 |
| notify | 7 | 文件系统监听 |
| arboard | 3.6.1 | 剪贴板 |
| regex | 1.12 | 正则 |
| dirs | 6.0 | 跨平台目录路径 |

#### 3.3 CLI 层

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥20 | 运行时 |
| Commander.js | ^14.0.2 | CLI 框架 |
| unified + remark/rehype | ^11.0.5 | Markdown 处理 |
| yaml | ^2.8.2 | YAML 解析 |
| tsup | ^8.5.1 | 构建打包 |

#### 3.4 工具链

| 环节 | 工具 |
|------|------|
| Lint | oxlint + clippy |
| Format | oxfmt + cargo fmt |
| Test | Vitest（前端）+ Rust tests（后端） |
| Package Manager | Bun |
| CI | GitHub Actions |

---

### 4. 文件结构

```
skill-zoo/
├── src/                              # React 前端
│   ├── App.tsx                       # 根组件：视图路由（discover / local / settings）
│   ├── components/
│   │   ├── skills/                   # Skill 浏览、详情、安装、创建
│   │   │   ├── BrowseSkills.tsx      # 发现页：搜索、推荐仓库
│   │   │   ├── InstalledSkills.tsx   # 本地 Skill 列表 + 侧边栏分类
│   │   │   ├── SkillDetail.tsx       # Skill 详情：Markdown 编辑器/预览
│   │   │   ├── SkillCreateView.tsx   # 新建 Skill
│   │   │   ├── SkillCard.tsx         # Skill 卡片组件
│   │   │   ├── SkillFileTree.tsx     # 文件树
│   │   │   ├── ConsistencyPanel.tsx  # 一致性检查面板
│   │   │   └── ...
│   │   ├── settings/                 # 设置页：主题、语言、维护、关于
│   │   ├── layout/                   # 顶部导航 Header
│   │   └── ui/                       # shadcn/ui 基础组件
│   ├── hooks/                        # React Query hooks & 缓存失效
│   ├── i18n/                         # 翻译文件（en.json / zh.json）
│   ├── lib/                          # Tauri API 客户端、Agent 配置、工具函数
│   └── types/skills.ts               # TypeScript 类型定义
│
├── src-tauri/                        # Tauri + Rust 后端
│   ├── src/
│   │   ├── commands/
│   │   │   ├── skill.rs              # Skill 相关 IPC 命令（~80 个命令）
│   │   │   └── settings.rs           # 设置相关 IPC 命令
│   │   ├── services/
│   │   │   ├── skill.rs              # Skill 扫描、缓存、symlink 管理
│   │   │   ├── github.rs             # GitHub API 集成（搜索、下载、README）
│   │   │   ├── cli.rs                # 原生 Rust 实现的 npx skill 兼容层
│   │   │   ├── lock.rs               # .skill-lock.json 管理
│   │   │   ├── watcher.rs            # 文件系统监听（notify）
│   │   │   └── tray.rs               # 系统托盘
│   │   ├── persistence/              # 持久化层
│   │   │   ├── metadata.rs           # 用户元数据（starred, isMine）
│   │   │   ├── archive.rs            # 归档 manifest
│   │   │   ├── external_imports.rs   # 外部导入注册表
│   │   │   └── update_history.rs     # 更新历史
│   │   ├── config.rs                 # Agent 配置 & 路径检测（17 个 Agent）
│   │   ├── store.rs                  # AppState（RwLock 管理的运行时状态）
│   │   ├── error.rs                  # 错误类型（AppError / CommandError）
│   │   └── lib.rs                    # Tauri Builder setup（启动时缓存重建、文件监听）
│   ├── resources/                    # 轮播图、推荐仓库 JSON
│   └── Cargo.toml
│
├── packages/
│   └── cli/                          # npm CLI 包
│       ├── src/
│       │   ├── cli.ts                # Commander 命令定义
│       │   ├── protocol/             # 本地协议实现（与桌面共享 schema）
│       │   │   ├── scan.ts           # Skill 扫描
│       │   │   ├── consistency.ts    # 一致性检查
│       │   │   ├── diagnostics.ts    # doctor 诊断
│       │   │   ├── archive.ts        # 归档操作
│       │   │   ├── imports.ts        # 外部导入
│       │   │   └── types.ts          # 共享类型
│       │   └── wui/                  # 轻量 Web UI（纯 HTML/JS/CSS）
│       └── package.json
│
├── fixtures/
│   └── local-protocol/               # 桌面协议 fixture（版本兼容测试）
│       ├── lock-v3-full.json
│       ├── archive-v1-full.json
│       └── imports-v1-full.json
│
├── skills/                           # 项目自身的 automation skills
├── docs/                             # 截图、开发文档、本地协议文档
└── package.json                      # Bun workspace（包含 packages/*）
```

---

### 5. 与 ContentForge 整合评估

#### 5.1 整合价值：中

| 维度 | 评估 |
|------|------|
| **技术栈匹配度** | **极高** — 同为 Tauri v2 + React 19 + TypeScript + Tailwind + Rust，架构模式高度重合 |
| **业务功能重叠** | **低** — skill-zoo 专注 Skill 发现/安装/管理，ContentForge 专注内容创作（YouTube/AI/输出） |
| **Skill 概念对齐** | **部分对齐** — 两者都有 "Skill" 概念，但 skill-zoo 的 Skill 是静态 Markdown 指令文件，ContentForge 的 Skill 是可执行的内容生成工作流 |
| **组件复用价值** | **中高** — Markdown 编辑器、文件树、卡片布局、设置面板等 UI 模式可直接借鉴 |
| **架构参考价值** | **高** — Tauri IPC 组织、Rust 服务层设计、前端状态管理、持久化策略均可参考 |

#### 5.2 不适合直接整合的原因

1. **核心使命不同**：skill-zoo 是 "Skill 包管理器"（类似 npm/apt），ContentForge 是 "内容创作平台"（类似剪映 + Notion）。两者的核心用户流程没有直接交集。
2. **Agent 生态耦合**：skill-zoo 深度绑定 17 种 AI 编码工具的目录结构和 symlink 机制，这些对 ContentForge 无意义。
3. **GitHub 中心主义**：skill-zoo 的所有发现/安装/更新逻辑围绕 GitHub 仓库 ZIP 下载，与 ContentForge 的本地内容创作场景不匹配。

---

### 6. 整合建议

#### 6.1 可直接借鉴/复用的模块（高优先级）

| 模块 | 复用方式 | 说明 |
|------|---------|------|
| **Tauri IPC 命令组织** | 架构参考 | `commands/skill.rs` + `commands/settings.rs` 的分离模式，每个命令的输入输出类型定义 |
| **Rust 服务层设计** | 架构参考 | `services/` 目录结构：skill / github / cli / lock / watcher / tray 的拆分方式 |
| **错误处理模式** | 代码借鉴 | `error.rs` 中 `AppError` / `CommandError` 的分层设计，IO 错误上下文包装 |
| **文件系统 Watcher** | 代码借鉴 | `services/watcher.rs` 基于 `notify` 的增量缓存刷新机制 |
| **持久化版本控制** | 架构参考 | `fixtures/local-protocol/` 的 schema 演进策略（v1 / v2 / future 版本兼容测试） |
| **路径安全验证** | 代码借鉴 | `validate_skill_directory`、`is_path_under_roots` 等路径遍历防护 |

#### 6.2 可适配到 ContentForge 的 UI 组件（中优先级）

| 组件 | 适配场景 |
|------|---------|
| **SkillDetail / SkillCreateView** | ContentForge 的 "内容模板编辑器" — Markdown + YAML frontmatter 编辑模式 |
| **SkillFileTree** | 内容素材库的文件树浏览 |
| **SkillCard / SkillCardRow** | 内容模板/预设的卡片展示 |
| **SettingsView + Section 组件** | 应用设置页面的布局模式（主题、语言、维护、关于） |
| **ConsistencyPanel** | 内容项目的一致性检查面板（如：重复内容、冲突配置） |
| **MarkdownContent（预览）** | 任何需要 Markdown 渲染的地方（rehype-highlight + rehype-sanitize 配置） |

#### 6.3 可参考的设计模式（低优先级）

| 模式 | 应用场景 |
|------|---------|
| **TanStack React Query + hook 封装** | ContentForge 中后端状态管理（如下载队列、AI 生成任务） |
| **前端缓存 + 后台重建** | 启动时立即加载缓存、后台异步重建的 UX 模式 |
| **拖放排序（@dnd-kit/react）** | 内容模板排序、播放列表排序 |
| **i18next 组织方式** | `src/i18n/index.ts` 的初始化 + JSON 扁平键命名风格 |
| **系统托盘 + 窗口拖拽** | `services/tray.rs` + `handleDragMouseDown` 的无框窗口体验 |

#### 6.4 不建议复用的部分

| 模块 | 原因 |
|------|------|
| `services/github.rs` | GitHub 仓库搜索/ZIP 下载与 ContentForge 业务无关 |
| `services/cli.rs` | npx skill 兼容层是 skill-zoo 特有的需求 |
| `config.rs` 中的 17 个 Agent 配置 | AI 编码工具的目录约定对 ContentForge 无意义 |
| Symlink / Junction 管理逻辑 | 多 Agent 共享 Skill 的机制不适用于内容创作场景 |
| `skills.sh` 审计集成 | 第三方 Skill 审计服务与 ContentForge 无关 |

#### 6.5 潜在的功能扩展方向

若 ContentForge 未来需要**内容模板市场**或**用户自定义 Prompt 模板管理**，skill-zoo 的架构可作为参考实现：

- 将 "Skill" 替换为 "Content Template"
- 将 "GitHub 仓库" 替换为 "内容模板市场 API"
- 将 "Agent 目录" 替换为 "项目级模板目录"
- 保留：本地编辑、版本控制、归档、一致性检查等机制

---

> **总结**：skill-zoo 是一个技术实现精良、架构设计清晰的桌面应用，与 ContentForge 在技术栈上高度一致，但在业务领域上差异显著。建议将 skill-zoo 作为**架构和 UI 模式的参考库**，而非直接整合的目标。重点借鉴其 Tauri IPC 组织、Rust 服务层、前端状态管理和持久化策略。
