# ContentForge Core 修改分析（CORE REWORK PLAN）

> 基于 2026-08-16 全量代码审读（44 文件 / 15,068 行）。本文回答一个问题：**contentforge-core 要怎么改才能从"半成品库"变成可交付的产品核心**。逐项附代码证据。
>
> 现状快照：2026-08-16 已修复包级导入断裂（重复类、幽灵导入、两代 API 混用），包可完整 import，Go 桥接可用。本文处理的是剩余的结构性问题。

---

## 一、现状体检（事实）

### 1.1 分层健康度

| 层 | 规模 | 状态 | 判定 |
|---|---|---|---|
| 基础层 `models.py` + `config.py` | 648 行 | 数据模型完整；config 读 `~/.config/contentforge/config.yaml` 但**没有贯穿全链** | 🟡 可用，有裂缝 |
| 采集层 `ingestion/` | 752 行 | agent-reach 封装 + Jina 抓取可用；**transcriber 是 placeholder**（只提音频不转录） | 🟡 主体可用 |
| 处理层 `processing/` | 1,720 行 | 摘要/分析/翻译/小红书转换 + 三 Provider AIEngine 完整 | 🟢 最健康 |
| 流水线 `pipeline/` | ~1,500 行 | 引擎/预设/运行器骨架完整；**存储缺失**、create 的预设 run 不了 | 🟡 半闭环 |
| 智能层 `ai/` | **7,045 行（47%）** | ReAct Agent/路由/Skill/SQLite 检索一应俱全，**但包外零调用** | 🔴 悬空 |
| 发布层 `publishing/` | 1 行 docstring | 空壳；Go 端 `publish.go` 另有一套渲染 | 🔴 缺失 |

### 1.2 工程面

- **打包**：无 `pyproject.toml` / `requirements.txt`。安装靠 `cf-env.sh` + 手工 venv + `pip install requests pyyaml`。
- **测试**：0 个测试文件。唯一的验证手段是 `compileall` 和手工跑 CLI。
- **运行面**：Go CLI -> `python -m contentforge.cli.bridge`（stdin/stdout JSON）可用；桌面端（Tauri/Rust）与本包**零连接**。

---

## 二、问题清单（按严重度分级）

### P0 - 架构级（决定这个包的存在意义）

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| P0-1 | **ai/ 子系统 7,045 行悬空**：全仓库无任何包外调用（CLI bridge 不暴露、桌面端走 Kimi CLI 子进程） | `grep "from contentforge.ai" 包外 = 0 命中`；桌面端 `apps/contentforge-desktop/src-tauri/src/ai.rs:100-148` 直调 Kimi CLI | 近一半代码投入没有产出；桌面端 chat 是占位回显，两者本该是同一个方案 |
| P0-2 | **管线不闭环**：发布层空壳，且与 Go 端 `publish.go` 双轨并存 | `publishing/__init__.py`（1 行）；`tools/contentforge-cli/cmd/publish.go` | "采集->处理->发布"只走完 2/3；发布行为分裂在两种语言里 |
| P0-3 | **转录是 placeholder** | `ingestion/transcriber.py:158`（注释"需要外部 whisper 服务"，只 ffmpeg 提音频） | `youtube_to_notes` 预设的核心步骤实际无效，产物无正文 |
| P0-4 | **无打包**：无 pyproject/requirements，无版本号，无发布物 | 包根目录 | 无法 `pip install`，无法进 CI 依赖缓存，桌面端集成无从谈起 |

### P1 - 功能正确性（用户可感知的坏）

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| P1-1 | **create 的预设永远无法 run**：`pipeline create` 保存 JSON 到 `scripts/presets/`，但 `PRESETS` 注册表只认代码注册，**不加载任何 JSON 文件** | `presets.py`（`get_preset` 只查内存 dict；全文件无 JSON 加载）；`cli/pipeline.py` create 分支 | 用户创建的流水线是死数据 |
| P1-2 | **运行历史不可恢复**：run_by_id/重试"简化实现"，无运行存储 | `runner.py:183-184, 278, 355, 364` | 管线失败后无法断点续跑/审计 |
| P1-3 | **配置双轨**：`config.py` 有完整 yaml 体系（AI/平台/代理/发布 profile），但 `AIEngine` 用独立的 `AIConfig`，cli/bridge 里凭空构造，**没人读那份 yaml** | `config.py:379 行` vs `processing/ai_engine.py:30` | 用户配置了 `~/.config/contentforge/config.yaml` 也不生效 |
| P1-4 | **动态导入未实现** | `engine.py:261-265` | 自定义步骤静默跳过 |
| P1-5 | **Agent 会话是内存版** | `ai/session.py`（注释"实际应连接 SQLite"） | ai/ 即便接线，会话重启即失 |

### P2 - 质量/可维护性

| # | 问题 | 证据 |
|---|---|---|
| P2-1 | 零测试 | 全包无 test_*.py |
| P2-2 | 示例代码混在包内 | `ai/USAGE_EXAMPLES.py` |
| P2-3 | print 与 logging 混用 | `cli/bridge.py`（print JSON 合理）vs 各模块 logger |
| P2-4 | 演进残留：函数式与类式两代 handler API 并存（已用 `register_step` 桥接） | `engine.py` 尾部兼容层 |
| P2-5 | ai/ 内部多处"简化实现"（tools 资产查询、chat_engine 缓存等） | `ai/tools.py:186,388,417`、`chat_engine.py:418` |

