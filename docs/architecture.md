# 技术架构

## 产品定位

**innate-keepthem** 是一个多组件视频下载与内容处理仓库，包含两套产品线：

1. **vYtDL** — 以 yt-dlp 为引擎的多端下载套件（CLI / 桌面 / Web / 浏览器扩展）
2. **ContentForge** — 采集 → AI 处理 → 发布的内容工作流（Go CLI + Python 核心 + 桌面）

两套产品共享部分概念（下载、字幕、SQLite），但代码路径彼此独立。

## 仓库布局

```
innate-keepthem/
├── apps/
│   ├── vytdl-desktop/          # vYtDL 桌面（Tauri v2 + Next.js）
│   ├── vytdl-web/              # vYtDL Web API（Hono + WS）
│   └── contentforge-desktop/   # ContentForge 桌面（Tauri v2 + Next.js）
├── packages/
│   ├── ui/                     # @vytdl/ui 共享组件
│   ├── utils/                  # @vytdl/utils 工具函数
│   └── contentforge-core/      # ContentForge Python 核心
├── tools/
│   └── contentforge-cli/       # ContentForge Go CLI
├── extensions/
│   └── url-extractor/          # Chrome MV3 URL 提取
├── services/
│   └── agent-reach/            # git submodule：多平台采集 CLI
├── vYtDL-standalone/           # vYtDL Go CLI（独立 git checkout，gitignore）
├── scripts/                    # 桌面构建 / 启动辅助
├── contentforge/               # 遗留目录（代码已迁出，仅参考/样例）
├── Taskfile.yml                # 统一任务入口
├── go.work                     # Go workspace
├── pnpm-workspace.yaml         # JS workspace
└── docker-compose.yml          # vytdl-web 编排
```

## 分层视图

```
┌─────────────────────────────────────────────────────────────────┐
│  UI 层                                                          │
│  vytdl-desktop │ contentforge-desktop │ Chrome extension │ Web  │
└────────────┬────────────────┬───────────────────┬───────────────┘
             │ Tauri IPC      │ Tauri IPC         │ HTTP / WS
┌────────────▼────────────────▼───────────────────▼───────────────┐
│  应用后端                                                       │
│  Rust (queue/downloader/db) │ Hono (queue/downloader/db)        │
└────────────┬────────────────────────────────────┬───────────────┘
             │ sidecar / spawn                    │ PythonBridge
┌────────────▼────────────────────────────────────▼───────────────┐
│  CLI / 核心                                                     │
│  vYtDL-standalone (Go→yt-dlp) │ contentforge-cli (Go→Python)    │
│                               │ contentforge-core + agent-reach │
└────────────┬────────────────────────────────────┬───────────────┘
             │                                    │
             ▼                                    ▼
         yt-dlp / FFmpeg                    外部平台 API / CLI
```

## 工作区配置

| 类型 | 文件 | 成员 |
|------|------|------|
| Go | `go.work` | `vYtDL-standalone`, `tools/contentforge-cli` |
| pnpm | `pnpm-workspace.yaml` | `apps/*`, `packages/*`, `tools/*`, `services/*`, `extensions/*` |
| Turbo | `turbo.json` | 前端 `dev` / `build` / `lint` / `typecheck` |

实际带 `package.json` 的 JS 包：`@vytdl/desktop`、`@vytdl/web-server`、`contentforge-desktop`、`@vytdl/ui`、`@vytdl/utils`。

## vYtDL 数据流

```
用户输入 URL
    → Desktop 表单 / Web API / CLI 参数
    → 下载队列（并发上限可配）
    → yt-dlp 子进程（Desktop Rust / Web Node / CLI Go）
    → 进度事件（Tauri Event 或 WebSocket）
    → SQLite（Desktop/Web）或 download_record.json（CLI）
```

桌面与 Web 共用同一套前端（Next 静态导出）与 API 命令名；`api-client.ts` 在 Tauri 下走 `invoke`，在浏览器下走 `POST /api/*` + `WS /api/ws`。

## ContentForge 数据流

```
URL / 本地文件
    → contentforge-cli (Cobra)
    → PythonBridge → contentforge-core
        → 采集（agent-reach / web / 转写）
        → AI 处理（摘要 / 翻译 / 改写 / 小红书 / 分析）
        → Pipeline 预设编排
        → 发布（markdown / json / html 等）
```

ContentForge 桌面端是另一条 Tauri 实现（下载 + 资产库 + 多 Agent 对话），不经过 Go→Python 桥，直接用 Rust 调 yt-dlp / SQLite。

## 构建与运行入口

| 目标 | 推荐命令 |
|------|----------|
| vYtDL CLI | `task cli:build`（目录 `vYtDL-standalone/`） |
| vYtDL 桌面开发 | `task desktop:dev` |
| vYtDL 桌面生产 | `task desktop:build` / `task desktop:bundle` |
| vYtDL Web | `task web:up` |
| ContentForge CLI | `task contentforge:build` + `cf-env.sh` |
| 全量 | `task build`（CLI + ContentForge + vYtDL Desktop） |

桌面构建会：

1. 从 `vYtDL-standalone` 交叉编译 sidecar → `apps/vytdl-desktop/src-tauri/bin/vYtDL-<triple>`
2. 准备 yt-dlp 资源（`scripts/bootstrap-ytdlp-dev.sh` 或 `download-yt-dlp-binaries.py`）
3. 运行 `pnpm tauri dev|build`

## 外部依赖

| 依赖 | 用途 |
|------|------|
| Go 1.24+ | 两个 CLI |
| Node 18+/22 + pnpm 9 | 前端与 Web |
| Rust (cargo) | 两个 Tauri 应用 |
| yt-dlp | 所有下载路径 |
| FFmpeg（可选） | 切片 / 合并 / 音频提取 |
| Python 3.10+ | ContentForge 核心、桌面启动脚本、agent-reach |
| Docker（可选） | vytdl-web 部署 |

## 设计约定

- **下载引擎不重造**：一律 spawn yt-dlp。
- **CLI 单一源**：vYtDL 规范仓库为 [qdriven/innate-vytdl](https://github.com/qdriven/innate-vytdl)，本地目录名 `vYtDL-standalone/`（嵌套 git，已被 gitignore）。旧路径 `tools/vytdl-cli` 已移除。
- **桌面 / Web API 对齐**：同一命令名，便于 `api-client` 双模式。
- **ContentForge 核心在 Python**：Go CLI 只做参数解析与桥接。
