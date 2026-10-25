# vYtDL Plugin Protocol（插件协议规范）

> 版本 1（对应 runtime `engine: "^1"`）· 2026-10-25
> 实现：`packages/plugin-runtime` · 设计渊源：`docs/refactor/sprint-0/02-plugin-model.md`（DSH Desktop 模式）

## 1. 插件模式是什么

vYtDL 的产品形态是"**宿主 + 插件**"：宿主（`apps/web`）只提供窗口骨架、路由挂载点、i18n 和插件运行时；**一切功能页面都是插件**。插件只组合前端能力，后端（Go daemon）暴露固定的核心 API，不做动态后端插件 —— 这使 Go 侧保持简单，也把第三方插件的爆炸半径限制在渲染进程内。

```
宿主 apps/web（app-shell + thin routes + i18n）
        │  register / 查表
插件运行时 packages/plugin-runtime
   ├── manifest 校验        ├── 插槽注册表        ├── 权限代理
   ├── 生命周期 + 错误隔离   ├── safe mode         ├── i18n 合并
        │  activate(ctx)
插件 packages/plugin-*（一方内置）或 ~/.vytdl/plugins/<id>（第三方）
        │  经 ctx.api（白名单代理）调 daemon
daemon services/vytdl（固定核心 API：下载/设置/元数据/VTT/音频/插件清单）
```

三条设计不变量：

1. **宿主最小**：宿主不知道任何具体插件；移除任一插件包，宿主必须可构建、可启动（路由渲染空态）。
2. **后端固定**：插件不扩展 daemon API；核心 API 的命令 → 能力域映射收敛在运行时。
3. **爆炸半径受控**：插件崩溃/越权只影响自己（禁用 + 恢复卡片），宿主不白屏。

## 2. 插件包结构

一个插件 = 一个 workspace 包（一方）或 `~/.vytdl/plugins/<id>/` 下的一个目录（第三方）：

```
<plugin-pkg>/
├── plugin.json        # 清单（唯一契约入口，§3）
├── package.json       # 仅一方插件需要（workspace 解析）
└── <entry>            # 清单 entry 指向的 JS 模块
```

第三方包以 npm 包形式分发（npm/git URL），经 `vytdl plugin install <spec>` 落盘；安装器校验清单中 `plugin.json` 的存在与 `id` 前缀，失败保留目录供诊断。

## 3. Manifest（`plugin.json`）

| 字段 | 类型 | 必填 | 规范 |
|------|------|------|------|
| `id` | string | ✅ | **`vytdl.plugin.<name>`**（正则 `^vytdl\.plugin\.[a-z0-9-]+$`）；同时是第三方安装目录名 |
| `name` | string | ✅ | 人类可读名，管理界面显示 |
| `version` | string | ✅ | semver |
| `engine` | string | ✅ | 所需运行时**主版本**，如 `"^1"`；主版本不匹配 → 拒载 |
| `entry` | string | 第三方 | 入口模块相对路径（一方由包内 index 直接注册，可省） |
| `slots` | array | ✅ | 声明使用的插槽（§5），`page` 槽必须带 `route` |
| `permissions` | array | ✅ | 能力域白名单（§6），未声明的 API 调用被拒绝 |
| `builtin` | bool | — | 内置为 `true`；safe mode 只加载 `builtin: true`（§7） |
| `i18n` | string | — | 预留：locale 目录（当前经 `ctx.register({ locales })` 内联） |

校验失败（含 engine 不兼容、id 不合规）→ 该插件标记 `failed`，宿主正常运行。

## 4. 生命周期

入口模块导出插件对象（一方）或 default/plugin 导出（第三方，二者皆可）：

```ts
export const plugin: VytdlPlugin = {
  manifest: PluginManifest,
  activate(ctx: PluginContext): void | Promise<void>,
  deactivate?(): void,
};

interface PluginContext {
  manifest: PluginManifest;
  api: ScopedApiClient;              // 权限代理后的 daemon 客户端（§6）
  register(reg: PluginRegistration); // 声明贡献物（§5），可多次调用
  log(...args): void;                // 带 <plugin-id> 前缀的日志
}
```

- `activate` 抛错 / Promise reject → 插件置 `failed`，其贡献物全部不生效，宿主照常。
- 渲染期崩溃由宿主侧 `PluginErrorBoundary` 捕获 → 插件置 `disabled`，插槽位置渲染恢复卡片。
- `PluginRegistration = { nav?, pages?, locales? }`（v1 范围；更多插槽见 §5 的扩展方式）。

## 5. 插槽（slots）

宿主预留扩展点，运行时按 `order` 稳定排序渲染。**v1 落地范围**：

