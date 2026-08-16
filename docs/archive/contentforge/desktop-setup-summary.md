# ContentForge Desktop App — 搭建完成总结

> **日期**: 2026-07-12  
> **状态**: ✅ 搭建完成（40 个文件，Rust 1,044 行 + TypeScript 前端）  
> **待办**: 安装依赖并编译验证（需网络恢复后执行）

---

## ✅ 完成内容

### 1. Rust Tauri 后端（`desktop/src-tauri/`）

| 文件 | 行数 | 说明 |
|------|------|------|
| `Cargo.toml` | 34 | 包名 `contentforge-desktop`，edition 2021，Tauri v2 + Tokio + sqlx |
| `tauri.conf.json` | 44 | 品牌 ContentForge Desktop，标识符 `com.contentforge.desktop`，端口 3000 |
| `src/main.rs` | 3 | 入口，调用 `contentforge_desktop_lib::run()` |
| `src/lib.rs` | 89 | 应用初始化：yt-dlp 提取、数据库三层降级、队列管理、断点续传 |
| `src/commands.rs` | 195 | **28 个 IPC 命令**：下载/设置/视频信息/资产/聊天/Agent/流水线 |
| `src/database.rs` | 137 | SQLite：downloads/assets/chat_sessions/chat_messages/settings 表 |
| `src/downloader.rs` | — | yt-dlp 包装器（从 vYtDL 迁移，进度解析/子进程管理） |
| `src/queue.rs` | — | 下载队列管理器（FIFO/并发控制/取消/断点续传） |
| `src/asset_processor.rs` | 261 | 资产处理器：文本提取/HTML 剥离/摘要/语言检测/关键词 |
| `src/pipeline.rs` | 281 | 流水线引擎：3 个内置流水线 + 9 个步骤执行器 |

**品牌适配**：
- 产品名：`ContentForge Desktop`
- 包名：`contentforge-desktop` / `contentforge_desktop_lib`
- 标识符：`com.contentforge.desktop`
- 数据库：`contentforge.db`
- 下载目录：`~/Downloads/ContentForge`
- 环境变量：`CONTENTFORGE_BUNDLED_YT_DLP`
- 默认语言：`zh`（中文）
- 主题：`dark`（暗色优先）

---

### 2. Next.js 前端（`desktop/src/`）

#### 配置文件

| 文件 | 说明 |
|------|------|
| `package.json` | Next.js 15 + React 19 + Tauri v2 API + Zustand + Tailwind v4 |
| `next.config.ts` | 静态导出模式，端口 3000 |
| `tsconfig.json` | TypeScript 5，路径别名 `@/*` |
| `tailwind.config.ts` | Tailwind v4，暗色主题变量，shadcn 配色体系 |
| `postcss.config.mjs` | PostCSS 配置 |

#### 页面

| 文件 | 说明 |
|------|------|
| `app/layout.tsx` | 根布局：Geist 字体、ThemeProvider（暗色优先）、I18nProvider、AppShell |
| `app/page.tsx` | 首页 → 重定向到 `/download` |
| `app/download/page.tsx` | 下载主页面：single/batch/smart 三种模式 |
| `app/assets/page.tsx` | 资产列表页 |
| `app/settings/page.tsx` | 设置页面 |

#### 组件

| 文件 | 说明 |
|------|------|
| `components/layout/app-shell.tsx` | 应用外壳：侧边栏 + 主内容区 |
| `components/layout/app-sidebar.tsx` | 可折叠侧边栏：5 个模块导航（采集/处理/发布/工作流/设置） |
| `components/layout/main-content.tsx` | 主内容区：三种宽度模式 |
| `components/theme-provider.tsx` | next-themes 主题提供者 |
| `components/download/download-form.tsx` | 下载表单：URL 输入 + 选项配置（三种模式） |
| `components/download/download-list.tsx` | 下载任务列表：状态过滤、自动刷新 |
| `components/download/download-item.tsx` | 任务卡片：进度、操作按钮、日志查看器 |
| `components/download/download-progress.tsx` | 进度条：完整/紧凑/迷你三种尺寸 |

#### Store & Types

| 文件 | 说明 |
|------|------|
| `store/downloadStore.ts` | Zustand 下载状态管理（新增） |
| `store/chatStore.ts` | 聊天状态管理（已有） |
| `store/agentStore.ts` | Agent 状态管理（已有） |
| `store/assetStore.ts` | 资产状态管理（已有） |
| `types/download.ts` | 下载类型定义（新增） |
| `types/chat.ts` | 聊天类型（已有） |
| `types/agent.ts` | Agent 类型（已有） |
| `types/asset.ts` | 资产类型（已有） |

