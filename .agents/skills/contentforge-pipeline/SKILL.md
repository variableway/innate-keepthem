---
name: contentforge-pipeline
description: |
  Guides development of ContentForge pipeline presets, DAG engine, and pipeline CLI commands.
  Use when working on pipeline presets, step handlers, scrape→process→publish flows,
  adding pipeline JSON configs, or debugging contentforge pipeline run/list/create.
---

# ContentForge Pipeline Skill

## 核心文件

| 文件 | 职责 |
|------|------|
| `packages/contentforge-core/python/contentforge/pipeline/engine.py` | DAG 执行引擎、StepHandler |
| `packages/contentforge-core/python/contentforge/pipeline/presets.py` | 内置预设定义 |
| `packages/contentforge-core/python/contentforge/pipeline/runner.py` | 生命周期、状态追踪 |
| `packages/contentforge-core/scripts/presets/*.json` | JSON 预设配置 |
| `tools/contentforge-cli/cmd/pipeline.go` | CLI: list / run / create / validate |
| `packages/contentforge-core/python/tools/contentforge-cli/pipeline.py` | Python bridge 入口 |

## 步骤类型

`ingest`, `summarize`, `translate`, `rewrite`, `xiaohongshu`, `analyze`, `filter`, `custom`

## 添加新预设

1. 在 `presets.py` 注册，或在 `core/scripts/presets/` 添加 JSON
2. 每步指定 `type`, `config`, `input_mapping`, `output_mapping`
3. 在 `engine.py` 确认对应 `StepHandler` 已注册
4. 验证：`contentforge pipeline list` 和 `contentforge pipeline run <id> --url <url>`

## CLI 命令

```bash
cd tools/contentforge-cli && go build -o contentforge .

./contentforge pipeline list
./contentforge pipeline run twitter_to_xiaohongshu --url "https://twitter.com/..."
./contentforge pipeline create ./my-pipeline.json
```

## 内置预设

| ID | 流程 |
|----|------|
| `twitter_to_xiaohongshu` | 采集 → 翻译 → 摘要 → 小红书 → 分析 |
| `youtube_to_notes` | 转录 → 摘要 → 翻译 → 分析 → 改写 |
| `rss_to_digest` | 采集 → 摘要 → 分析 → 导出 |
| `web_to_summary` | 采集 → 摘要 → 分析 → 导出 |
| `ai_processing` | 分析 → 摘要 → 改写 → 导出 |

## 调试

```bash
source packages/contentforge-core/scripts/cf-env.sh
python -m contentforge.cli.pipeline list
```

Go 侧通过 `internal.CallPythonBridge("pipeline", args)` 调用 Python bridge。

## 参考

- Pipeline DSL 完整规范: [../contentforge/references/pipeline-dsl.md](../contentforge/references/pipeline-dsl.md)
- 系统架构: [../contentforge/references/architecture.md](../contentforge/references/architecture.md)
