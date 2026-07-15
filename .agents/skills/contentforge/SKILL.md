---
name: contentforge
description: |
  ContentForge 开发指南 — 社交媒体内容获取→AI 处理→多平台发布工具链。
  使用场景：
  - 开发采集域功能（Twitter/YouTube/网页/RSS 内容获取）
  - 开发处理域功能（AI 摘要、小红书文案转换、翻译、分析）
  - 开发 Pipeline 引擎（工作流编排、预设流水线、定时触发）
  - 开发发布域功能（Markdown/Notion/小红书导出）
  - 修改 CLI 命令（scrape, process, publish, pipeline）
  - 修改配置管理、数据模型、健康检查
  - 集成新的 AI Provider 或采集平台
  - 构建、打包、部署 macOS 版本
---

# ContentForge 开发 Skill

## 项目定位

ContentForge 是从任意社交媒体获取内容，通过 AI 处理转化为适合任意平台发布的内容工具链。

核心场景：
1. 抓取 Twitter/X 内容 → 智能摘要 → 小红书文案 → 发布
2. 下载 YouTube 视频 → 提取文本/字幕 → AI 分析 → 笔记
3. 批量处理 URL → 自动摘要 → 导出 Markdown/Notion

## 项目结构

```
contentforge/
├── cli/                          # Go CLI (Cobra)
│   ├── cmd/                      # 子命令
│   │   ├── root.go               # 根命令
│   │   ├── scrape.go             # 采集命令
│   │   ├── process.go            # 处理命令
│   │   ├── publish.go            # 发布命令
│   │   └── pipeline.go           # 流水线命令
│   ├── internal/
│   │   ├── models/               # Go 共享数据模型
│   │   ├── config/               # 配置管理
│   │   └── python/               # Go-Python 桥接层
│   ├── main.go
│   └── go.mod
├── core/python/contentforge/     # Python 核心模块
│   ├── models.py                 # 核心数据模型 (ContentUnit, Pipeline)
│   ├── config.py                 # 配置管理
│   ├── ingestion/                # 采集域
│   │   ├── agent_reach.py        # 封装 agent-reach CLI
│   │   ├── web_scraper.py        # Jina Reader 网页抓取
│   │   ├── transcriber.py        # 视频转录/字幕提取
│   │   └── health_check.py       # 平台健康检查
│   ├── processing/               # 处理域
│   │   ├── ai_engine.py          # AI Engine 多 Provider
│   │   ├── summarizer.py         # 结构化摘要
│   │   ├── xiaohongshu_converter.py  # 小红书文案转换
│   │   ├── analyzer.py           # 内容分析
│   │   └── translator.py         # 多语言翻译
│   ├── pipeline/                 # 流水线引擎
│   │   ├── engine.py             # DAG 执行引擎
│   │   ├── presets.py            # 预设流水线
│   │   └── runner.py             # 生命周期管理
│   └── cli/bridge.py             # Python CLI 桥接
├── core/scripts/                 # 脚本和预设
│   ├── presets/
│   │   ├── twitter_to_xiaohongshu.json
│   │   └── youtube_to_notes.json
│   └── cf-env.sh                 # 环境变量脚本
└── desktop/                      # Tauri Desktop (待开发)
```

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| CLI | Go 1.24 + Cobra + Bubble Tea | 命令行界面 |
| Desktop | Tauri v2 + Next.js + React 19 | 桌面应用（待开发） |
| 核心引擎 | Python 3.13 | AI 处理、Pipeline、采集 |
| 采集基础设施 | agent-reach | 15+ 平台内容获取 |
| 视频处理 | FFmpeg + yt-dlp | 下载、转码、字幕 |
| AI 处理 | OpenAI / Claude / Ollama | 摘要、改写、翻译 |
| 配置 | YAML + 环境变量 | 分层配置管理 |

## 快速参考

### 添加新的采集平台

1. 在 `core/python/contentforge/ingestion/` 创建新的采集器
2. 实现 `fetch(url) -> ContentUnit` 接口
3. 在 `health_check.py` 添加平台健康检查
4. 在 `agent_reach.py` 或独立模块中注册路由
5. 更新 CLI `scrape.go` 添加后端选项

### 添加新的 AI 处理功能

1. 在 `core/python/contentforge/processing/` 创建处理器
2. 使用 `AIEngine` 作为 AI Provider 抽象
3. 设计提示模板（prompt template）
4. 在 `process.go` 添加命令行选项
5. 在 Pipeline `engine.py` 注册新的 StepHandler

