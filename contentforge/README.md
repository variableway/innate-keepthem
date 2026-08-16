# ContentForge 🔥

> 从任意社交媒体获取内容，通过 AI 处理转化为适合任意平台发布的内容。

> **本目录现在只保留 external-repos（参考仓库 submodule 及其分析）与样例数据。**
> 代码已迁至 monorepo 各处：CLI -> `tools/contentforge-cli`，核心 -> `packages/contentforge-core`，桌面端 -> `apps/contentforge-desktop`。
> 文档已迁至 `docs/`（设计 Spec 在 `docs/specs/contentforge/`，当前状态在 `docs/STATUS.md`，模块导览在 `docs/modules/contentforge.md`）。

## 快速开始

```bash
# 1. 创建 Python venv 并安装依赖（bridge 与核心需要 requests + pyyaml）
python3 -m venv .venv-cf
.venv-cf/bin/pip install requests pyyaml

# 2. 加载环境变量（PATH/PYTHONPATH/CONTENTFORGE_VENV）
source packages/contentforge-core/scripts/cf-env.sh

# 3. 构建 CLI 并验证
cd tools/contentforge-cli && go build -o ../../bin/contentforge . && cd ../..
contentforge --help
contentforge pipeline list
```

## 核心命令

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

## 预设流水线

| 预设 | 描述 |
|------|------|
| `twitter_to_xiaohongshu` | Twitter -> 小红书文案（采集 -> 翻译 -> 摘要 -> 小红书转换 -> 分析） |
| `youtube_to_notes` | YouTube -> 笔记（转录 -> 摘要 -> 翻译 -> 分析 -> 改写） |
| `rss_to_digest` | RSS -> 每日摘要 |
| `web_to_summary` | 网页 -> 结构化摘要 |
| `ai_processing` | 通用 AI 处理流程 |

## 技术栈与环境要求

- Go 1.24+（CLI，Cobra）
- Python 3.10+（核心：AI Engine、Pipeline、采集；依赖 requests、pyyaml）
- agent-reach（15+ 平台采集）、FFmpeg（音视频）
- 可选：OpenAI/Claude/Ollama API、Groq API（Whisper 转录）

## 配置

配置文件位于 `~/.config/contentforge/config.yaml`：

```yaml
ai:
  provider: openai
  api_key: sk-xxx
  model: gpt-4o-mini

ingestion:
  proxy: http://localhost:7890
```

## AI Skills

开发参考 `.agents/skills/contentforge/` 与 `.agents/skills/contentforge-pipeline/`，索引见 `.agents/skills/_index.md`。

## 许可证

MIT
