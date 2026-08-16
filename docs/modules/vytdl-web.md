# vYtDL Web（apps/vytdl-web）

Express + WebSocket 的 yt-dlp 下载服务后端（`@vytdl/web-server`），面向 Docker/NAS 部署：为前端提供下载队列、元信息查询、音频提取、VTT 字幕分析的 HTTP API，并经 WebSocket 广播进度事件；可托管 Next.js 静态导出前端（SPA fallback）。

## 技术栈

Node.js + TypeScript 5.6；Express 4、ws 8、better-sqlite3（SQLite 持久化）、uuid、cors。运行时 spawn 外部二进制：yt-dlp、ffmpeg、vYtDL CLI（VTT 分析）。

## 目录结构与关键文件

```
apps/vytdl-web/src/
├── index.ts          # 入口：Express 路由 + WS，默认端口 3000
├── downloader.ts     # findYtDlp/findFfmpeg/runYtDlp（超时+代理清理）、视频信息/格式/播放列表、进度解析、音频提取
├── queue.ts          # QueueManager：并发 1-10（默认 3）、取消、事件广播
├── database.ts       # better-sqlite3：downloads / settings / vtt_reports 三表
└── vtt-analysis.ts   # VttAnalyzer：按 zh/en/ja/... 优先级抓字幕，调 vYtDL CLI 转 Markdown
```

## 对外接口

- **HTTP**（统一 `{success, data|error}`）：`/api/start-download`、`cancel/retry/delete-download`、`video-info`、`video-formats`、`playlist-info`、`extract-audio`、`analyze-vtt`、`vtt-report(s)`、`settings`（GET/POST）、`open-download-folder`；`GET *` SPA fallback。
- **WebSocket**：`/api/ws`，广播 `download:progress/log/status/complete/error:<id>`、`queue:update`、`vtt-report:status/complete`。
- **环境变量**：`PORT`、`VYTDL_DB_PATH`、`VYTDL_OUTPUT_DIR`、`VYTDL_STATIC_DIR`、`YT_DLP_BIN`、`VYTLD_BUNDLED_YT_DLP`、`FFMPEG_PATH`、`VYTDL_CLI_PATH`。

## 与其他模块的关系

- 由根 `Dockerfile` / `docker-compose.yml` 构建编排（端口 3000，卷 `vytdl-downloads`/`vytdl-data`，内存限 1G）；`task web:up / web:down / web:logs`。
- 与 vytdl-desktop 前端共享同一 API 契约（`apps/vytdl-desktop/src/lib/api-client.ts` 的 `/api/*`）：桌面 Web 形态由本服务托管前端静态导出，Tauri 形态走 Rust 后端。
- 依赖 vYtDL CLI 二进制（Docker 内 `/app/cli/vYtDL`）做 VTT 分析。
- 不依赖 packages/ui、packages/utils（纯后端）。

## 构建与运行

```bash
pnpm --filter @vytdl/web-server build   # tsc -> dist/
task web:up                             # docker-compose 部署
```

## 完成度

核心全流程完整可用（无 TODO）。已知局限（详见 docs/STATUS.md）：`open-download-folder` 在 Docker 形态为 no-op；settings 中的 ai_* 键仅为桌面端预留透传；完成文件名靠正则弱解析；VTT 分析依赖 `VYTDL_CLI_PATH` 或 PATH 中的 CLI。
