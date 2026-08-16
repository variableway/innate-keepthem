# ContentForge 生态（tools/contentforge-cli + packages/contentforge-core + apps/contentforge-desktop）

vYtDL 的转型产品线：从任意社交媒体**采集**内容，经 AI **处理**（摘要/翻译/改写/格式转换），再**发布**到任意平台。管线定位：Ingestion -> Processing -> Editing -> Distribution。整体完成度自评约 40%（见 `docs/specs/contentforge/projects/02-MODULE-STATUS.md`，最大缺口在桌面端与 Python 核心的集成）。

## 三个组成部分

| 组成 | 路径 | 角色 |
|---|---|---|
| CLI | `tools/contentforge-cli` | Go 命令行入口（scrape/process/publish/pipeline），无业务逻辑，经 Python 桥接调核心 |
| 核心 | `packages/contentforge-core` | 纯 Python 业务核心（约 11,500 行）：数据模型、采集、AI 处理、DAG 流水线、自研 ReAct Agent 框架 |
| 桌面 | `apps/contentforge-desktop` | Tauri + Next.js 工作台（下载/资产库/AI Chat/VTT 分析/设置），🚧 重建中 |

## tools/contentforge-cli

- **技术栈**：Go 1.24 + Cobra + yaml.v3（纳入根 go.work；go.mod 用 replace 指向自身）
- **命令**：`scrape <url> [--backend auto|jina|ytdlp]`、`process <file> [--summarize|--translate|--xiaohongshu|...]`、`publish <file> [--format ...]`（渲染在 Go 端实现）、`pipeline list|run|create|status`
- **Go-Python 桥接**（`internal/python_bridge.go`）：内联 Python 脚本，stdin JSON（`_method`/`_init_args` 约定）/stdout JSON（`to_dict()`）；venv 探测：`CONTENTFORGE_VENV` -> `VIRTUAL_ENV` -> `<root>/.venv-cf` -> 系统 python3
- **运行前提**：`source packages/contentforge-core/scripts/cf-env.sh`；依赖 agent-reach、ffmpeg

## packages/contentforge-core

```
python/contentforge/
├── models.py / config.py
├── ingestion/     # agent_reach（twitter/web/youtube/rss）、web_scraper（Jina）、transcriber、health_check
├── processing/    # ai_engine（多 Provider）、summarizer、xiaohongshu_converter、analyzer、translator
├── pipeline/      # engine（DAG 状态机）、presets（5 内置预设）、runner
├── publishing/    # ⚠ 空壳占位
├── ai/            # ~4000 行：ReAct Agent 框架、chat_engine、SQLite+FTS5 内容检索、skills
└── cli/           # bridge.py（Go 桥接目标）、scrape/process/pipeline、__main__
```

- 纯标准库 + requests/PyYAML；无 LangChain（刻意自研）；外部依赖 OpenAI/Claude/Ollama 兼容 API、agent-reach CLI、ffmpeg
- 详细设计：`docs/specs/contentforge/`（projects 00-07 + 模块 SPEC）

## apps/contentforge-desktop

- **技术栈**：Tauri 2.10 + tokio + sqlx(sqlite)；Next.js 15 静态导出 + React 19 + Zustand 5 + Tailwind 4
- **Tauri commands**（40+，`src-tauri/src/lib.rs` 注册）：Chat 13、Agent 5、Asset 6、Settings 2、Download/Video 10（继承 vytdl-desktop）、AI/VTT 8
- **重建进度**（对照 `src-tauri/REBUILD_PLAN.md` 四阶段）：Stage 1 Database ✅（8 表 CRUD）；Stage 2 队列 ⚠（下载队列完成，pipeline_queue 未实现）；Stage 3 Commands ⚠（框架全注册但多处占位：chat_send 模拟回显、summarize_video 固定文案、execute_skill 未实现）；Stage 4 集成 ✅
- **可端到端工作**：下载（含 bundled yt-dlp、断点续传）、VTT 转 Markdown、ffmpeg 音频提取、设置持久化、Kimi CLI 对话（需本机安装）
- **关键未完成**：与 Python 核心**零连接**（Rust 端无 python bridge，真实 AI 路径是外部 Kimi CLI 子进程）；前端 5 个导航模块仅 3 页存在

## 依赖图（现状）

```
contentforge-cli (Go) ──subprocess JSON──► contentforge-core (Python)
contentforge-desktop (Rust) ─────────────► yt-dlp / ffmpeg / Kimi CLI   【暂不依赖 core，集成是最大待办】
contentforge-core ───────────────────────► agent-reach / ffmpeg / Jina / AI API
```

## 两条"发布"路径（待统一）

Go 端 `publish.go` 本地渲染（可用）与 Python `publishing/`（空壳）并存，未统一。

## 构建与运行

```bash
task contentforge:build && task contentforge:check     # CLI（先 source cf-env.sh）
cd apps/contentforge-desktop/src-tauri && cargo check  # 桌面端
pnpm --filter contentforge-desktop build               # 前端
```