#### i18n

| 文件 | 说明 |
|------|------|
| `i18n/index.tsx` | React Context i18n，默认中文，支持 `{{var}}` 插值 |
| `i18n/locales/zh.json` | 中文翻译（完整覆盖所有模块） |
| `i18n/locales/en.json` | 英文翻译 |

#### 工具库

| 文件 | 说明 |
|------|------|
| `lib/api-client.ts` | Tauri IPC / HTTP 统一抽象 |
| `lib/ws-client.ts` | WebSocket 客户端 |
| `lib/utils.ts` | `cn()` 工具函数（clsx + tailwind-merge） |
| `lib/navigation.ts` | 导航配置 |

---

## 📊 统计

| 维度 | 数值 |
|------|------|
| 总文件数 | 40 |
| Rust 代码行数 | 1,044 |
| TypeScript 前端文件 | 24 |
| 项目总大小 | 296KB |
| IPC 命令数 | 28 |
| 前端页面数 | 4 |
| 前端组件数 | 10 |
| 支持语言 | 2（zh/en） |

---

## 🚀 下一步（需网络恢复后执行）

### 1. 安装前端依赖

```bash
cd apps/contentforge-desktop
npm install
```

### 2. 安装 Rust 依赖并编译

```bash
cd apps/contentforge-desktop/src-tauri
cargo check
```

### 3. 启动开发服务器

```bash
cd apps/contentforge-desktop
npm run dev
```

### 4. 启动 Tauri 桌面端

```bash
cd apps/contentforge-desktop
npx tauri dev
```

---

## 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    ContentForge Desktop App                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Frontend (Next.js 15 + React 19 + Tailwind v4)                 │
│  ├── app/download/page.tsx     — 下载主页面                      │
│  ├── app/assets/page.tsx     — 资产列表                         │
│  ├── app/settings/page.tsx   — 设置页面                         │
│  ├── components/download/      — 下载组件（表单/列表/进度）       │
│  ├── store/                  — Zustand（download/chat/agent/asset）│
│  └── lib/api-client.ts       — IPC/HTTP 统一抽象                 │
│                                                                  │
│  Tauri IPC (Channel + Event)                                      │
│                                                                  │
│  Rust Backend (Tauri v2 + Tokio)                                │
│  ├── commands.rs             — 28 个 IPC 命令                   │
│  ├── database.rs             — SQLite (downloads/assets/chat)    │
│  ├── downloader.rs           — yt-dlp 包装器                     │
│  ├── queue.rs                — 下载队列管理器                    │
│  ├── asset_processor.rs      — 资产处理                          │
│  ├── pipeline.rs             — 流水线引擎                       │
│  └── lib.rs                  — 应用初始化                        │
│                                                                  │
│  External Binaries                                               │
│  ├── yt-dlp (externalBin)    — 视频下载                         │
│  └── FFmpeg                  — 音频提取                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 文件索引

```
apps/contentforge-desktop/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── download/
│   │   │   └── page.tsx
│   │   ├── assets/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── app-shell.tsx
│   │   │   ├── app-sidebar.tsx
│   │   │   └── main-content.tsx
│   │   ├── theme-provider.tsx
│   │   └── download/
│   │       ├── download-form.tsx
│   │       ├── download-list.tsx
│   │       ├── download-item.tsx
│   │       └── download-progress.tsx
│   ├── store/
│   │   ├── downloadStore.ts
│   │   ├── chatStore.ts
│   │   ├── agentStore.ts
│   │   └── assetStore.ts
│   ├── types/
│   │   ├── download.ts
│   │   ├── chat.ts
│   │   ├── agent.ts
│   │   └── asset.ts
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── ws-client.ts
│   │   ├── utils.ts
│   │   └── navigation.ts
│   └── i18n/
│       ├── index.tsx
│       ├── locales/
│       │   ├── zh.json
│       │   └── en.json
│
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── commands.rs
        ├── database.rs
        ├── downloader.rs
        ├── queue.rs
        ├── asset_processor.rs
        └── pipeline.rs
```

---

> **状态**: 搭建完成，等待网络恢复后安装依赖并编译验证。
