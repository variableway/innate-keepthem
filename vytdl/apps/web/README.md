# @vytdl/web — vYtDL 前端（浏览器/桌面共用）

Next.js + React 19 前端，静态导出（`output: "export"`），由 `vytdl serve --static` 直接托管。

- 纯 HTTP/WS 通信（`src/lib/api-client.ts`，无 Tauri 分支）；`NEXT_PUBLIC_API_BASE` 可指向独立 daemon（dev 默认同源）
- 桌面专属能力经 `window.vytdlShell` preload 桥（Electron 注入）；纯浏览器自动降级/隐藏
- 迁移自 `apps/vytdl-desktop`（refactor Sprint 2，issue #17）；旧 Tauri 应用 Sprint 4 下线

```bash
pnpm --filter @vytdl/web dev    # 开发（:3001，配 task daemon:dev）
pnpm --filter @vytdl/web build  # 静态导出 → out/
```

架构与迁移背景见 `docs/refactor/sprint-0/`。
