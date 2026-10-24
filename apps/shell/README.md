# @vytdl/shell — vYtDL 桌面壳（Electron 宿主）

零业务逻辑的 Electron 宿主（refactor Sprint 2，issue #17）：

- `src/main/main.ts` — 单实例锁、窗口、IPC handlers、优雅停机
- `src/main/daemon.ts` — spawn/守护 Go daemon（`vytdl serve --port 0`）、banner 解析、健康轮询
- `src/main/terminal-launcher.ts` — AI agent 终端启动器（移植自 Tauri `terminal_launcher.rs`；provider 目录、launch 脚本、CODEX_HOME 会话）
- `src/preload/index.ts` — `window.vytdlShell` contextBridge（前端唯一的原生入口，返回与 HTTP API 相同的 `{success,data,error}` 信封）

```bash
task shell:dev        # 暂存资源（host daemon + web 导出）并启动
task shell:test       # vitest 单测
task desktop:bundle   # electron-builder（dmg/nsis）
```

资源由 `scripts/build-shell-resources.py` 暂存到 `resources/`（已 gitignore，可随时重建）。
