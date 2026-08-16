# 模块地图（Module Overview）

全仓库模块一览与依赖关系。单模块细节见同目录下的模块文档。

```
                                    ┌──────────────────────────┐
                                    │  yt-dlp（外部引擎）        │
                                    │  下载能力完全委托给它       │
                                    └───────────▲──────────────┘
                                                │ 调用
        ┌───────────────────────────────────────┼─────────────────────────────┐
        │                                       │                             │
┌───────┴────────┐  sidecar   ┌─────────────────┴───────┐          ┌──────────┴────────┐
│ tools/         │◄───────────│ apps/vytdl-desktop       │          │ apps/vytdl-web    │
│ vytdl-cli      │  同源构建   │ (Tauri v2 + Next.js 15) │          │ (Node/Express,    │
│ (Go CLI/TUI)   │            │ 桌面下载工作台            │          │  Docker 部署)     │
└───────┬────────┘            └───────────┬─────────────┘          └──────────┬────────┘
        │                                  │                                   │
        │ 规范仓库 qdriven/innate-vytdl     │ 共享 UI/工具                        │ 直接 spawn yt-dlp
        │ (monorepo 内为镜像副本)           ▼                                   │
        │                       ┌──────────────────────┐                      │
        │                       │ packages/ui @vytdl/ui│                      │
        │                       │ packages/utils       │                      │
        │                       └──────────────────────┘                      │
        │                                                                     │
┌───────┴────────┐                                            ┌───────────────┴─────┐
│ extensions/    │  抓取页面视频地址，推送给下载端               │ 浏览器（用户）        │
│ url-extractor  │───────────────────────────────────────────►│                     │
└────────────────┘                                            └─────────────────────┘

─── ContentForge 生态（内容生产管线）─────────────────────────────────────────────

┌────────────────────┐   python bridge   ┌──────────────────────────────┐
│ tools/             │◄─────────────────►│ packages/contentforge-core   │
│ contentforge-cli   │                   │ (Go 编排 + Python 处理包)      │
│ (Go 命令行入口)     │                   │ 转录/AI摘要/翻译/小红书转换     │
└────────────────────┘                   └──────────────┬───────────────┘
                                                        │
                                        ┌───────────────▼───────────────┐
                                        │ apps/contentforge-desktop     │
                                        │ (Tauri + Next.js 工作台)      │
                                        │ 聊天交互/资产管理/管线运行       │
                                        │ ⚠ 重建中（见 STATUS.md）       │
                                        └───────────────────────────────┘

─── 服务 ────────────────────────────────────────────────────────────────────────

services/agent-reach  (submodule, Panniantong/agent-reach) —— agent 触达服务，
                     被 last30days 分析与 agent 工作流引用
```

## 模块清单

| 模块 | 路径 | 形态 | 状态 | 文档 |
|---|---|---|---|---|
| vYtDL CLI | `tools/vytdl-cli` | Go CLI/TUI | ✅ 可用（规范仓库 qdriven/innate-vytdl） | [vytdl-cli.md](vytdl-cli.md) |
| vYtDL Desktop | `apps/vytdl-desktop` | Tauri 桌面 | ✅ 可用 | [vytdl-desktop.md](vytdl-desktop.md) |
| vYtDL Web | `apps/vytdl-web` | Node 服务 | ✅ 可用 | [vytdl-web.md](vytdl-web.md) |
| URL Extractor | `extensions/url-extractor` | Chrome 扩展 | ✅ 可用 | [url-extractor.md](url-extractor.md) |
| 共享包 ui/utils | `packages/ui` `packages/utils` | TS 库 | ✅ 可用 | [shared-packages.md](shared-packages.md) |
| ContentForge CLI | `tools/contentforge-cli` | Go CLI | ⚠ 部分 | [contentforge.md](contentforge.md) |
| ContentForge Core | `packages/contentforge-core` | Go + Python | ⚠ 部分 | [contentforge.md](contentforge.md) |
| ContentForge Desktop | `apps/contentforge-desktop` | Tauri 桌面 | 🚧 重建中 | [contentforge.md](contentforge.md) |
| agent-reach | `services/agent-reach` | submodule | 外部项目 | — |

## 关键统一约定

1. **单一 CLI 二进制**：桌面端 sidecar 与独立 CLI 同源于 `tools/vytdl-cli`（构建即统一，见 BUILD.md）。
2. **单一下载引擎**：所有形态最终调用 yt-dlp；桌面端捆绑平台二进制（`resources/yt-dlp`），CLI 端运行时解析（PATH->内嵌->缓存->下载）。
3. **单一 workspace**：pnpm workspace 覆盖全部 apps/packages；Go workspace（go.work）覆盖两个 tools。
4. **同一套 CI**：`.github/workflows/ci.yml` 四个 job 覆盖 Go/Rust/Node/Python（见 CI.md）。
