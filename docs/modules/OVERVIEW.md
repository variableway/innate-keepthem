# 模块一览

## 模块表

| 模块 | 路径 | 类型 | 一句话 |
|------|------|------|--------|
| vYtDL CLI | `vYtDL-standalone/` | Go | yt-dlp 包装 CLI / TUI |
| vYtDL Desktop | `apps/vytdl-desktop/` | Tauri + Next | 图形化下载队列与库管理 |
| vYtDL Web | `apps/vytdl-web/` | Hono + WS | Docker 可部署的同一套下载 API |
| ContentForge CLI | `tools/contentforge-cli/` | Go | scrape / process / publish / pipeline |
| ContentForge Core | `packages/contentforge-core/` | Python | 采集、AI、Pipeline 实现 |
| ContentForge Desktop | `apps/contentforge-desktop/` | Tauri + Next | CF 资产库 + 多 Agent 对话 |
| Shared UI | `packages/ui/` | React | `@vytdl/ui` |
| Shared Utils | `packages/utils/` | TS | `@vytdl/utils` |
| URL Extractor | `extensions/url-extractor/` | Chrome MV3 | YouTube 页批量取链 |
| agent-reach | `services/agent-reach/` | Python submodule | 多平台只读采集 CLI |
| Scripts | `scripts/` | Python/Shell | vYtDL 桌面构建与启动 |

## 依赖关系

```
extensions/url-extractor ──URL 列表──► vYtDL CLI / Desktop

vYtDL-standalone ──sidecar──► vytdl-desktop
       │                           │ @vytdl/ui + @vytdl/utils
       │                           └── static out ──► vytdl-web
       └── Docker clone ─────────────────────────────►

contentforge-cli ──PythonBridge──► contentforge-core ──► agent-reach

contentforge-desktop ──独立 Tauri 栈（不依赖 @vytdl/*）──► yt-dlp / SQLite
```

## 文档

每个模块的详细功能见同目录下对应文件。
