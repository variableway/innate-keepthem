# 项目目的（PURPOSE）

## 一句话

**innate-keepthem** 是一个"内容获取与内容生产"一体化 monorepo：把**视频下载工具链**（vYtDL：CLI / 桌面 / Web / 浏览器扩展）和**内容加工管线**（ContentForge：采集 -> 处理 -> 多平台发布）放在同一仓库、同一套构建与 CI 之下演进。

## 解决什么问题

### 1. 视频获取门槛高

直接使用 yt-dlp 需要记忆大量参数（清晰度、字幕、cookies、代理、播放列表续传……）。vYtDL 把这些固化为日常好用的产品形态：

- **CLI**（`vYtDL-standalone`）：`-q 1080`、默认中英字幕、TUI 进度、下载记录、播放列表断点续传，并能自动预置 yt-dlp（PATH -> 内嵌 -> 缓存 -> 自动下载）。
- **桌面端**（`apps/vytdl-desktop`）：Tauri v2 + Next.js，图形化下载队列、并发控制、实时日志、多语言。
- **Web 端**（`apps/vytdl-web`）：Docker 部署，面向 NAS / 树莓派场景的远程下载界面。
- **浏览器扩展**（`extensions/url-extractor`）：在 YouTube 页面直接抓取视频地址发送给下载端。

### 2. 视频素材变成内容太费手工

下载只是第一步，把视频变成笔记/小红书/多平台内容需要转录、摘要、翻译、格式转换等重复劳动。ContentForge 把这条链路产品化：

- **核心**（`packages/contentforge-core`）：Go 编排 + Python 处理（转录、AI 摘要、翻译、小红书转换）。
- **CLI**（`tools/contentforge-cli`）：命令行驱动整条管线。
- **桌面端**（`apps/contentforge-desktop`）：Tauri 工作台（聊天式交互、资产管理、管线运行）。

### 3. 多仓库演进失控

本项目历史上 CLI、桌面端、内容管线散落在多个目录/仓库，路径引用与构建方式各自为政。2026-08 的 monorepo 重构（PR #3/#4/#5）统一为：

- 单一目录结构：`apps/`（应用）+ `packages/`（共享包）+ `services/`（服务）+ `tools/`（CLI 工具）+ `extensions/`（扩展）
- 单一二进制来源：桌面端通过 Tauri sidecar 直接捆绑 `vYtDL-standalone` 构建出的 CLI（见 `modules/vytdl-cli.md`）
- 统一构建入口（根 `Taskfile.yml` + `scripts/`）与统一 CI（`.github/workflows/ci.yml`）

## 为谁而做

- **个人创作者**：下载素材 -> 加工成多平台内容的一站式工具箱。
- **Agent/AI 工作流**：仓库自带 `.agents/skills/`，CLI 与管线均可被 AI agent 直接调用（agent-friendly 是一等设计目标）。
- **自部署用户**：Web 端 Docker 化，NAS 即装即用。

## 边界（不做什么）

- 不重新实现下载引擎：下载能力完全委托 yt-dlp，vYtDL 只做易用性封装。
- 不做站点白名单：站点覆盖跟随 yt-dlp 的 1800+ 站点。
- 不做账号体系/云端服务：所有形态（CLI/桌面/Web）都是本地或自部署运行。

## 仓库形态

| 位置 | 内容 |
|---|---|
| `apps/` | vytdl-desktop、vytdl-web、contentforge-desktop 三个应用 |
| `packages/` | contentforge-core（Go+Python 核心）、ui、utils |
| `services/` | agent-reach（submodule） |
| `tools/` | vytdl-cli、contentforge-cli |
| `extensions/` | url-extractor（Chrome 扩展） |

CLI 的**规范源码仓库**为 [qdriven/innate-vytdl](https://github.com/qdriven/innate-vytdl)，`vYtDL-standalone` 是其在 monorepo 内的镜像工作副本。
