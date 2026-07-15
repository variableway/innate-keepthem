# Project Skills Index

AI Agent Skills for innate-keepthem (vYtDL + ContentForge).

| Skill | Scope | Trigger keywords |
|-------|-------|------------------|
| [vytdl-dev](vytdl-dev/SKILL.md) | vYtDL 全栈开发入口 | vYtDL, download, yt-dlp, desktop, tauri, queue |
| [vtt-analyze](vtt-analyze/SKILL.md) | VTT 字幕 AI 分析工作流 | .vtt, subtitle, analyze, transcript, summary |
| [contentforge](contentforge/SKILL.md) | ContentForge 开发入口 | contentforge, scrape, process, publish, ingestion, AI |
| [contentforge-pipeline](contentforge-pipeline/SKILL.md) | 流水线与预设 | pipeline, preset, DAG, twitter_to_xiaohongshu |

## 路由规则

| 你在做什么 | 读哪个 Skill |
|-----------|-------------|
| 改 vYtDL CLI / yt-dlp 参数 | `vytdl-dev` → `references/components.md` |
| 改 Desktop UI / Rust IPC / i18n | `vytdl-dev` |
| 分析已下载的 VTT 字幕 | `vtt-analyze` |
| 改 ContentForge 采集 / AI 处理 | `contentforge` |
| 改 Pipeline 预设 / DAG 引擎 | `contentforge-pipeline` |
| 不确定 | 先读 `AGENTS.md`，再查本索引 |

## 工具兼容

- **Kimi Code CLI**: 自动加载 `.agents/skills/`
- **Cursor**: 通过 `.cursor/skills` → `.agents/skills` 符号链接访问
