# ContentForge CLI（`tools/contentforge-cli/`）

## 定位

Go Cobra 前端：解析参数后通过 **PythonBridge** 调用 `packages/contentforge-core`。模块名 `github.com/patrick/contentforge`。

## 技术栈

- Go 1.24 + cobra + yaml
- 子进程 JSON 桥接到 `.venv-cf` Python 环境

## 入口

| 文件 | 作用 |
|------|------|
| `main.go` | 入口 |
| `cmd/scrape.go` | 采集 |
| `cmd/process.go` | AI 处理 |
| `cmd/publish.go` | 导出发布 |
| `cmd/pipeline.go` | 流水线 list/run/create/status |
| `internal/python_bridge.go` | 调 Python |
| `internal/config/` | 配置（默认 `~/.config/contentforge/config.json`） |

## 功能

```bash
contentforge scrape <url> [--backend] [--batch] [-o] [--format] [--proxy]
contentforge process <file> [--summarize] [--translate] [--rewrite] \
  [--xiaohongshu] [--analyze] [--full-analysis] [--ai-provider]
contentforge publish <file> [--format] [-o] [--batch] [--template] [--profile]
contentforge pipeline list|run|create|status
```

`publish` 部分格式可在 Go 侧渲染；采集与 AI 处理主要在 Python。

## 构建与环境

```bash
task contentforge:build
task contentforge:check
source packages/contentforge-core/scripts/cf-env.sh
```

## 与其他模块

- 依赖 `packages/contentforge-core`（`PYTHONPATH`）
- 采集可走 `services/agent-reach`
- 与 `apps/contentforge-desktop` 产品相关，但桌面端不经过此 CLI
