# vYtDL Web（`apps/vytdl-web/`）

## 定位

Node Hono + WebSocket 下载服务，托管桌面端静态前端，面向 Docker / NAS / 无头环境。包名 `@vytdl/web-server`。

## 技术栈

- Node.js、Hono（`@hono/node-server`）、`ws`
- better-sqlite3
- 子进程调用系统 yt-dlp（镜像内 pip 安装）

## 入口

| 文件 | 作用 |
|------|------|
| `src/index.ts` | HTTP + WebSocket 服务 |
| `src/queue.ts` | 内存队列与并发 |
| `src/downloader.ts` | yt-dlp 封装 |
| `src/database.ts` | SQLite |
| `src/vtt-analysis.ts` | 字幕分析 |

## 功能（HTTP API）

| 路由 | 作用 |
|------|------|
| `POST /api/start-download` | 入队下载 |
| `POST /api/cancel-download` | 取消 |
| `POST /api/retry-download` | 重试 |
| `POST /api/delete-download` | 删除记录 |
| `GET /api/downloads` | 列表 |
| `GET\|POST /api/settings` | 设置 |
| `POST /api/video-info` / `video-formats` / `playlist-info` | 元信息 |
| `POST /api/extract-audio` | 抽音频 |
| `POST /api/analyze-vtt` 及 report CRUD | 字幕分析 |
| `WS /api/ws` | 进度广播 |

静态资源：`VYTDL_STATIC_DIR` 或相对路径中的 Next `out/`。

默认并发约 3；环境变量：`VYTDL_DB_PATH`、`VYTDL_OUTPUT_DIR`、`PORT` 等。

## 部署

```bash
task web:up
task web:logs
task web:down
# 或
docker compose up -d
```

根 `Dockerfile` 多阶段：构建桌面前端 → 编译 Web → clone 并编译 vYtDL CLI → 安装 yt-dlp/FFmpeg。

## 与其他模块

- 前端来自 `apps/vytdl-desktop` 静态导出
- API 命令名与桌面 Tauri 对齐，供 `api-client` Web 模式使用
