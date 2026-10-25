# Sprint 0：项目总体架构重构规划（Refactor-1）

> 对应 Issue：[variableway/innate-keepthem#12](https://github.com/variableway/innate-keepthem/issues/12) — Refactor-1: 构建项目总体架构
> 状态：**全部落地（历史文档）** —— Sprint 1–4 已于 2026-10-24/25 完成合并（issues #15/#17/#20/#23）。本文保留为架构决策记录。

## 为什么要重构

当前仓库的核心问题：**同一套下载业务逻辑存在三份并行实现**，且桌面前端被 Tauri 锁死。

| 实现 | 位置 | 规模 | 问题 |
|------|------|------|------|
| Rust 后端 | `apps/vytdl-desktop/src-tauri/src/` | ~7,500 行 | queue / downloader / database / vtt 与其他端重复 |
| Node 后端 | `apps/vytdl-web/src/` | ~1,450 行 | Hono + WS，与 Rust 端行为需人工对齐 |
| Go CLI | `vYtDL-standalone/`（独立仓库） | — | 最成熟的一套下载实现（downloader / record / vtt / ytdlpbin），但没有服务模式 |

任何下载行为变更（新参数、韧性重试、Cookie 处理……）都要在 2–3 处同步修改；浏览器使用 Web UI 时走的是功能落后的 Node 端。

## 重构方向（Issue #12 的五点要求）

1. **standalone CLI 保留并升级为后台服务**：为 vYtDL CLI 增加 `vytdl serve` 守护模式，成为唯一后端。
2. **项目结构采用 DSH 插件模式**：参照 [qdriven/dsh-desktop](https://github.com/qdriven/dsh-desktop)（DeepSeek Harness Desktop）——Electron 宿主 + 后台运行时进程 + 插件系统（market 安装、Safe Mode、配置预设）。
3. **桌面壳放弃 Tauri，改用 Electron**：前端必须是浏览器可用的 Web UI，桌面壳只做"宿主"（窗口、进程守护、原生能力），不再实现业务后端。
4. **先出计划再动代码**：本目录即 Sprint 0 计划产物。

## 决策摘要（详见 [05-risks-open-questions.md](./05-risks-open-questions.md)）

| # | 决策 | 结论 |
|---|------|------|
| D1 | 后端唯一化 | Go CLI 新增 `serve` 模式作为唯一 daemon；Rust 后端（src-tauri）与 Node 后端（vytdl-web）逐步下线 |
| D2 | 桌面技术 | Electron 替代 Tauri；shell 只含主进程/preload，无业务逻辑 |
| D3 | 插件模式 | 前端插件化（manifest + 插槽 + 运行时），后端 API 保持固定核心能力；第三方插件通过 client API 组合 |
| D4 | 浏览器支持 | 同一 Web UI：桌面经 Electron 加载，浏览器直连 daemon（本地回环）或 Docker 部署 |
| D5 | 范围 | 本轮（Sprint 1–4）只做 vYtDL 产品线；ContentForge 冻结，后续作为第二后台服务接入同一宿主 |

## 文档索引

| 文档 | 内容 |
|------|------|
| [01-target-architecture.md](./01-target-architecture.md) | DSH 模式拆解 → keepthem 目标架构、运行时拓扑、Tauri→Electron 论证 |
| [02-plugin-model.md](./02-plugin-model.md) | 插件契约（manifest、插槽、运行时）、首批插件与现有代码映射 |
| [03-repo-structure.md](./03-repo-structure.md) | 目标目录结构、迁移映射表、下线清单 |
| [04-roadmap.md](./04-roadmap.md) | Sprint 1–4 任务分解与验收标准 |
| [05-risks-open-questions.md](./05-risks-open-questions.md) | 风险清单、技术选型、待拍板的开放问题 |

## Sprint 0 验收标准

- [x] DSH plugin 模式完成拆解，映射到 keepthem 的概念一一对应
- [x] 目标架构图与各组件职责明确
- [x] 目录重构方案与迁移映射表成文
- [x] Sprint 1–4 路线图与每阶段验收标准成文
- [x] 风险与开放问题列出，给出倾向性结论
- [x] 开放问题（Q1–Q5）由维护者确认（2026-10-24，见 [05](./05-risks-open-questions.md) §3），已进入 Sprint 1
