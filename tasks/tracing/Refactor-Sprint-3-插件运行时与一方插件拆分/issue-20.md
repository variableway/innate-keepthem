# Tracing: Refactor Sprint 3: 插件运行时与一方插件拆分

## Task Entry (2026-10-24 23:40:35)

- **Issue**: #20
- **Title**: Refactor Sprint 3: 插件运行时与一方插件拆分
- **Started At**: 2026-10-24 23:40:35
- **Status**: completed

### Original Task Description

```markdown
按 docs/refactor/sprint-0/04-roadmap.md Sprint 3 + 02-plugin-model.md：DSH 插件模式落地，宿主瘦身、功能插件化。

任务：
1. packages/plugin-runtime：registry（manifest 注册表+engine 版本校验）/ slots（类型+React 渲染协议）/ lifecycle（activate/deactivate+错误隔离：插件抛错置 disabled 不白屏）/ api 白名单代理 / safe-mode
2. 插件契约：plugin.json manifest（id/name/version/engine/entry/slots/permissions/i18n）+ 各插件自带 locales 合并进全局翻译表
3. 按序拆出五方插件：plugin-settings → plugin-downloads → plugin-library → plugin-analyze → plugin-workspace（组件+store+locale+路由迁到插件，经插槽注册）
4. 宿主 apps/web 只留 app-shell + 插槽挂载 + i18n + 路由框架

验收：全部功能页面由插件提供；移除任一插件包宿主可启动；safe-mode 只载内置插件。
```
- **Completed At**: 2026-10-25 00:14:19

### Implementation Summary

Sprint 3 完成：插件运行时与五方插件拆分已合入 main（PR #21）。宿主只留 shell+插槽挂载；manifest/engine 校验、权限白名单代理、错误隔离、safe-mode 全部落地并带 12 个单测；零插件宿主构建可启动。遗留：locale 按插件拆分（契约已就位）、第三方插件加载与 market 安装器（Sprint 4）。下一步 Sprint 4：market/发布/下线收尾。

