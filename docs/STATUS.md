# 未完成功能与代码清单（STATUS）

> 本清单只记录"明确未完成/不可用"的项，按模块分组，附证据（文件:行号）。完成一项就删掉一项并在 PR 中注明。最后全面复核：2026-08-15（基于代码级调查）。

## apps/contentforge-desktop（🚧 重建中，最大缺口）

后端按 `src-tauri/REBUILD_PLAN.md` 四阶段重建。当前：Stage 1（Database）✅、Stage 2（队列）⚠、Stage 3（Commands）⚠ 多处占位、Stage 4（集成）✅。

| # | 未完成项 | 证据 | 建议 |
|---|---|---|---|
| 1 | 与 Python 核心**零连接**：Rust 端无 python bridge；真实 AI 路径是外部 Kimi CLI 子进程 | `src-tauri/src/ai.rs:100-148`（agent_chat_send -> Kimi CLI）；REBUILD_PLAN 列为 P0 | 实现 Rust->Python 桥（参考 tools/contentforge-cli 的 python_bridge.go 协议） |
| 2 | `chat_send` 为占位：回显"收到: <消息>"模拟流式，无真实 LLM | `src-tauri/src/commands/chat.rs:317-355`（注释 "placeholder for actual AI integration"） | 接 Python chat_engine 或 Kimi 流式 |
| 3 | `confirm_tool_call` 空实现 | `chat.rs:485-489` | 随 #2 |
| 4 | `summarize_video` 返回固定文案 | `ai.rs:30-39`（"Coming soon..."） | 接 processing/summarizer |
| 5 | `execute_skill` 未实现、`get_skills` 恒空数组、agents 为静态内置 | `agent.rs:245-249` 等 | 接 contentforge-core skills/ |
| 6 | pipeline_queue（流水线队列）未实现；pipeline_runs 表仅骨架 | REBUILD_PLAN Stage 2；`db/pipeline_runs.rs` | 设计阶段先行 |
| 7 | 下载工作台前端为占位页（原页面依赖 vytdl-desktop 组件集，未移植） | `src/app/download/page.tsx`；`src/lib/api-client.ts` 中 downloadStore 被注释 | Rust commands 齐备后移植 |
| 8 | 前端 5 个导航模块仅 3 页存在：/processing、/publishing、/workflows、/library 为死链接 | `src/lib/navigation.ts` | 按管线阶段逐页补齐 |
| 9 | 死代码：`src/pipeline.rs`（281 行，9 处 "TODO: Implement"）、`asset_processor.rs`（261 行）未在 lib.rs 声明，不参与编译 | `src-tauri/src/pipeline.rs:201,210,219,228,237` | 删除或按重建计划激活 |
| 10 | Rust db 层大量已实现未接线方法（16 处 dead-code 警告） | cargo check 输出 | 随命令补齐接线 |
| 11 | 环境变量名与文档不一致：代码用 `VYTLD_BUNDLED_YT_DLP`，文档写 `CONTENTFORGE_BUNDLED_YT_DLP` | `downloader.rs:585` vs 旧 desktop-setup-summary | 统一命名 |

## packages/contentforge-core（Python 核心）

> 修改方案总纲：`docs/specs/contentforge/CORE-REWORK-PLAN.md`（P0-P2 分级 + 四阶段计划）；现状 spec：`docs/specs/contentforge/PYTHON_CORE_SPEC.md`。

