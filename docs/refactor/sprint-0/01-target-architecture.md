# 01 · 目标架构

## 1. 参照模式：DSH Desktop 拆解

DSH Desktop（[qdriven/dsh-desktop](https://github.com/qdriven/dsh-desktop)，DeepSeek Harness 桌面版）的核心思路：**桌面应用不重写产品，只做宿主**。

它把系统切成四层：

```
Electron Main（宿主壳）
  ├── 启动/守护一个独立的后台运行时进程（Harness，跑在 127.0.0.1 随机端口）
  ├── BrowserWindow（沙箱）加载后台运行时提供的 Web UI
  ├── 原生能力：目录选择器、菜单、托盘、更新（electron-updater）
  └── userData 目录持久化（profiles / sessions / settings / plugins），与应用安装目录分离
```

DSH 的插件体系：

| 机制 | 说明 |
|------|------|
| Profile | 插件与依赖安装在用户数据目录的 profile 树中，应用升级不覆盖 |
| 插件安装 | market-installer 用 pnpm 把社区插件装进 profile，失败保留诊断标记 |
| 插槽（slots） | 宿主 UI 预留扩展点，插件注册后注入自己的界面 |
| Safe Mode | 第三方插件导致启动/渲染故障时，用官方内核的隔离 profile 启动，保留用户数据，可逐个移除插件 |
| 故障恢复 | 结合运行时日志与渲染层证据定位肇事插件，提供引导式修复 |
| Preset | `.dshpreset` 便携配置包，导入/导出，冲突检查 |
| 远程访问 | Harness 永远只监听回环端口；外部设备经配对 Bridge（短期 token）访问，可选临时公网隧道 |

**对 keepthem 的启示**：宿主（Electron）、运行时（daemon）、UI（Web）、插件（profile 安装）四者解耦，每层可以独立演进；Web UI 天生可被浏览器直接使用。

## 2. keepthem 目标架构

### 2.1 运行时拓扑

```
┌──────────────────────────────────────────────────────────────┐
│ Electron Shell（apps/shell）                                  │
│ 单实例锁 · 窗口/菜单/托盘 · 原生对话框 · 自动更新 · 日志桥        │
│   │ spawn + 健康轮询                                          │
│   ▼                                                          │
│ vYtDL Daemon（Go，vytdl serve，127.0.0.1 随机端口）            │
│ HTTP API + WebSocket 广播 · 下载队列 · SQLite · 设置 · VTT      │
│ 服务 Next.js 静态导出前端 · spawn yt-dlp 子进程                 │
│   ▲                                                          │
│   │ http://127.0.0.1:<port>                                   │
┌───┴────────────────────────────┬─────────────────────────────┐
│ BrowserWindow（沙箱渲染进程）    │ 浏览器（本地直连 / Docker 部署）│
│         Web UI（apps/web）— 同一份前端，插件运行时 + 插槽        │
└────────────────────────────────┴─────────────────────────────┘
```

### 2.2 组件职责

| 组件 | 位置 | 职责 | 不负责 |
|------|------|------|--------|
| Electron Shell | `apps/shell` | 进程生命周期（spawn/守护/崩溃重启 daemon）、窗口管理、原生菜单/托盘/文件对话框、自动更新、打开外部链接 | 任何业务逻辑；**不再有队列/下载器/数据库** |
| vYtDL Daemon | `services/vytdl`（= `vYtDL-standalone` 检出 + 新增 `serve`） | 唯一后端：下载队列（并发上限、取消、重试、resume）、yt-dlp 子进程与进度解析、SQLite（downloads + settings + VTT 报告）、HTTP API + WS 事件、静态资源服务 | UI |
| Web 前端宿主 | `apps/web` | Next.js 应用：插件运行时、插槽宿主、i18n、路由 | 直接依赖 Electron/Tauri API |
| 插件 | `packages/plugin-*` | 以 manifest 声明插槽与依赖，注入 UI 与功能 | 私自开后门调用系统能力 |

### 2.3 启动流程（参照 DSH Startup flow）

1. Shell 取得单实例锁，准备 `userData`（Windows: `%APPDATA%`，macOS: `~/Library/Application Support`）。
2. 解析/下载 daemon 二进制（随应用打包为 resource，按平台 triple 构建）。
3. `vytdl serve --port 0 --static <前端资源>` 启动 daemon，随机回环端口。
4. Shell 轮询 `GET /api/health` 直至就绪（超时则收集 daemon 日志进入恢复界面，参照 DSH 故障恢复）。
5. BrowserWindow 加载 `http://127.0.0.1:<port>`；contextIsolation、禁 nodeIntegration、仅信任 daemon 与本地资源。
6. daemon 启动时做 **resume**：把上次的 `downloading` 记录重置为 `pending` 重新入队（沿用现有行为）。
7. 浏览器路径：本地用户可直接打开同一 URL（回环）；远程场景走 Docker 部署（daemon + 前端同镜像），必要时加访问 token（开放问题 Q3）。

### 2.4 数据落点（参照 DSH Persistent data）

```
Electron userData/
├── vytdl-home/                 # daemon 数据根（--home 参数注入）
│   ├── vytdl.db                # SQLite（downloads / settings / vtt_reports）
│   ├── plugins/                # 第三方插件安装目录（profile）
│   └── logs/                   # daemon 日志
└── Logs/                       # shell 日志
```

应用升级不触碰 `vytdl-home`；卸载可选择保留。

## 3. 为什么放弃 Tauri 改用 Electron

| 维度 | Tauri（现状） | Electron（目标） |
|------|---------------|------------------|
| 前端浏览器可用 | 可以，但需要另维护 vytdl-web 这套 Node 后端 | 原生满足：浏览器与桌面窗口加载同一 daemon URL |
| 后端逻辑归属 | Rust 重写了一遍队列/下载/DB（~7.5k 行） | 主进程零业务逻辑，业务只在 Go daemon 一处 |
| 与 DSH 模式匹配 | 需自造进程管理/插件恢复等宿主设施 | DSH 模式即 Electron，宿主设施可直接复用其思路 |
| 原生能力 | cookie.rs 读浏览器 cookie、terminal_launcher 等 Rust 实现 | 主进程 Node：child_process、plist/registry 等生态更全 |
| 代价 | — | 安装包更大（~100MB 级）、内存占用更高、需处理签名/公证 |

**结论**：业务上"浏览器可用 + 单一后端"是硬需求（Issue #12 第 3 点），Electron 的代价可接受；Tauri 带来的体积优势建立在三份后端重复实现之上，得不偿失。

## 4. API 面（daemon 对外契约）

`vytdl serve` 的 API 以现有 `apps/vytdl-web/src/index.ts` 路由为基线（这是桌面/Web 已对齐的命令集），全部迁移：

```
POST /api/start-download    POST /api/cancel-download    POST /api/retry-download
POST /api/get-downloads     GET  /api/downloads          POST /api/delete-download
POST /api/get-video-info    POST /api/get-video-formats  POST /api/get-playlist-info
POST /api/get-settings      POST /api/update-settings
POST /api/extract-audio     POST /api/analyze-vtt
GET  /api/vtt-reports       GET  /api/vtt-report/:id     POST /api/delete-vtt-report
POST /api/open-download-folder  POST /api/reveal-in-folder  POST /api/get-default-output-dir
GET  /api/health            WS   /api/ws（进度广播）
```

新增仅两项：`GET /api/health`（启动探测）、桌面专属的"原生动作"（打开文件夹/呼出终端）改为前端经 shell preload 桥接，不再混入 HTTP API —— 浏览器模式下这些按钮按能力探测降级隐藏。

## 5. 与现有三端的关系

| 现有资产 | 去向 |
|----------|------|
| `vYtDL-standalone`（Go CLI：downloader/record/vtt/ytdlpbin/config） | **全部保留**，`serve` 模式直接复用 `internal/*` 包 |
| `apps/vytdl-web/src/`（Hono 路由、queue、database schema） | 作为 API 行为参考实现，Sprint 1 用 Go 重写后下线；Docker 镜像改为跑 Go daemon + 静态前端 |
| `apps/vytdl-desktop` 前端（Next.js 组件、i18n、api-client、Zustand stores） | 迁移为 `apps/web`，`api-client.ts` 删除 Tauri 分支只剩 HTTP/WS 模式 |
| `apps/vytdl-desktop/src-tauri/`（~7.5k 行 Rust） | 业务逻辑不再迁移（Go 端已有等价实现）；`terminal_launcher` / `cookie` / `audio_extractor` 的行为在 Sprint 2 用 Electron 主进程重写 |
| `apps/contentforge-desktop` | 本轮冻结不动（决策 D5） |
| Chrome 扩展 `extensions/url-extractor` | 保留，后续经"URL 推送"插件对接 daemon API（开放问题 Q4） |