| 插槽 | 贡献方式 | 说明 |
|------|----------|------|
| `nav` | `register.nav: NavContribution[]` | 侧边栏主导航（icon + titleKey + href），`enabled: false` 预留 |
| `page` | `register.pages: { route, component }[]` | App Router 路由页面；宿主路由文件是 thin mount（`<PluginPage route pluginId>`），插件缺位 → 空态文案 |

**协议已预留、尚未派发**（新增插槽不破坏 engine 主版本）：

| 插槽 | 预期贡献 |
|------|----------|
| `settings.section` | 设置页分区组件 |
| `downloads.form-tab` | 下载表单附加标签页 |
| `download-detail.action` | 下载条目操作按钮 |
| `command` | 全局命令面板命令 |

插槽声明（manifest `slots`）与实际注册分离：声明是给宿主/管理界面的意图元数据，运行时以 `register()` 的贡献物为准。

## 6. 权限模型

daemon 的每个命令映射到**能力域**；插件只能调用其 `permissions` 覆盖的域：

| 能力域 | 覆盖命令 |
|--------|----------|
| `api:downloads` | start / cancel / retry / get / delete-download |
| `api:settings` | get / update-settings, get-default-output-dir |
| `api:metadata` | get-video-info / get-video-formats / get-playlist-info |
| `api:analyze` | analyze-vtt, vtt-report 系列 |
| `api:media` | extract-audio |
| `shell:reveal-folder` | open / reveal-in-folder（daemon 本地打开） |
| `api:other` | 兜底域（默认无插件声明） |
| `shell:*` / `api:*` | 通配；`shell:*` 仅一方内置插件可声明 |

- 越权调用 → `PermissionDeniedError`（Promise reject，不崩溃宿主）。
- `ctx.api.invoke(command, args)` 是唯一许可路径；插件直接 fetch 供应商 API 不受限（纯前端网络），但触达 daemon 的所有调用都过白名单。
- Electron 原生能力（reveal/open folder、picker、clipboard）不在本协议内 —— 属桌面壳 preload 桥（`window.vytdlShell`），浏览器模式降级隐藏。

## 7. 加载协议

| 来源 | 时机 | 方式 |
|------|------|------|
| 一方内置 | 宿主启动（模块静态 import） | `pluginRuntime.registerAll([...])` |
| 第三方 | 宿主启动后异步 | `GET /api/plugins` 清单 → `import(/api/plugins/<id>/files/<entry>)` 动态加载（daemon 文件服务带路径穿越防护） |

- **Safe Mode**：`?safe-mode=1` 或 `localStorage["vytdl-safe-mode"]="1"` → 跳过全部非 `builtin` 插件；管理界面展示状态与恢复操作。
- **启用/禁用**：第三方插件以目录内 `.disabled` 标记为准（`POST /api/plugins/<id>/disable|enable`），重启或重载生效；状态对前端完全可查（`GET /api/plugins`）。
- 安装不完整（缺 plugin.json / 清单损坏）→ 清单中标记 `pending` + `error`，不加载。

## 8. i18n 协议

- 宿主持有全局翻译表与 locale 状态（`plugin-runtime/i18n`）。
- 插件经 `register({ locales: { <locale>: tree } })` 深合并进全局表；**key 冲突时宿主优先**（插件不得覆盖既有 key）。
- 在 `activate` 内注册（首帧前完成）；语言切换由宿主统一处理。

## 9. 版本化与兼容

- 契约主版本 = `plugin-runtime` 的 engine 检查值（当前 `1`）。**破坏性契约变更必须递增主版本**；运行时拒绝 engine 主版本不同的插件。
- 新增插槽、新增能力域、新增 manifest 可选字段 → 次版本，向后兼容。
- 一方插件与运行时同仓同版（无跨版本兼容负担）；第三方插件自声明 engine。

## 10. 移除与故障语义（验收契约）

| 场景 | 预期 |
|------|------|
| 移除任一插件包 | 宿主可构建、可启动；对应路由渲染 "No plugin provides this page" 空态；导航项消失 |
| 插件 activate 抛错 | 状态 `failed`，其余插件不受影响 |
| 插件渲染崩溃 | 状态 `disabled`，插槽位渲染恢复卡片（含重载与 safe-mode 提示） |
| 第三方安装失败 | 目录保留 `pending` + `error`，管理界面可见，宿主不受影响 |
| safe mode | 仅内置插件；第三方全部 `disabled` 状态可查 |

## 11. 现有一方插件（v1 基线）

| 插件 | 路由 | 权限 |
|------|------|------|
| `vytdl.plugin.downloads` | `/` | downloads, settings, metadata, media, shell:reveal-folder |
| `vytdl.plugin.library` | `/library`, `/player/[id]` | downloads, media |
| `vytdl.plugin.settings` | `/settings` | settings, metadata |
| `vytdl.plugin.analyze` | `/analyze`, `/analyze/[id]` | analyze, metadata, downloads |