### 添加新的预设流水线

1. 在 `core/python/contentforge/pipeline/presets.py` 定义流水线步骤
2. 或在 `core/scripts/presets/` 创建 JSON 配置文件
3. 步骤类型：`ingest`, `summarize`, `translate`, `rewrite`, `xiaohongshu`, `analyze`, `filter`, `custom`
4. 更新 `pipeline.go` 的 `list` 命令显示新预设

### 修改数据模型

1. 修改 `core/python/contentforge/models.py`（Python 端）
2. 同步修改 `cli/internal/models/models.go`（Go 端）
3. 更新数据库 Schema（SQLite 迁移脚本）
4. 更新 JSON 序列化/反序列化逻辑

### 添加新的 AI Provider

1. 在 `core/python/contentforge/processing/ai_engine.py` 继承 `AIProvider`
2. 实现 `chat(messages, **kwargs) -> str` 方法
3. 在 `AIEngine.__init__` 中注册新 Provider
4. 更新配置 Schema 支持新 Provider 的 API Key

## 环境设置

```bash
# 1. 运行环境设置
bash setup-macos.sh

# 2. 加载环境变量
source contentforge/core/scripts/cf-env.sh

# 3. 验证
contentforge --help
```

### 虚拟环境

- Python venv: `<repo>/.venv-cf`（由 `setup-macos.sh` 创建）
- 加载环境: `source contentforge/core/scripts/cf-env.sh`
- agent-reach / yt-dlp: 安装在 venv 中

## 构建命令

```bash
# Go CLI
cd contentforge/cli && go build -o contentforge .

# 验证
./contentforge --help
./contentforge scrape --help
./contentforge process --help
./contentforge pipeline list
```

## 核心命令示例

```bash
# 从 URL 采集内容
contentforge scrape "https://twitter.com/..." --output ./output

# 对已有内容执行 AI 处理
contentforge process ./output/content.json --summarize --xiaohongshu

# 导出到指定格式
contentforge publish ./output/content.json --format xiaohongshu --output ./xhs_post.md

# 运行预设流水线
contentforge pipeline run --preset twitter_to_xiaohongshu --input "URL"
```

## 配置

配置文件：`~/.config/contentforge/config.yaml`

```yaml
ai:
  provider: openai
  api_key: sk-xxx
  model: gpt-4o-mini

ingestion:
  proxy: http://localhost:7890

publishing:
  xiaohongshu:
    max_length: 1000
    auto_publish: false
```

环境变量覆盖：`CF_AI_PROVIDER`, `CF_OPENAI_API_KEY`, `CF_PROXY`

## 预设流水线

| 预设 | 描述 | 步骤 |
|------|------|------|
| `twitter_to_xiaohongshu` | Twitter → 小红书文案 | 采集 → 翻译 → 摘要 → 小红书转换 → 分析 |
| `youtube_to_notes` | YouTube → 笔记 | 转录 → 摘要 → 翻译 → 分析 → 改写 |
| `rss_to_digest` | RSS → 摘要 | 采集 → 摘要 → 分析 → 导出 |
| `web_to_summary` | 网页 → 摘要 | 采集 → 摘要 → 分析 → 导出 |
| `ai_processing` | 通用 AI 处理 | 输入 → 分析 → 摘要 → 改写 → 导出 |

## 常见问题

- **agent-reach 不可用**: 检查 venv 是否激活，`cf-env.sh` 是否 source
- **yt-dlp 未找到**: 检查 venv 中是否安装，`pip install yt-dlp`
- **FFmpeg 未找到**: `brew install ffmpeg`
- **AI API 调用失败**: 检查 `~/.config/contentforge/config.yaml` 中的 API Key
- **Python 导入错误**: 确保 `PYTHONPATH` 包含 `contentforge/core/python`

## 参考文档

- `references/architecture.md` — 完整架构图和数据流
- `references/pipeline-dsl.md` — Pipeline DSL 规范
- `references/ai-prompts.md` — AI 提示模板参考
- `references/platform-backends.md` — 采集平台后端对照表

## 相关 Skills

| 任务 | Skill |
|------|-------|
| Pipeline 预设 / DAG 引擎 | `contentforge-pipeline` |
| VTT 字幕分析 | `vtt-analyze` |
| vYtDL 下载功能 | `vytdl-dev` |

完整索引见 [`_index.md`](../_index.md)。
