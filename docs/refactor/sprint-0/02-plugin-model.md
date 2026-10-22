# 02 · 插件模型（DSH plugin 模式落地）

## 1. 设计原则

1. **宿主最小**：`apps/web` 前端宿主只提供 app-shell、路由框架、i18n、插件运行时与插槽；一切功能页面由插件提供。
2. **后端 API 固定**：daemon 只暴露稳定的核心能力 API（下载、设置、元数据、VTT、音频提取）。插件是**前端层**的组合与扩展，不要求 daemon 支持动态后端插件 —— 这让 Go 侧保持简单，也避开在 Go 里做热加载的复杂度与安全风险。
3. **一方内置、第三方安装**：一方插件随前端构建打包；第三方插件安装到 `userData/vytdl-home/plugins/`（DSH profile 模式），带 manifest 校验与 Safe Mode。
4. **契约版本化**：manifest 带 `engine` 字段声明所需插件运行时主版本，运行时拒绝不兼容插件。

## 2. 插件清单（manifest）

每个插件一个包，`package.json` 之外增加 `plugin.json`：

```json
{
  "id": "vytdl.plugin.downloads",
  "name": "Downloads Workbench",
  "version": "1.0.0",
  "engine": "^1",
  "entry": "./dist/client.js",
  "slots": [
    { "slot": "nav", "order": 10 },
    { "slot": "page", "route": "/" },
    { "slot": "settings.section", "order": 10 }
  ],
  "permissions": ["api:downloads", "api:settings", "shell:reveal-folder"],
  "i18n": "./locales"
}
```

- `slots`：声明插件要挂载的插槽（见 §3）。
- `permissions`：插件允许调用的能力面。运行时按此做白名单，未声明的 API 调用直接拒绝并上报。
- `entry`：客户端入口模块，default export 一个 `activate(ctx)` / `deactivate()` 生命周期对象（仿 VSCode 扩展模型，DSH 客户端 bundle 亦类似）。

## 3. 插槽（slots）

宿主预留的扩展点（首批）：

| 插槽 | 位置 | 首个使用者 |
|------|------|-----------|
| `nav` | 侧边栏导航项（icon + label + route） | 全部页面插件 |
| `page` | 路由页面（`route` 字段注册 App Router 页面） | downloads / library / player / analyze / workspace |
| `downloads.form-tab` | 下载表单区的标签页 | single / batch / collection |
| `download-detail.action` | 下载条目的操作按钮 | 重试、打开文件夹、终端启动 |
| `settings.section` | 设置页分区 | 各插件自持设置项 |
| `command` | 全局命令（命令面板/快捷键，预留） | — |

插槽由 `packages/plugin-runtime` 定义类型与注册表；宿主渲染时遍历注册表按 `order` 排序。

## 4. 插件运行时（`packages/plugin-runtime`）

```
pluginRuntime
├── registry        # 内置插件 + 已安装插件的 manifest 注册表
├── loader          # 内置：静态 import；第三方：从 plugins/ 目录动态 import + manifest 校验
├── slots           # 插槽类型与 React 渲染协议
├── api-client      # 按插件 permissions 代理 daemon API（带调用方标记）
├── lifecycle       # activate/deactivate、错误隔离（插件抛错不拖垮宿主）
└── safe-mode       # --safe-mode 启动时只加载内置插件，提供"移除第三方插件"界面
```

错误隔离参照 DSH 的插件故障恢复：插件 activate 或渲染抛错时，宿主记录到日志、把该插件置为 disabled、在恢复界面列出，不整页白屏。

## 5. 首批一方插件与现有代码映射

| 插件包 | 现有代码来源 | 说明 |
|--------|--------------|------|
| `packages/plugin-downloads` | `download-form.tsx`、`download-list.tsx`、`collection-tab.tsx`、`downloadStore` | 下载工作台：单/批/集合三表单、进度列表、重试/取消/删除、Format Picker |
| `packages/plugin-library` | `app/library`、`app/player` | 资产库与播放页 |
| `packages/plugin-settings` | `app/settings`、`settingsStore`、`components/settings/*` | 下载路径、并发数、Cookie、语言等设置分区 |
| `packages/plugin-analyze` | `app/analyze`、VTT 相关组件、`vtt-analysis` API | VTT 分析报告 |
| `packages/plugin-workspace` | `app/workspace`、`components/workspace/*`、`terminal-launcher` | AI Agent 终端启动器（依赖 shell preload 能力，浏览器模式自动降级） |
| `packages/plugin-url-import` | `extensions/url-extractor`（对接侧） | 从扩展接收 URL 入队（Q4 后启动） |

i18n：各插件自带 `locales`，运行时合并进全局翻译表，保持现有 key 结构不变。

## 6. 第三方插件（后续阶段）

- **安装**：Sprint 4 实现 market 安装器（pnpm 安装到 `vytdl-home/plugins/`，失败保留 pending 标记，参照 DSH market-installer）。
- **安全边界**：第三方插件运行在渲染进程内但 API 白名单收窄；默认拒绝 `shell:*` 与写设置外的所有敏感操作；仅内置插件可声明 shell 桥权限。
- **Safe Mode**：启动参数进入安全模式，只载内置插件，提供插件管理界面。
- **验收推迟**：Sprint 1–3 不做第三方加载，专注把一方功能插件化稳定契约（风险 R6）。

## 7. ContentForge 的位置（决策 D5）

ContentForge 保持独立产品线。后续接入方式：ContentForge 自己起一个 daemon（Python 核心已有服务化基础），以 `plugin-contentforge-*` 插件组挂载到同一宿主，经 `slots` 注入自己的页面。本轮不投入，但插槽设计为其预留 `page`/`nav` 等级即可。