| # | 未完成项 | 证据 | 说明 |
|---|---|---|---|
| 1 | ~~engine.py IngestionHandler 重复定义 + 幽灵导入 AgentReachCollector~~ | - | ✅ 已修复（2026-08-16，坏副本已删） |
| 2 | ~~cli/scrape.py 幽灵导入（AgentReachCollector/AgentReachError/WebScraperError）~~ | - | ✅ 已修复（同上，方法名对齐 fetch_*） |
| 3 | **ai/ 子系统（7,045 行，占包 47%）包外零调用**：bridge 不暴露、桌面端走 Kimi CLI | `grep from contentforge.ai` 包外 0 命中 | P0：处置三选一，推荐接入桌面端 chat（REWORK PLAN Phase C） |
| 4 | **create 的预设永远无法 run**：`PRESETS` 注册表不加载 JSON 文件，create 写的 `scripts/presets/*.json` 是死数据 | `pipeline/presets.py`（get_preset 只查内存 dict） | P1：注册表改为内置 + 文件双来源（REWORK PLAN Phase B.1） |
| 5 | **配置未贯穿**：config.py 的 yaml 体系无消费方，AIEngine 用独立 AIConfig | `config.py` vs `processing/ai_engine.py:30` | P1：AIConfig.from_config（REWORK PLAN Phase D） |
| 6 | 转录是 placeholder：只提取音频，无真实转录 | `ingestion/transcriber.py:158` | P0：接 whisper 后端（Groq/OpenAI/本地） |
| 7 | `publishing/` 整包空壳；与 Go 端 publish.go 双轨 | `publishing/__init__.py`（1 行） | P0：定调（REWORK PLAN Phase B.4） |
| 8 | 运行存储缺失：run_by_id/重试/输入留存均为简化实现 | `pipeline/runner.py:183,278,355,364` | P1：落 SQLite（REWORK PLAN Phase B.2） |
| 9 | pipeline 动态导入未实现（自定义步骤静默跳过） | `pipeline/engine.py:261-265` | P1 |
| 10 | `ai/session.py` SessionManager 为内存实现 | `ai/session.py` | P1：随 Phase C 落 SQLite |
| 11 | ~~预设 JSON id 连字符 vs 注册名下划线~~ | - | ✅ 已修复（JSON id 统一为下划线） |
| 12 | 无 pyproject.toml / requirements.txt / 测试 | 包根目录 | P0：Phase A 工程化基座 |

## tools/contentforge-cli

| # | 未完成项 | 证据 | 说明 |
|---|---|---|---|
| 1 | ~~python_bridge PYTHONPATH 指向已清空的 `contentforge/core/python`~~ | `internal/python_bridge.go:277-289` | ✅ 已修复（指向 packages/contentforge-core/python） |
| 2 | go.mod 模块名为个人占位 `github.com/patrick/contentforge` | `go.mod` | 发布前改为正式名 |
| 3 | 仓库内无已构建二进制（原 contentforge/cli/contentforge 已随重构移除） | - | 构建产物统一走 dist/，见 BUILD.md |

## apps/vytdl-desktop

| # | 未完成项 | 证据 | 建议 |
|---|---|---|---|
| 1 | 视频格式列表解析未实现（UI 格式选择依赖） | `src-tauri/src/downloader.rs:407` `formats: vec![] // TODO` | 解析 `yt-dlp -J` formats |
| 2 | database 层部分方法未接线（`init_db`、`update_download_progress` 等） | cargo check 警告 | 接线或清理 |

## apps/vytdl-web

核心全流程完整可用，仅以下局限：

| # | 项 | 证据 |
|---|---|---|
| 1 | `open-download-folder` 在 Docker 形态为 no-op | `src/index.ts:356-359` |
| 2 | WS "subscribe" 消息处理为空（事件本就全局广播） | `src/index.ts:367-379` |
| 3 | settings 的 ai_* / agent_cli_* 键仅透传存储，服务内无消费（为桌面端预留） | `src/index.ts:232-236` |
| 4 | 下载完成文件名靠正则弱解析，失败回退占位名 | `src/downloader.ts:368-371` |

## packages/ui、packages/utils

| # | 项 | 证据 |
|---|---|---|
| 1 | ui 的 `src/block/{landing,auth,mail,chat}` 为模板演示，monorepo 内零消费者 | grep 无 import |
| 2 | utils 的 tsup 构建链路事实未启用（源码直出） | `packages/utils/package.json` |
| 3 | `cn()` 在 ui 与 utils 重复实现 | `packages/ui/src/lib/utils.ts` vs `packages/utils/src/index.ts` |
| 4 | peer 依赖告警：@hookform/resolvers 要求 ajv@^8.12.0，实际 6.15.0 | pnpm install 输出 |

## extensions/url-extractor

| # | 项 | 证据 |
|---|---|---|
| 1 | Shorts 链接被过滤（只认 `/watch?v=`） | `content.js:31` |
| 2 | youtu.be / m.youtube.com 页面不注入（manifest 未匹配），popup 仅 alert | `popup.js:33` vs `manifest.json` |
| 3 | 无 service worker / 持久化 / 国际化（硬编码中文） | 目录结构 |

## 工程面（跨模块）

| # | 未完成项 | 说明 |
|---|---|---|
| 1 | CI 无 release 流水线 | 当前仅验证，不产出安装包/CLI 产物 |
| 2 | 无 lint 关卡 | golangci-lint、clippy、eslint 均未接入 |
| 3 | Python 核心无单元测试 | CI 仅 compileall |
| 4 | vytdl-cli 与 standalone 仓库靠手工双向同步 | 无自动校验（见 modules/vytdl-cli.md） |
| 5 | tasks/ 无索引、无命名规范 | 混杂 PRD/Spec/状态/日志五类内容 |
