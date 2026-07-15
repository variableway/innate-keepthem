# ContentForge 架构图

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户界面层                                    │
├─────────────────────────────────────────────────────────────────────┤
│  CLI (Go) │ Desktop (Tauri+Next) │ Web (Express+Next) │ Chrome Ext  │
│  ─────────────────────────────────────────────────────────────────  │
│  contentforge scrape <url>                                         │
│  contentforge process --summarize --xiaohongshu                    │
│  contentforge publish --format markdown                            │
│  contentforge pipeline run --preset twitter_to_xiaohongshu         │
├─────────────────────────────────────────────────────────────────────┤
│                         应用编排层                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Pipeline Engine — DAG 任务流执行                               │  │
│  │  • 预设流水线：Twitter→小红书, YouTube→笔记, RSS→摘要          │  │
│  │  • 自定义流水线：JSON 配置，支持条件、重试、超时                │  │
│  │  • 状态追踪：每步输入输出、失败重试、断点续传                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                         领域服务层                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐  │
│  │ 采集域        │ │ 处理域        │ │ 编辑域        │ │ 发布域   │  │
│  │ ──────────── │ │ ──────────── │ │ ──────────── │ │ ──────── │  │
│  │ AgentReach   │ │ AIEngine     │ │ FFmpeg       │ │ Markdown │  │
│  │ WebScraper   │ │ Summarizer   │ │ Subtitle     │ │ Notion   │  │
│  │ Transcriber  │ │ XHSConverter │ │ Audio        │ │ XHS      │  │
│  │ HealthCheck  │ │ Analyzer     │ │ Transcoder   │ │ Export   │  │
│  │              │ │ Translator   │ │              │ │          │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                         基础设施层                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐  │
│  │ AI Engine     │ │ Queue        │ │ Storage      │ │ Config   │  │
│  │ ──────────── │ │ Manager      │ │ ──────────── │ │ Manager  │  │
│  │ OpenAI Prov  │ │ Task Queue   │ │ Content DB   │ │ Settings │  │
│  │ Claude Prov  │ │ Concurrency  │ │ File Store   │ │ Profiles │  │
│  │ Ollama Prov  │ │ Retry        │ │ Cache        │ │ Secrets  │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                         外部适配层                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐  │
│  │ agent-reach   │ │ YouTube      │ │ Notion       │ │ Xiaohong │  │
│  │ (15+ 平台)   │ │ (yt-dlp)    │ │ API         │ │ shu      │  │
│  │ twitter-cli   │ │              │ │              │ │ OpenCLI  │  │
│  │ opencli       │ │              │ │              │ │ MCP      │  │
│  │ jina-reader  │ │              │ │              │ │          │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 数据流

```
URL/输入
    ↓
[采集域] — agent-reach / Jina Reader / yt-dlp / RSS
    ↓
ContentUnit (ingested)
    ↓
[处理域] — AIEngine → Summarize / Analyze / Translate / XiaohongshuConvert
    ↓
ContentUnit (processed) — summary, key_points, rewritten_text
    ↓
[编辑域] — FFmpeg 剪辑 / 字幕嵌入 / 音频提取 (可选)
    ↓
ContentUnit (ready)
    ↓
[发布域] — Markdown / Notion / 小红书文案 / JSON
    ↓
输出文件 / 发布到平台
```

## 模块依赖关系

```
cli/cmd/ (Go)
    ├── scrape.go ──► python_bridge.go ──► ingestion/
    ├── process.go ──► python_bridge.go ──► processing/
    ├── publish.go ──► python_bridge.go ──► publishing/
    └── pipeline.go ──► python_bridge.go ──► pipeline/

python_bridge.go
    └── 调用 Python: PYTHONPATH=<repo>/contentforge/core/python
    └── python -m contentforge.cli.bridge <command>

contentforge.cli.bridge
    ├── scrape ──► ingestion.agent_reach / web_scraper / transcriber
    ├── process ──► processing.ai_engine / summarizer / xiaohongshu_converter / analyzer / translator
    ├── publish ──► publishing.exporters
    └── pipeline ──► pipeline.engine + pipeline.runner + pipeline.presets

pipeline.engine
    ├── ingest step ──► ingestion
    ├── summarize step ──► processing.summarizer
    ├── analyze step ──► processing.analyzer
    ├── translate step ──► processing.translator
    ├── xiaohongshu step ──► processing.xiaohongshu_converter
    └── custom step ──► 用户定义的 Python 函数
```

## 技术边界

| 边界 | Go 侧 | Python 侧 |
|------|-------|-----------|
| CLI 交互 | ✅ Cobra 命令解析 | ❌ |
| 文件 I/O | ✅ 输出路径处理 | ❌ |
| 子进程管理 | ✅ Python 桥接调用 | ❌ |
| 内容采集 | ❌ | ✅ agent-reach / Jina / yt-dlp |
| AI 处理 | ❌ | ✅ OpenAI / Claude / Ollama |
| Pipeline 执行 | ❌ | ✅ DAG 引擎 |
| 数据序列化 | ✅ JSON 解析 | ✅ dataclass → JSON |
