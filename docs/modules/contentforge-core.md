# ContentForge Core（`packages/contentforge-core/`）

## 定位

ContentForge 领域实现：模型、采集、AI 处理、Pipeline 引擎与预设。无 `package.json`，为 Python 包（`python/contentforge/`）。

## 技术栈

- Python 3.10+
- requests / pyyaml 等（见包内 README）
- 可选 AI Provider、Whisper、FFmpeg、agent-reach

## 目录要点

| 路径 | 作用 |
|------|------|
| `python/contentforge/models.py` | `ContentUnit`、流水线枚举 |
| `ingestion/` | agent-reach、网页、转写、健康检查 |
| `processing/` | 摘要、翻译、改写、小红书、分析 |
| `pipeline/` | engine / presets / runner |
| `cli/` | scrape / process / publish / pipeline / bridge |
| `ai/` | agents、sessions、skills 加载执行 |
| `scripts/cf-env.sh` | 激活 `.venv-cf` 并设置 PYTHONPATH |
| `scripts/presets/*.json` | Pipeline 预设 |

## 功能

### 采集

- AgentReach 包装（Twitter / YouTube / 小红书等）
- 网页抓取、音视频转写、健康检查

### 处理

- 摘要、翻译、改写、小红书风格转换、内容分析

### Pipeline 预设（示例）

- `twitter_to_xiaohongshu`
- `youtube_to_notes`
- `rss_to_digest`
- `web_to_summary`
- `ai_processing`

### 发布

- 从 `ContentUnit` 导出 markdown / json / text / html（实现见 `cli/publish.py`）

## 与其他模块

- 被 `tools/contentforge-cli` 通过 bridge 调用
- 依赖 `services/agent-reach` 可执行文件做多平台采集
- 顶层 `contentforge/` 目录仅为遗留说明与样例，运行时代码在此包
