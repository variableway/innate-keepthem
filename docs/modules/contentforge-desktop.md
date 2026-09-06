# ContentForge Desktop（`apps/contentforge-desktop/`）

## 定位

ContentForge 向的 Tauri 桌面应用：下载队列、资产库、多 Agent 对话 / Skills 执行、VTT / AI 辅助。首页重定向到 `/download`。包名 `contentforge-desktop`。

## 技术栈

- Next.js 15（静态导出）、React 19、Tailwind、Zustand、next-themes
- Tauri v2 + sqlx/SQLite
- **不**依赖 `@vytdl/ui` / `@vytdl/utils`（自有 `src/lib/utils.ts`）
- i18n：en / zh

## 入口

| 路径 | 作用 |
|------|------|
| `src/app/download/` | 下载工作台 |
| `src/app/assets/` | 资产库 |
| `src/app/settings/` | 设置 |
| `src/lib/api-client.ts` / `ws-client.ts` | 前端 API |
| `src/store/{agent,asset,chat}Store` | 状态 |
| `src-tauri/src/commands/*` | download / video / settings / ai / agent / asset / chat |
| `src-tauri/src/{queue,downloader,pipeline,asset_processor,agent_runner}.rs` | 核心逻辑 |

## 功能

### 下载

与 vYtDL 类似的 start / cancel / retry / delete / open folder，以及 video-info / formats / playlist-info。

### 资产

搜索、详情、删除、标签、加入会话、分组；文本提取、摘要、关键词、语言启发式。

### 对话与 Agent

- 会话：创建、历史、流式发送、取消、归档、置顶、改标题、删消息、工具调用确认
- Agent：列表、切换、快捷操作、skills 列表与执行
- 可检测 / 拉起外部 Agent CLI（如 Kimi）

### AI / 字幕

`summarize_video`、抽音频、VTT 分析与报告 CRUD、`agent_chat_send`。

## 启动

根 `Taskfile.yml` 的 `desktop:*` 任务面向 **vYtDL** 桌面，不包含本应用。在本目录：

```bash
cd apps/contentforge-desktop
pnpm install
pnpm tauri dev
```

## 与其他模块

- 产品线与 ContentForge CLI/Core 同域，但运行路径独立（Rust ↔ yt-dlp，不经 Go→Python）
- 下载 / VTT / Agent 模式与 `vytdl-desktop` 有概念重叠，数据与 UI 栈分离
