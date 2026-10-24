# Tracing: Refactor Sprint 2: Electron Shell MVP（apps/shell + apps/web）

## Task Entry (2026-10-24 22:59:24)

- **Issue**: #17
- **Title**: Refactor Sprint 2: Electron Shell MVP（apps/shell + apps/web）
- **Started At**: 2026-10-24 22:59:24
- **Status**: completed

### Original Task Description

```markdown
按 docs/refactor/sprint-0/04-roadmap.md Sprint 2：Electron 宿主替代 Tauri 壳，前端切纯 HTTP/WS 模式。

任务：
1. apps/web：前端新家（自 apps/vytdl-desktop 前端随迁，src-tauri 不带），api-client.ts 删除 Tauri 分支 → 纯 HTTP/WS + shell 桥能力探测（浏览器模式降级隐藏原生按钮）；output: export 静态构建可用
2. apps/shell：Electron 主进程（单实例锁、spawn/守护 daemon、健康轮询、窗口）+ preload 桥（reveal-folder/open-terminal/dialog/剪贴板）
3. 原生能力移植（terminal_launcher.rs/agent_cli.rs/agent_runner.rs → Node，等价行为）：终端探测、launch 脚本生成（PATH bootstrap + env exports）、agent provider 目录、GLM/MiniMax key 注入、codex CODEX_HOME 会话配置
4. 打包：electron-builder 配置（mac arm64/x64 + win x64），daemon 二进制作为 resource 注入；Taskfile shell:dev / desktop:bundle
5. apps/vytdl-desktop 本 sprint 冻结不动（Sprint 4 下线）

验收：Electron 应用可运行，下载全流程 + 终端启动 + 设置持久化与 Tauri 版持平；同一前端在纯浏览器中除原生按钮外功能一致。
```
- **Completed At**: 2026-10-24 23:19:41

### Implementation Summary

Sprint 2 完成：Electron 宿主 + apps/web 前端已合入 main（PR #18）。前端纯 HTTP/WS 化（浏览器可用），原生能力经 window.vytdlShell 桥；terminal_launcher 全量移植 TS 并带 16 单测；打包链路（daemon 三平台 + web 导出 + electron-builder）就绪。遗留项见 Issue body Execution 节。