---

## 三、修改方案（分四阶段，可独立验收）

### Phase A：工程化基座（先行，1 个 PR 量级）

1. **新建 `packages/contentforge-core/python/pyproject.toml`**：
   - name `contentforge-core`，version `0.1.0`；依赖 `requests`、`pyyaml`
   - `pip install -e` 即可用，替代 cf-env.sh 的 PYTHONPATH 魔法（脚本保留为兼容层）
   - CI Python job 升级为 `pip install -e` + `pytest`
2. **测试骨架**：`tests/` 先覆盖已稳定面 -- models 序列化、presets 注册/解析、engine 步骤分发、bridge 协议（stdin->stdout JSON 契约）、config 解析。目标不高：核心路径有回归网。
3. 统一日志：库内一律 `logging`，只有 bridge 出口 print JSON。
4. `USAGE_EXAMPLES.py` 移到 `examples/`。

**验收**：`pip install -e packages/contentforge-core/python` 后，任意目录 `python -m contentforge.cli` 可用；pytest 在 CI 绿。

### Phase B：管线闭环（让"最后一公里"通）

1. **presets 文件化**（修 P1-1）：`PRESETS` 改为"代码内置 + 扫描 `scripts/presets/*.json`"双来源，`get_preset` 统一入口；create 即存文件、run 即可执行。
2. **运行存储**（修 P1-2）：用包内现成的 SQLite 依赖（ai/content_access.py 已有 FTS5 实践）落 `pipeline_runs` 表：记录输入、步骤输出、状态；run_by_id 与重试从库里恢复。
3. **transcriber 接真转录**（修 P0-3）：按配置选后端 -- Groq Whisper API（config.yaml 里已有"可选 Groq"的约定）/ OpenAI / 本地 whisper.cpp；ffmpeg 提音频保留为前置步骤。
4. **发布层定调**（修 P0-2）：**推荐方案：Go 端 `publish.go` 保留为渲染器，Python `publishing/` 只做"发布目标适配器"（xiaohongshu/文件/剪贴板）**。若近期无自动发布需求，则删除 Python 空壳并在 spec 里写明"发布=Go 渲染"。消灭双轨 ambiguity。

**验收**：`pipeline create -> pipeline run` 全流程可用；`youtube_to_notes` 能产出带正文的笔记；失败 run 可重试。

### Phase C：ai/ 子系统接线（最大决策点）

7,045 行不能永远悬空。三个选项：

| 选项 | 内容 | 代价 | 判断 |
|---|---|---|---|
| **C1（推荐）** | 桌面端 chat 接入本包：Rust 侧新增 python bridge（协议直接复用 `cli/bridge.py` 的 stdin/stdout JSON），`chat_send` 占位实现替换为 `ai/chat_engine` + `agent_session`；Kimi CLI 降级为可选 Provider | 桌面端集成工作量最大，但这是这 7k 行存在的意义，也是桌面端"placeholder chat"的解药 | ✅ |
| C2 | ai/ 降级为 `experimental/`，文档标注实验态，桌面端继续 Kimi CLI | 几乎零代价，但双轨长存 | 仅当 C1 排不进日程 |
| C3 | 删除 ai/，保留 processing 的 AIEngine 单线 | 沉没 7k 行 | ❌ 除非方向变更 |

C1 落地时同步修 P1-5（session 落 SQLite，表结构 `ai/content_access.py` 已有先例可复用）。

### Phase D：配置贯穿（修 P1-3）

- `AIConfig.from_config(ContentForgeConfig)`：AIEngine/bridge/CLI 全部从 `~/.config/contentforge/config.yaml`（+ 环境变量覆盖，config.py 已支持）构造，删除散落的手工构造点。
- 桌面端设置页的 ai_* 键（vytdl-web settings 里已预留透传）映射到同一份配置文件，形成单一事实源。

---

## 四、优先级排序与依赖关系

```
Phase A（基座）──► Phase B（管线闭环）──► Phase C（ai/ 接线，依赖 B 的存储）
        └─────────► Phase D（配置贯穿，可与 B 并行）
```

先 A 后 B 的理由：没有打包与测试网，B 的每一步都是盲改；C 依赖 B 的运行存储（Agent 会话需要同样的持久化模式）。

## 五、修改后的目标形态

```
contentforge-core/
├── pyproject.toml              # Phase A
├── src/contentforge/ 或 python/contentforge/
│   ├── models / config         # 贯穿全链（Phase D）
│   ├── ingestion/              # transcriber 接真后端（Phase B）
│   ├── processing/             # 现状保持（最健康）
│   ├── pipeline/               # 文件化预设 + SQLite 运行存储（Phase B）
│   ├── ai/                     # 被桌面端 chat 真实调用（Phase C）
│   └── publishing/             # 目标适配器或删除（Phase B 定调）
└── tests/                      # Phase A 起持续累积
```
