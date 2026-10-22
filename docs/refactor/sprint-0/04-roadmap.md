# 04 · Roadmap：Sprint 1–4

> 每个 Sprint 结束时产物必须可运行、可验证；顺序上后端先行，桌面壳与插件化并行推进。

## Sprint 1 —— 后台服务（`vytdl serve`）

**目标**：Go CLI 获得 daemon 模式，替换 vytdl-web 的 Node 后端，成为唯一后端。

任务：
1. `cmd/serve.go`：参数（`--port 0` 随机、`--static <dir>`、`--home <dir>`、`--dev`）。
2. `internal/server/`：HTTP 路由（01 文档 §4 全表）+ WS 进度广播（`/api/ws`），复用现有 `internal/downloader`、`internal/record`、`internal/vtt`、`internal/ytdlpbin`。
3. 队列管理器（Go 实现）：max_concurrent、FIFO、取消、resume-on-startup —— 行为对齐现有 `queue.rs` / `queue.ts`。
4. SQLite 层：沿用现有 schema（downloads / settings / vtt_reports），驱动选 `modernc.org/sqlite`（纯 Go，交叉编译无痛，见 R1）。
5. 前端静态资源服务（Next `output: export` 产物）。
6. Docker：镜像改为"daemon + 前端静态产物"，`docker-compose.yml` 更新。
7. 集成测试：对 API 全表逐条断言（以 vytdl-web 现行为基线），CLI 原有 `*_test.go` 全绿。

**验收**：浏览器打开 `http://127.0.0.1:<port>` 能完成 下载→进度→完成 全流程；`task web:up` 跑通 Docker 路径；Rust 桌面此期间继续可用（不动它）。

## Sprint 2 —— Electron Shell MVP

**目标**：桌面可用 Electron 宿主替代 Tauri 壳，前端切纯 HTTP/WS 模式。

任务：
1. `apps/shell`：主进程（单实例锁、spawn/守护 daemon、健康轮询、窗口）、preload 桥（reveal-folder、open-terminal、dialog、剪贴板）。
2. `api-client.ts` 删除 Tauri 分支，仅剩 HTTP/WS + shell 桥能力探测（浏览器模式降级隐藏原生按钮）。
3. 原生能力移植（参照 `terminal_launcher.rs` 行为）：终端探测/启动脚本生成、agent provider 目录、GLM/MiniMax/官方 key 注入逻辑等价迁移。
4. 打包：electron-builder（mac arm64/x64 + Windows x64），daemon 二进制作为 resource 打入；签名/公证流程成文。
5. 前端目录迁移：`apps/vytdl-desktop` → `apps/web`（宿主骨架先行，组件暂整体随迁）。

**验收**：Electron 应用可安装运行，功能与 Tauri 版持平（下载全流程 + 终端启动 + 设置持久化）；同一前端在纯浏览器中除原生按钮外功能一致。

## Sprint 3 —— 插件运行时与一方插件拆分

**目标**：DSH 插件模式落地：宿主瘦身、功能插件化。

任务：
1. `packages/plugin-runtime`：registry / manifest 校验 / slots / api 白名单代理 / 生命周期错误隔离。
2. 宿主 `apps/web` 只留 app-shell + 插槽挂载 + i18n。
3. 按插件逐个拆出（顺序）：`plugin-settings` → `plugin-downloads` → `plugin-library` → `plugin-analyze` → `plugin-workspace`。
4. 每拆一个：迁移组件 + store + locale + 路由到插槽注册，宿主回归测试。

**验收**：全部功能页面由插件提供；移除任一插件包宿主可启动；`--safe-mode` 只载内置插件。

## Sprint 4 —— 收尾：第三方插件设施 + 下线 + 发布

任务：
1. 第三方插件加载：`vytdl-home/plugins/` 目录 + market 安装器（pnpm、pending 标记、失败诊断）+ 插件管理界面。
2. Safe Mode 恢复界面（插件禁用/移除，参照 DSH 引导式恢复）。
3. 下线 `src-tauri/` 与 vytdl-web 残留；CI 移除 Rust job，新增 Electron 打包 job。
4. 发布流水线：electron-updater、release runbook（参照 DSH `docs/release-runbook.md` 的结构）。
5. 文档重写：`docs/architecture.md`、`docs/modules/*` 按新架构更新；本目录标记为已完成历史。

**验收**：安装包可自动更新；旧 Tauri 应用数据迁移提示（首次启动导入 `vytdl.db` 与设置，可选）；CI 全绿。

## 里程碑与依赖

```
Sprint 1 (daemon) ──┬──> Sprint 2 (shell) ──> Sprint 4 (market/发布)
                    └──> Sprint 3 (插件化) ──┘
```

Sprint 2 与 Sprint 3 前半可并行（壳与插件运行时互不依赖，都只依赖 daemon API）。
