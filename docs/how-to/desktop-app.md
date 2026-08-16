# 桌面应用启动与开发指南

本文档介绍如何启动 vYtDL Desktop 桌面应用，以及如何在不同场景下高效开发。

## 目录

- [环境准备](#环境准备)
- [快速启动](#快速启动)
- [开发模式详解](#开发模式详解)
  - [模式一：完整桌面应用开发](#模式一完整桌面应用开发)
  - [模式二：仅前端 UI 开发（无需桌面壳）](#模式二仅前端-ui-开发无需桌面壳)
  - [模式三：前端 + Web API 模式](#模式三前端--web-api-模式)
- [项目结构速览](#项目结构速览)
- [构建生产版本](#构建生产版本)
- [常见问题](#常见问题)

---

## 环境准备

确保已安装以下依赖（可运行 `docs/how-to/setup.sh` 一键安装）：

| 依赖 | 用途 | 验证命令 |
|------|------|----------|
| Node.js 20+ | 前端运行时 | `node --version` |
| pnpm 9+ | 包管理器 | `pnpm --version` |
| Rust | Tauri 桌面壳 | `rustc --version` |
| yt-dlp | 视频下载引擎 | `yt-dlp --version` |
| FFmpeg | 音频提取 | `ffmpeg -version` |

验证所有依赖：

```bash
cd tools/vytdl-cli-desktop
task check
```

（如未安装 [Task](https://taskfile.dev/)，可运行 `brew install go-task`）

---

## 快速启动

```bash
# 进入桌面应用目录
cd tools/vytdl-cli-desktop

# 方式 A：使用 Task（推荐）
task dev

# 方式 B：使用 pnpm
pnpm tauri:dev
```

首次运行会自动执行 `pnpm install` 安装依赖。

`task dev` 等价于：
1. 安装 Node 依赖（如未安装）
2. 启动 Next.js 开发服务器（端口 3002）
3. 启动 Tauri 桌面窗口并连接到开发服务器

启动后会自动打开桌面窗口，前端代码支持热更新（HMR），修改 React 组件后页面自动刷新。

---

## 开发模式详解

### 模式一：完整桌面应用开发

**适用场景**：开发涉及 Rust 后端的功能（下载、文件系统操作、数据库），或需要测试完整的桌面集成。

```bash
cd tools/vytdl-cli-desktop
pnpm tauri:dev
# 或
task dev
```

**行为**：
- 启动 Next.js 开发服务器（`localhost:3002`）
- 编译 Rust 后端并以开发模式启动 Tauri 窗口
- 前端热更新、Rust 代码更改需重新编译（Tauri 会自动处理）

**停止**：

```bash
task stop
# 或手动：Ctrl+C 然后 pkill -f "next dev"; pkill -f vytdl-desktop
```

---

### 模式二：仅前端 UI 开发（无需桌面壳）

**适用场景**：只需要修改页面布局、样式、组件逻辑，不需要后端功能。这是最轻量的开发方式，启动快、热更新即时。

```bash
cd apps/vytdl-desktop
pnpm dev
# Next.js 开发服务器运行在 http://localhost:3002
```

**行为**：
- 仅启动 Next.js 开发服务器，不启动 Tauri 桌面窗口
- 在浏览器中打开 `http://localhost:3002` 即可查看页面
- React 组件修改即时热更新，无需重启
- **不依赖任何桌面壳或 Rust 编译**，修改 UI 后页面自动刷新

**注意事项**：
- 由于没有 Tauri 后端，调用 Tauri IPC 的操作（如下载、文件操作）会失败
- 纯 UI 层（布局、样式、组件交互、i18n 切换等）可以正常开发和预览
- 状态管理（Zustand）在浏览器中同样有效

**何时使用模式二**：
- 调整页面布局和样式
- 开发/调试 React 组件
- 修改 i18n 翻译文案
- 开发纯前端功能（表单校验、列表展示等）

---

### 模式三：前端 + Web API 模式

**适用场景**：需要在浏览器中完整测试前后端功能，但不想启动桌面壳。需要先启动 Web API 服务器。

```bash
# 终端 1：启动 Web API 服务器
cd tools/vytdl-cli-desktop/web-server
pnpm dev

# 终端 2：启动前端开发服务器
cd apps/vytdl-desktop
pnpm dev
```

前端会自动通过 `api-client.ts` 检测环境：在没有 Tauri IPC 时，回退到 HTTP API 模式（`POST /api/{command}`）。这样可以在浏览器中完整体验所有功能，包括下载、设置等。

---

## 项目结构速览

```
vYtDL-desktop/
├── apps/desktop/                  # 桌面应用前端
│   ├── src/
│   │   ├── app/                   # Next.js App Router 页面
│   │   │   ├── page.tsx           # 首页（下载）
│   │   │   ├── settings/          # 设置页
│   │   │   ├── library/           # 媒体库
│   │   │   ├── workspace/         # AI 工作区
│   │   │   └── analyze/           # VTT 分析
│   │   ├── components/            # React 组件
│   │   │   ├── download-form.tsx  # 下载表单
│   │   │   ├── download-list.tsx  # 下载列表
│   │   │   └── layout/            # 布局组件
│   │   ├── i18n/                  # 国际化
│   │   │   └── locales/           # en.json, zh.json, ja.json
│   │   ├── store/                 # Zustand 状态管理
│   │   ├── lib/api-client.ts      # API 抽象层
│   │   └── types/                 # TypeScript 类型
│   ├── src-tauri/                 # Tauri Rust 后端
│   │   ├── src/
│   │   │   ├── lib.rs             # 应用入口
│   │   │   ├── commands.rs        # IPC 命令
│   │   │   ├── downloader.rs      # 下载核心逻辑
│   │   │   ├── queue.rs           # 下载队列
│   │   │   ├── database.rs        # SQLite 数据库
│   │   │   └── vtt_analysis.rs    # VTT 分析
│   │   └── Cargo.toml
│   └── package.json
├── packages/ui/                   # 共享 UI 组件库
├── packages/utils/                # 共享工具库
├── web-server/                    # Docker Web API 服务器
├── scripts/                       # 构建/启动脚本
├── Taskfile.yml                   # Task 任务定义
└── pnpm-workspace.yaml            # pnpm 工作区配置
```

---

## 构建生产版本

```bash
cd tools/vytdl-cli-desktop

# 构建桌面应用安装包
task build
# 等价于：pnpm install && 下载 yt-dlp 二进制 && pnpm tauri:build

# 查看构建产物
task bundle
```

构建产物位于 `apps/desktop/src-tauri/target/release/bundle/`：
- macOS: `.dmg` 安装包
- Windows: `.msi` / `.exe` 安装包
- Linux: `.AppImage` / `.deb`

---

## 常见问题

### 1. `tauri dev` 启动后页面空白

检查 Next.js 是否正常启动：

```bash
cd apps/vytdl-desktop
pnpm dev
# 访问 http://localhost:3002 确认页面正常
```

### 2. yt-dlp 找不到

需要将 yt-dlp 二进制放入 Tauri 资源目录：

```bash
cd tools/vytdl-cli-desktop
python3 scripts/download-yt-dlp-binaries.py
# 或手动复制：
cp $(which yt-dlp) apps/desktop/src-tauri/resources/yt-dlp/macos/yt-dlp
touch apps/desktop/src-tauri/resources/yt-dlp/macos/.downloaded
```

### 3. pnpm 依赖安装失败

```bash
pnpm install --force
# 如仍有问题，清理后重装：
rm -rf node_modules apps/desktop/node_modules pnpm-lock.yaml
pnpm install
```

### 4. Tauri 编译报错（macOS）

确保安装了 Xcode Command Line Tools：

```bash
xcode-select --install
```

### 5. 端口 3002 被占用

```bash
# 查看占用进程
lsof -i :3002
# 杀掉进程
kill -9 <PID>
```

### 6. 前端热更新不生效（模式二）

- 确认在浏览器中打开的是 `http://localhost:3002` 而非构建产物
- 检查 `apps/desktop/.next` 目录是否存在，可尝试删除后重启：`rm -rf apps/desktop/.next && cd apps/desktop && pnpm dev`
