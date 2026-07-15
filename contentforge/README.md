# ContentForge 🔥 macOS Edition

> 从任意社交媒体获取内容，通过 AI 处理转化为适合任意平台发布的内容。

## 快速开始

### 环境设置

```bash
# 1. 运行环境设置脚本
bash setup-macos.sh

# 2. 加载环境变量
source contentforge/core/scripts/cf-env.sh

# 3. 验证环境
contentforge --help
```

### 核心命令

```bash
# 从 URL 采集内容
contentforge scrape "https://twitter.com/..." --output ./output

# 对已有内容执行 AI 处理
contentforge process ./output/content.json --summarize --xiaohongshu

# 导出到指定格式
contentforge publish ./output/content.json --format xiaohongshu --output ./xhs_post.md

# 运行预设流水线
contentforge pipeline run --preset twitter_to_xiaohongshu --input "https://twitter.com/..."
```

## 项目结构

```
contentforge/
├── cli/                          # Go CLI (Cobra)
│   ├── cmd/                      # 子命令 (scrape, process, publish, pipeline)
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
│   │   ├── ai_engine.py          # AI Engine (OpenAI/Claude/Ollama)
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

## 预设流水线

| 预设 | 描述 | 步骤 |
|------|------|------|
| `twitter_to_xiaohongshu` | Twitter → 小红书文案 | 采集 → 翻译 → 摘要 → 小红书转换 → 分析 |
| `youtube_to_notes` | YouTube → 笔记 | 转录 → 摘要 → 翻译 → 分析 → 改写 |
| `rss_to_digest` | RSS → 摘要 | 采集 → 摘要 → 分析 → 导出 |
| `web_to_summary` | 网页 → 摘要 | 采集 → 摘要 → 分析 → 导出 |
| `ai_processing` | 通用 AI 处理 | 输入 → 分析 → 摘要 → 改写 → 导出 |

## 技术栈

- **Go 1.24** — CLI 命令行（Cobra + Bubble Tea）
- **Python 3.13** — 核心处理引擎（AI Engine、Pipeline、采集）
- **agent-reach** — 15+ 平台内容采集基础设施
- **FFmpeg** — 视频/音频编辑
- **OpenAI/Claude/Ollama** — AI 处理（摘要、改写、翻译）

## 环境要求

- macOS 13+ (Apple Silicon / Intel)
- Python 3.10+ (已配置 venv)
- Go 1.24+ (Homebrew)
- FFmpeg (Homebrew)
- 可选: OpenAI API Key (摘要/改写)
- 可选: Groq API Key (免费 Whisper 转录)

## 配置

配置文件位于 `~/.config/contentforge/config.yaml`：

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

## 许可证

MIT

## AI Skills

开发 ContentForge 时，参考 `.agents/skills/contentforge/` 和 `.agents/skills/contentforge-pipeline/`。完整索引见 `.agents/skills/_index.md`。
