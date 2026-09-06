# innate-keepthem 文档

基于当前仓库代码整理的项目文档（2026-09）。旧版 `docs/`（含 archive / research / specs 等）已清空重建。

## 文档索引

| 文档 | 说明 |
|------|------|
| [architecture.md](./architecture.md) | 整体技术架构、仓库布局、构建与运行入口 |
| [modules/overview.md](./modules/overview.md) | 模块一览与依赖关系 |
| [modules/vytdl-cli.md](./modules/vytdl-cli.md) | vYtDL Go CLI（`vYtDL-standalone/`） |
| [modules/vytdl-desktop.md](./modules/vytdl-desktop.md) | vYtDL 桌面端（Tauri + Next.js） |
| [modules/vytdl-web.md](./modules/vytdl-web.md) | vYtDL Web / Docker 服务 |
| [modules/contentforge-cli.md](./modules/contentforge-cli.md) | ContentForge Go CLI |
| [modules/contentforge-core.md](./modules/contentforge-core.md) | ContentForge Python 核心 |
| [modules/contentforge-desktop.md](./modules/contentforge-desktop.md) | ContentForge 桌面端 |
| [modules/url-extractor.md](./modules/url-extractor.md) | Chrome URL 提取扩展 |
| [modules/shared-packages.md](./modules/shared-packages.md) | `@vytdl/ui` / `@vytdl/utils` |
| [modules/agent-reach.md](./modules/agent-reach.md) | agent-reach 子模块 |
| [modules/scripts.md](./modules/scripts.md) | 根目录构建 / 启动脚本 |
| [use-cases/cli-multi-platform-downloads.zh.md](./use-cases/cli-multi-platform-downloads.zh.md) | 用例：vYtDL CLI 多平台下载（中文） |
| [use-cases/cli-multi-platform-downloads.en.md](./use-cases/cli-multi-platform-downloads.en.md) | Use case: vYtDL CLI multi-platform downloads (English) |

## 快速开始（最短路径）

```bash
# vYtDL 桌面
task desktop:dev

# vYtDL CLI（需本地 checkout）
git clone https://github.com/qdriven/innate-vytdl.git vYtDL-standalone
task cli:build

# Web（Docker）
task web:up

# ContentForge CLI
task contentforge:build
source packages/contentforge-core/scripts/cf-env.sh
```

更多任务见根目录 `Taskfile.yml`（`task --list`）。
