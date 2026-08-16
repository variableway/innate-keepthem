# ContentForge Specs

ContentForge（采集 -> AI 处理 -> 发布）的成体系设计文档，随 2026-08 monorepo 文档重组从 `contentforge/docs/` 迁入，路径引用已刷新为 monorepo 布局。

## projects/ 系列（v1.0，2026-08-03）

全仓库质量最高的成体系文档，作为 ContentForge 设计的事实基础：

| 文档 | 内容 |
|---|---|
| [00-PROJECT-VISION.md](projects/00-PROJECT-VISION.md) | 愿景与问题定义 |
| [01-ARCHITECTURE-OVERVIEW.md](projects/01-ARCHITECTURE-OVERVIEW.md) | 架构总览 |
| [02-MODULE-STATUS.md](projects/02-MODULE-STATUS.md) | ⚠ 模块状态快照（完成度百分比为 2026-08-03 时点数据，最新缺口见根目录 STATUS.md） |
| [03-PLUGIN-SYSTEM.md](projects/03-PLUGIN-SYSTEM.md) | 插件系统设计 |
| [04-SKILL-SYSTEM.md](projects/04-SKILL-SYSTEM.md) | Skill 系统设计 |
| [05-CONTENT-LIFECYCLE.md](projects/05-CONTENT-LIFECYCLE.md) | 内容生命周期 |
| [06-ROADMAP.md](projects/06-ROADMAP.md) | ⚠ 路线图（使用相对时间表述，读时需换算） |
| [07-TERMINOLOGY.md](projects/07-TERMINOLOGY.md) | 术语表 |

## 模块 SPEC

| 文档 | 覆盖 |
|---|---|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | 项目总览 |
| [CLI_SPEC.md](CLI_SPEC.md) | Go CLI（tools/contentforge-cli）命令与行为 |
| [PYTHON_CORE_SPEC.md](PYTHON_CORE_SPEC.md) | Python 核心（packages/contentforge-core）-- **v2.0 基于代码事实重写** |
| [CORE-REWORK-PLAN.md](CORE-REWORK-PLAN.md) | **core 修改分析**：P0-P2 分级问题清单 + 四阶段修改方案 |
| [RUST_BACKEND_SPEC.md](RUST_BACKEND_SPEC.md) | 桌面端 Rust 后端（apps/contentforge-desktop） |
| [FRONTEND_SPEC.md](FRONTEND_SPEC.md) | 桌面端前端 |
| [EXTERNAL_REPO_INTEGRATION_PLAN.md](EXTERNAL_REPO_INTEGRATION_PLAN.md) | 外部仓库集成计划（`contentforge/external-repos/` 各参考项目） |

相关：当前实际完成度与缺口见 [docs/STATUS.md](../STATUS.md)；模块导览见 [docs/modules/contentforge.md](../modules/contentforge.md)。
