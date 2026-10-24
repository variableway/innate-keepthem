# 05 · 风险、技术选型与开放问题

## 1. 风险清单

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | Go daemon 需要 SQLite：cgo 交叉编译麻烦 | 打包受阻 | 选 `modernc.org/sqlite`（纯 Go）；schema 已稳定，切换成本低 |
| R2 | Electron 打包体积极 Tauri 明显增大，macOS 需公证 | 用户体验/发布 | 接受（决策 D2）；electron-builder + electron-updater 流程照 DSH runbook 建 |
| R3 | Tauri 专有能力迁移遗漏（终端启动、浏览器 cookie、音频提取） | 桌面功能回退 | Sprint 2 逐项对照 `src-tauri` 能力清单验收（terminal_launcher / cookie / audio_extractor 三个模块）；cookie 读取优先走 yt-dlp `--cookies-from-browser` 传参，shell 不重复实现 |
| R4 | 三后端并存期行为漂移（Go daemon 与 Rust 端不一致） | 用户困惑 | 过渡期明确"桌面=Tauri 版、浏览器=daemon"；Sprint 4 前完成切换与下线，不长期双轨 |
| R5 | 插件契约设计过早冻结，后续反复破坏兼容 | 返工 | `engine` 主版本字段 + 契约版本化；Sprint 3 只有一方插件期间允许破坏性调整，第三方支持（Sprint 4）起保持兼容 |
| R6 | 第三方插件的供应链/安全风险（安装包即代码） | 安全 | 第三方默认无 `shell:*` 权限、API 白名单、Safe Mode、安装来源记录；沿用 DSH 的 pending 标记 + 故障定位思路 |
| R7 | daemon 单端口被占用/多实例冲突 | 启动失败 | 随机端口 + 单实例锁 + 健康探测重试（DSH 启动流） |
| R8 | `vYtDL-standalone` 是独立嵌套仓库，`serve` 模式开发归属待定 | 协作流程 | 见开放问题 Q1 |

## 2. 技术选型倾向

| 主题 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Electron + electron-builder + electron-updater | 决策 D2；DSH 模式同构 |
| daemon HTTP/WS | Go 标准库或 `net/http` + `nhooyr.io/websocket`（成熟轻量） | 避免引重框架；路由数量有限 |
| SQLite | `modernc.org/sqlite` | 纯 Go、交叉编译零配置；性能足够（本场景单进程低写入） |
| 前端 | 维持 Next.js（App Router）+ Zustand + 现有 i18n | 迁移成本最小；插件运行时自研（无现成方案契合插槽模型） |
| 插件安装 | pnpm 装入 `vytdl-home/plugins/` | DSH market-installer 同思路，workspace 隔离清晰 |

## 3. 开放问题（进入 Sprint 1 前请维护者拍板）

> **✅ 2026-10-24 维护者已全部拍板**（采纳下列"倾向"），Sprint 1 据此启动：

| # | 问题 | 倾向 | 结论 |
|---|------|------|------|
| Q1 | `vytdl serve` 开发在哪个仓库进行：`qdriven/innate-vytdl`（规范仓库）先行再同步，还是直接在本 monorepo 内开发、standalone 仅作上游镜像？ | **倾向**：在 monorepo `services/vytdl` 开发，standalone 仓库经 PR 单向同步（或反向）。需与"CLI 规范仓库"定位冲突解决，建议维护者定方向 | **✅ monorepo `services/vytdl`**；standalone 经 PR 单向同步 |
| Q2 | 浏览器远程访问（Docker 部署到服务器）是否需要鉴权？ | **倾向**：Sprint 1 先不做，保持本地工具定位；预留 token 中间件接口，Docker 用户自行加反代 | **✅ Sprint 1 不做鉴权**，预留 token 中间件接口 |
| Q3 | 旧 Tauri 版是否需要提供数据迁移（`vytdl.db` 路径/设置导入）？ | **倾向**：首次启动检测 `apps/vytdl-desktop` 旧 userData 并提示导入，一次性工具，Sprint 4 实现 | **✅ Sprint 4 做一次性导入工具** |
| Q4 | Chrome 扩展（url-extractor）与 daemon 的对接协议（native messaging vs 扩展直接 POST daemon + token）？ | **倾向**：扩展直接 POST + 本地 token（简单、跨平台），Sprint 4 后另行细化 | **✅ 扩展直接 POST + 本地 token**，后续细化 |
| Q5 | DSH 模式的 mobile bridge（手机访问桌面 daemon）是否纳入本轮范围？ | **倾向**：不纳入，记入 backlog；架构上 daemon 不绑公网，后续加配对 bridge 不伤现有设计 | **✅ 不纳入**，记入 backlog |
