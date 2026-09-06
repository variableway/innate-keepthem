# vYtDL Desktop（`apps/vytdl-desktop/`）

## 定位

跨平台桌面下载器：队列、库、播放器、字幕分析、设置与工作区对话。包名 `@vytdl/desktop`。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js（静态导出 `out/`）、React 19、Tailwind、Zustand、i18n（en/zh/ja） |
| 桌面壳 | Tauri v2 |
| 后端 | Rust：tokio 队列、sqlx/SQLite、yt-dlp 子进程 |
| 共享包 | `@vytdl/ui`、`@vytdl/utils` |
| 侧车 | `vYtDL-standalone` 编译的 `bin/vYtDL-<triple>` |

## 入口

| 路径 | 作用 |
|------|------|
| `src/app/page.tsx` | 下载页（single / batch / smart） |
| `src/app/{library,player,settings,analyze,workspace}/` | 其他页面 |
| `src/components/download-form.tsx` | 下载表单 |
| `src/components/download-list.tsx` | 队列与进度 |
| `src/lib/api-client.ts` | Tauri IPC ↔ HTTP/WS 抽象 |
| `src/store/*` | Zustand（download / settings / chat） |
| `src-tauri/src/lib.rs` | 启动、yt-dlp 解压、未完成任务恢复 |
| `src-tauri/src/{commands,downloader,queue,database}.rs` | IPC / 下载 / 队列 / DB |
| `src-tauri/src/{vtt_analysis,audio_extractor,agent_*}.rs` | 字幕 / 音频 / Agent |

## 功能

### 下载

- **Single**：单 URL，拉元信息与缩略图预览
- **Batch**：多行 URL / `#` 注释 / `.txt` 导入，去重后入队
- **Smart**：Batch + 播放列表 URL 启发式检测
- 队列：并发可配、取消、重试、删除、打开目录
- 进度：百分比、速度、ETA、日志
- 高级选项：格式选择、嵌入封面/元数据/章节、SponsorBlock、限速等
- Cookie：浏览器 / 文件；画质、格式、字幕语言

### 其他

- 视频 / 格式 / 播放列表信息查询
- 音频提取、VTT 分析与报告 CRUD、`summarize_video`
- 启动时将中断的 `downloading` 重置为 `pending` 并重新入队
- 首次运行解压捆绑 yt-dlp 资源

### API 双模式

`api-client.ts`：

- Desktop：`invoke` + Tauri Event
- Web：`POST /api/{command}` + `WS /api/ws`

命令名与 `apps/vytdl-web` 对齐。

## 启动

```bash
task desktop:dev          # 含 sidecar + yt-dlp bootstrap
task desktop:dev:fast     # 跳过 pnpm install
task desktop:build
task desktop:bundle

# 或
pnpm --filter @vytdl/desktop tauri:dev
python3 scripts/build-desktop.py dev
```

仅更新前端、不启桌面壳：在 `apps/vytdl-desktop` 跑 `pnpm dev`（Next），配合已有后端或 Web 模式。

## 与其他模块

- 依赖 `@vytdl/ui` / `@vytdl/utils`
- sidecar 来自 `vYtDL-standalone`
- 静态产物供 `vytdl-web` / Docker 托管
