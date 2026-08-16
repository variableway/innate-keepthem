# ContentForge Python Core SPEC（v2.0，基于代码事实重写）

> 本 spec 描述 `packages/contentforge-core` 的**当前真实状态**（2026-08-16 全量代码审读），而非设计愿望。历史设计版见 git 历史（v1.0）。要改什么、怎么改见 [CORE-REWORK-PLAN.md](CORE-REWORK-PLAN.md)。
>
> 撰写语言：中文（技术术语保持英文）

---

## 目录

1. [定位与边界](#1-定位与边界)
2. [包结构与规模](#2-包结构与规模)
3. [核心数据模型](#3-核心数据模型)
4. [配置系统](#4-配置系统)
5. [采集域 ingestion/](#5-采集域-ingestion)
6. [处理域 processing/](#6-处理域-processing)
7. [流水线域 pipeline/](#7-流水线域-pipeline)
8. [智能域 ai/（悬空）](#8-智能域-ai悬空)
9. [发布域 publishing/（空壳）](#9-发布域-publishing空壳)
10. [CLI 桥接层](#10-cli-桥接层)
11. [进程间协议](#11-进程间协议)
12. [运行环境与依赖](#12-运行环境与依赖)
13. [已知缺口索引](#13-已知缺口索引)

---

## 1. 定位与边界

ContentForge Python Core 是内容处理引擎：**采集 -> AI 处理 -> 流水线编排 ->（发布，未实现）**。它不直接面向终端用户，而是作为子进程被调用：

- **Go CLI**（`tools/contentforge-cli`）：经 `python -m contentforge.cli.bridge` 调用（stdin/stdout JSON）-- 当前唯一真实调用方
- **桌面端**（`apps/contentforge-desktop`）：设计上的调用方，**当前零连接**（桌面 chat 走外部 Kimi CLI 子进程）

**边界**：不做 CLI 参数解析（Go 层负责）、不做 UI、不做站点适配（委托 agent-reach / yt-dlp / Jina）、不依赖 LangChain 等重框架（刻意自研，仅 requests + pyyaml 两个第三方依赖）。

## 2. 包结构与规模

```
packages/contentforge-core/
├── python/contentforge/          # 源码根（PYTHONPATH 指向此处）
│   ├── __init__.py
│   ├── models.py        269 行   # 核心数据模型
│   ├── config.py        379 行   # yaml 配置体系
│   ├── ingestion/       752 行   # 采集域（4 模块）
│   ├── processing/    1,720 行   # AI 处理域（5 模块）
│   ├── pipeline/      ~1,500 行 # 流水线域（engine/presets/runner）
│   ├── ai/            7,045 行   # ReAct Agent 框架（⚠ 包外零调用）
│   ├── publishing/        1 行   # 发布域（⚠ 空壳）
│   └── cli/              桥接层  # bridge/scrape/process/pipeline/__main__
└── scripts/
    ├── cf-env.sh                 # 环境变量（PATH/PYTHONPATH/CONTENTFORGE_VENV）
    └── presets/*.json            # ⚠ 预设 JSON（当前不被加载，见 §7.3）
```

合计 44 文件 / 15,068 行。**无 pyproject.toml、无 requirements.txt、无测试**（Phase A 待办）。

## 3. 核心数据模型

`models.py` 全部为 `@dataclass` + `to_dict()/from_dict()`（桥接序列化的基础）：

| 类型 | 说明 |
|---|---|
| `SourceInfo` | 内容来源（平台、URL、作者、抓取时间等） |
| `ContentUnit` | **中心数据结构**：一次采集/处理的内容单元（标题、正文、媒体、元数据、状态） |
| `ContentType` / `ContentStatus` / `PipelineStatus` | 枚举 |
| `PipelineStep` / `Pipeline` / `PipelineRun` | 流水线定义与运行记录 |
| `PublishProfile` | 发布目标描述（未投入使用） |

约定：**所有跨进程传输的数据都必须能 `to_dict()`**；步骤处理器间传递的单位是 `List[ContentUnit]`。

## 4. 配置系统

`config.py` 定义完整配置体系，读取 `~/.config/contentforge/config.yaml`（`DEFAULT_CONFIG_PATH`），支持环境变量覆盖：

- `AIProviderConfig`（provider/api_key/model/base_url）
- `PlatformBackendConfig`（平台采集后端选择）
- `ProxyConfig`、`PublishProfileConfig`
- 顶层 `ContentForgeConfig` 聚合

**⚠ 现实裂缝（P1-3）**：这套配置**没有被消费方贯穿**--`processing/ai_engine.py` 使用独立的 `AIConfig` dataclass，cli/bridge 层凭空构造实例，`~/.config/contentforge/config.yaml` 实际不生效。修法见 REWORK PLAN Phase D。

## 5. 采集域 ingestion/

| 模块 | 行数 | 状态 |
|---|---|---|
| `agent_reach.py` | 176 | 🟢 封装 agent-reach CLI（subprocess + JSON 输出）。入口类 `AgentReachIngestor`，方法 `fetch_twitter/fetch_web/fetch_youtube/fetch_rss/fetch`；超时控制；错误为 `RuntimeError` |
| `web_scraper.py` | 194 | 🟢 Jina Reader 抓取（类 `JinaWebScraper`，别名 `WebScraper`）；走 requests |
| `health_check.py` | 160 | 🟢 平台健康检查 |
| `transcriber.py` | 222 | 🔴 **placeholder**：`transcribe()` 只用 ffmpeg 提取音频轨，无转录（`transcriber.py:158` 注释"需要外部 whisper 服务"）。这使 `youtube_to_notes` 预设产出无正文 |

外部依赖：`agent-reach` 可执行文件（PATH）、ffmpeg/ffprobe。

## 6. 处理域 processing/

| 模块 | 行数 | 状态 |
|---|---|---|
| `ai_engine.py` | 280 | 🟢 Provider 抽象 `AIProvider`（chat + stream 生成器接口），三实现：`OpenAIProvider` / `ClaudeProvider`（streaming 简化实现）/ `OllamaProvider`；`AIEngine` 工厂。OpenAI 兼容 base_url 可指向任意网关 |
| `summarizer.py` | 264 | 🟢 结构化摘要（要点/关键词/标签） |
| `analyzer.py` | 416 | 🟢 主题/实体/情感分析 |
| `translator.py` | 364 | 🟢 多语言翻译 |
| `xiaohongshu_converter.py` | 394 | 🟢 小红书文案改写（标题党/emoji/分段风格） |

这是全包**最健康**的域：全部经 `AIEngine` 走 LLM，无硬编码密钥，异常体系清晰（`AIEngineError/AIProviderNotFoundError/AIAPIError`）。

## 7. 流水线域 pipeline/

### 7.1 engine.py（DAG 执行引擎）

- `StepHandler`（ABC）+ 8 个内置处理器：Ingestion / Summarize / Rewrite / Xiaohongshu / Translate / Analyze / Filter / Custom
- 注册：类式 `engine.register_handler(handler)`；**函数式兼容层** `register_step(type, fn)` + 默认引擎单例 `get_default_engine()`（2026-08-16 增补，供 cli/pipeline.py 使用）
- 引擎能力：顺序步骤执行、重试（指数/线性退避）、per-step 超时、条件跳过、fail-fast/continue 策略
- 🔴 `CustomHandler` 的动态导入未实现（`engine.py:261-265`，静默跳过自定义函数）

### 7.2 runner.py（生命周期）

`PipelineRunner.run(pipeline, inputs, context)` 状态机（pending -> running -> completed/failed/cancelled）+ `run_preset(name, **params)`（解析预设、注入 url/platform/limit 到首个 ingest 步骤）。

🔴 存储缺失：`run_by_id`、重试恢复、原始输入留存均为"简化实现"（`runner.py:183,278,355,364`）--**运行历史不可恢复**。

### 7.3 presets.py（预设注册表）

- 内存 dict `PRESETS` + 代码注册的 5 个内置预设：`twitter_to_xiaohongshu`、`youtube_to_notes`、`rss_to_digest`、`web_to_summary`、`ai_processing`
- 模块函数 `get_preset/list_presets/_register_preset`；`PresetRegistry` 类为 Go 兼容视图（`list_all`）
- 🔴 **P1 级断裂**：注册表**不加载任何 JSON 文件**。`cli/pipeline.py` 的 create 分支把 JSON 写进 `scripts/presets/`，但 run 只查内存表 -- **用户创建的预设永远无法执行**。修法见 REWORK PLAN Phase B.1

## 8. 智能域 ai/（悬空）

规模最大的域（7,045 行 / 15 文件），自研 ReAct Agent 框架：

| 组成 | 内容 |
|---|---|
| `agent.py` / `agent_session.py` / `agent_registry.py` / `agent_router.py` | Agent 抽象、会话（消息/工具调用循环）、注册表（6 个内置 Agent）、路由 |
| `chat_engine.py` | 多 Agent 会话编排 |
| `content_access.py`（876 行） | SQLite + FTS5 内容资产检索 |
| `asset_retriever.py` / `video_inspector.py` | 资产检索、视频检查 |
| `skills/`（3,600+ 行） | Skill 系统：loader/executor/context/examples |
| `tools.py` | Agent 工具集 |
| `session.py` | ⚠ 会话管理为内存版（应落 SQLite） |

**🔴 关键事实：包外零调用**（`grep from contentforge.ai` 包外 0 命中）。CLI bridge 不暴露，桌面端 chat 走 Kimi CLI 子进程。这 47% 的代码目前是"设计完成、等待接线"状态。**处置决策**（接入桌面端 / 降级实验区 / 删除）见 REWORK PLAN Phase C，推荐接入。

## 9. 发布域 publishing/（空壳）

`__init__.py` 仅 1 行 docstring。当前"发布"能力实际由 **Go 端** `tools/contentforge-cli/cmd/publish.go` 本地渲染（markdown/text/html/json/xiaohongshu）承担 -- 双轨未定调，处置建议见 REWORK PLAN Phase B.4。

## 10. CLI 桥接层

`cli/` 是包对外的进程入口（`python -m contentforge.cli`）：

| 模块 | 职责 |
|---|---|
| `bridge.py` | **主入口**：argparse 子命令 `scrape/process/publish/pipeline_list/pipeline_run/pipeline_create/pipeline_status`，stdin JSON 入、stdout JSON 出（Go 桥接目标） |
| `scrape.py` / `process.py` / `pipeline.py` | 各自的 `handle_*(payload) -> {success, data|error}`（bridge 与 Go 内联脚本共用） |
| `__main__.py` | `python -m contentforge.cli` 入口 |

处理函数统一约定：**永不 raise**，错误折叠为 `{"success": false, "error": str}`。

## 11. 进程间协议

Go CLI（`tools/contentforge-cli/internal/python_bridge.go`）与本包的契约：

1. **发现**：venv 探测 `CONTENTFORGE_VENV` -> `VIRTUAL_ENV` -> `<repo>/.venv-cf` -> 系统 python3
2. **路径**：PYTHONPATH = `<repo>/packages/contentforge-core/python`
3. **调用形态 A（内联脚本）**：生成 Python 代码，stdin 传 JSON（特殊键 `_method`/`__init_args`），stdout 收 JSON（目标类需实现 `to_dict()`）
4. **调用形态 B（bridge 子命令）**：`python -m contentforge.cli.bridge <subcommand>`，stdin JSON 参数、stdout JSON 结果

变更协议时**两侧必须同步改**，并优先补 bridge 契约测试（REWORK PLAN Phase A.2）。

## 12. 运行环境与依赖

- Python 3.10+（开发环境 3.13）
- 第三方依赖仅 `requests`、`pyyaml`（刻意轻量）
- 外部二进制：`agent-reach`（PATH）、`ffmpeg`/`ffprobe`
- 可选外部服务：OpenAI/Claude/Ollama 兼容 API；Groq（Whisper，config 中有约定但 transcriber 未接）
- 环境准备（现状，Phase A 后由 pyproject 取代）：

```bash
python3 -m venv .venv-cf
.venv-cf/bin/pip install requests pyyaml     # 本机默认 pip 源异常时加 -i https://mirrors.aliyun.com/pypi/simple
source packages/contentforge-core/scripts/cf-env.sh
```

## 13. 已知缺口索引

权威清单见 [docs/STATUS.md](../../STATUS.md) 的 contentforge-core 小节；结构化修改方案见 [CORE-REWORK-PLAN.md](CORE-REWORK-PLAN.md)。速览：

| 级别 | 缺口 |
|---|---|
| P0 | ai/ 7k 行悬空、发布层空壳+双轨、transcriber placeholder、无打包 |
| P1 | create 的预设无法 run、运行存储缺失、配置未贯穿、动态导入未实现、会话内存版 |
| P2 | 零测试、示例混入包内、print/logging 混用、两代 API 兼容层并存 |
