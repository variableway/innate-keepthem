# @vytdl/plugin-runtime — 插件契约与运行时

vYtDL 前端插件架构的核心包（refactor Sprint 3，issue #20；设计见 `docs/refactor/sprint-0/02-plugin-model.md`）。

## 契约

插件 = 一个 workspace 包 + `plugin.json`（id/name/version/`engine: "^1"`/slots/permissions）+ 入口 `activate(ctx)`：经 `ctx.register()` 贡献 nav 与 page，`ctx.api.invoke()` 是按 permissions 白名单代理的 daemon 客户端。

## 模块

| 文件 | 职责 |
|------|------|
| `src/manifest.ts` | manifest 类型 + engine 大版本校验 |
| `src/permissions.ts` | 命令 → 能力域映射（`api:downloads`…`shell:*` 通配），越权拒绝 |
| `src/runtime.ts` | registry：注册/activate 错误隔离（插件崩→disabled，宿主不白屏）/safe-mode/订阅 |
| `src/slots.tsx` | `PluginPage`（路由挂载+空态回退）、`PluginErrorBoundary`、`usePluginStates` |
| `src/i18n.tsx` | 宿主 i18n provider + `registerTranslations`（插件 locale 深合并） |
| `src/client.ts` `/store` `/types` `/layout` `/lib` | 共享客户端层（api-client、Zustand stores、类型、布局原语、工具） |

宿主 `apps/web` 的路由文件只是 `<PluginPage route pluginId>` 挂载；`?safe-mode=1` 跳过非内置插件。

```bash
pnpm --filter @vytdl/plugin-runtime test   # 12 个契约单测
```
