# agent-reach（`services/agent-reach/`）

## 定位

第三方 Python CLI / 库（git submodule：`Panniantong/agent-reach`），为 Agent 提供多平台只读访问与搜索能力。

## 技术栈

- Python ≥ 3.10
- requests / feedparser / yt-dlp / rich / loguru
- 可选 Playwright、MCP、browser-cookie3

## 功能概要

- CLI 入口：`agent-reach`
- 通道：Twitter、YouTube、Bilibili、小红书、Reddit、Web、RSS 等（`channels/`）
- `doctor` 诊断、安装器、可选 MCP server

## 与其他模块

- ContentForge Core 的 `AgentReachIngestor` 通过子进程调用本 CLI
- 列入 pnpm workspace glob，但不是 npm 包
- 更新：在仓库根对 submodule 执行常规 git submodule 操作
