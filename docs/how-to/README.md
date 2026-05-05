# 如何通过 AI 实现视频下载器项目

本教程介绍如何使用 AI（如 Kimi、Claude、GPT 等）辅助实现一个完整的视频下载器套件，涵盖 CLI、桌面应用、Web UI 和浏览器扩展四个组件。

## 项目架构

```
vYtDL Suite
├── vYtDL/                    # Go CLI 应用
├── vYtDL-desktop/            # 桌面应用（Tauri + Next.js）
│   ├── apps/desktop/         # 桌面应用本体
│   ├── packages/ui/          # 共享 UI 组件
│   ├── packages/utils/       # 共享工具
│   └── web-server/           # Docker Web API 服务器
├── url-extractor/            # Chrome 扩展
└── docker-compose.yml        # Docker Compose 配置
```

## 使用的技术栈

| 组件 | 语言/框架 | 用途 |
|------|----------|------|
| CLI | Go 1.24+ | 命令行下载工具 |
| Desktop Shell | Tauri v2 (Rust) | 跨平台桌面框架 |
| Desktop UI | Next.js 15 + React 19 + TypeScript | 前端界面 |
| Styling | Tailwind CSS + shadcn/ui | UI 样式 |
| State | Zustand | 前端状态管理 |
| Database | SQLite (sqlx/better-sqlite3) | 下载记录持久化 |
| Web Server | Node.js + Express + WebSocket | Docker 部署 |
| Extension | Manifest V3 | Chrome 扩展 |
| Core Engine | yt-dlp | 视频解析与下载 |
| Audio Extraction | FFmpeg | 音频提取 |

## 实现步骤（AI 辅助）

### 第一步：定义需求与拆分任务

向 AI 描述目标："创建一个支持 YouTube、Bilibili 等站点的视频下载器套件，包含 CLI、桌面应用、Web UI 和 Chrome 扩展。"

AI 会帮你：
- 拆分任务到可管理的模块
- 选择合适的技术栈
- 设计数据库 schema
- 规划 API 接口

### 第二步：逐组件实现

#### 1. CLI 工具（Go）

使用 AI 生成 Go 代码，核心逻辑包括：
- 使用 `spf13/cobra` 构建命令行界面
- 使用 `yt-dlp` 子进程执行下载
- 使用 `charmbracelet/bubbletea` 构建 TUI 进度界面
- 使用 JSON/CSV 记录下载历史

**Prompt 示例**：
```
用 Go 写一个命令行视频下载器，支持：
1. 单视频和播放列表下载
2. 可选择画质（720p/1080p/4K/best）
3. 可选择格式（mp4/webm/mkv）
4. 显示实时下载进度条
5. 自动下载字幕（中英文）
6. 支持断点续传
使用 cobra 做命令行，bubbletea 做 TUI。
```

#### 2. 桌面应用（Tauri + Next.js）

使用 AI 生成前后端代码：

**Rust 后端**：
- Tauri IPC 命令（开始下载、取消、获取列表等）
- SQLite 数据库操作
- 异步下载队列管理
- yt-dlp 子进程封装

**前端**：
- 下载表单（单视频/批量/智能模式）
- 下载列表（状态、进度、日志、操作按钮）
- 媒体库（已下载视频浏览）
- 设置页面（语言、输出目录、并发数等）
- 多语言支持（i18n）

**Prompt 示例**：
```
用 Tauri v2 + Next.js + React 写一个视频下载器桌面应用：
1. 首页有下载表单，支持粘贴 URL
2. 下载列表显示状态（等待中/下载中/已完成/失败）
3. 点击已完成项可打开文件夹
4. 设置页面可切换语言（中/英/日）
5. 使用 Zustand 管理状态
6. 使用 Tailwind CSS 做样式
```

#### 3. Web UI（Docker）

复用桌面应用的前端代码，通过 `api-client.ts` 的抽象层同时支持 Tauri IPC 和 HTTP API。

**Prompt 示例**：
```
用 Express + WebSocket 写一个视频下载器的 Web API：
1. 提供与桌面应用相同的 API 接口
2. 使用 SQLite 存储数据
3. 通过 WebSocket 推送下载进度
4. 支持 Docker 部署
```

#### 4. Chrome 扩展

使用 AI 生成简单的内容脚本和弹窗：
- 从 YouTube 频道/播放列表页面提取视频 URL
- 过滤和导出功能

### 第三步：集成与测试

使用 AI 帮助你：
- 编写跨平台构建脚本
- 配置 Docker Compose
- 解决平台兼容性问题
- 添加错误处理和日志

### 第四步：部署与分发

- CLI：Go 交叉编译
- Desktop：Tauri 打包（.dmg/.exe/.AppImage）
- Web：Docker Compose 一键部署
- Extension：Chrome Web Store 或手动加载

## 安装必要依赖

### macOS

```bash
# 1. 安装 Homebrew（如果还没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 安装所有依赖
brew install go node pnpm rust yt-dlp ffmpeg

# 3. 验证安装
go version
node --version
pnpm --version
cargo --version
yt-dlp --version
ffmpeg -version
```

### Linux (Ubuntu/Debian)

```bash
# 1. 更新包列表
sudo apt update

# 2. 安装基础依赖
sudo apt install -y curl git build-essential

# 3. 安装 Go
sudo apt install -y golang-go

# 4. 安装 Node.js 和 pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm

# 5. 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# 6. 安装 yt-dlp 和 ffmpeg
sudo apt install -y yt-dlp ffmpeg

# 7. 验证
go version
node --version
pnpm --version
cargo --version
yt-dlp --version
ffmpeg -version
```

### Windows

```powershell
# 1. 安装 winget（Windows 10/11 自带）

# 2. 安装依赖
winget install GoLang.Go
winget install OpenJS.NodeJS
winget install Rustlang.Rustup
winget install Gyan.FFmpeg
winget install yt-dlp.yt-dlp

# 3. 安装 pnpm
npm install -g pnpm

# 4. 验证
go version
node --version
pnpm --version
cargo --version
yt-dlp --version
ffmpeg -version
```

## 一键安装脚本

项目提供了跨平台的一键安装脚本：

- **macOS / Linux**: [setup.sh](./setup.sh)
- **Windows**: [setup.ps1](./setup.ps1)

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/your-repo/vYtDL/main/docs/how-to/setup.sh | bash

# Windows
irm https://raw.githubusercontent.com/your-repo/vYtDL/main/docs/how-to/setup.ps1 | iex
```

## 如何使用 SKILL 功能

本项目包含一个 AI Skill（`.agents/skills/vytdl-dev/`），当使用支持 Skill 的 AI 工具（如 Kimi Code CLI）时，AI 会自动加载项目上下文，包括：

- 项目架构和技术栈说明
- 各组件开发指南
- 常见任务模式（添加命令、添加语言、修改下载行为等）
- 数据库 schema 和 API 规范

### Skill 使用场景

1. **添加新功能**："给桌面应用添加一个批量删除已完成下载的功能"
2. **修复 Bug**："修复下载完成后进度条不消失的问题"
3. **添加语言**："给桌面应用添加韩语支持"
4. **修改样式**："把下载按钮改成圆角风格"
5. **构建发布**："打包桌面应用到 macOS DMG"

AI 会基于 Skill 中的知识，自动定位正确的文件、遵循项目约定、更新相关配置。

## Bilibili 站点测试

本项目使用 yt-dlp 作为核心引擎，天然支持 Bilibili 下载。

### 测试链接

**测试视频**: https://www.bilibili.com/video/BV1kqdxBEEoe

### 测试步骤

#### CLI 测试

```bash
cd vYtDL
go build -o vYtDL .
./vYtDL download "https://www.bilibili.com/video/BV1kqdxBEEoe"
```

#### 桌面应用测试

1. 启动桌面应用：`cd vYtDL-desktop/apps/desktop && pnpm tauri dev`
2. 在首页粘贴 Bilibili URL
3. 选择画质和格式
4. 点击下载，观察进度和日志

#### Web UI 测试

1. 启动 Web 服务：`docker-compose up -d`
2. 打开 http://localhost:3000
3. 粘贴 Bilibili URL 并下载

### 预期结果

- 视频信息正确获取（标题、时长、封面）
- 下载进度正常更新
- 视频文件成功保存到输出目录
- 字幕（如有）一并下载

## 学习资源

- [Tauri 官方文档](https://tauri.app/)
- [Next.js 官方文档](https://nextjs.org/)
- [yt-dlp 文档](https://github.com/yt-dlp/yt-dlp)
- [Go Cobra](https://github.com/spf13/cobra)
- [Bubble Tea TUI](https://github.com/charmbracelet/bubbletea)

## 贡献指南

1. Fork 本项目
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -am 'Add some feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

AI 可以帮助你完成代码审查、文档更新和测试用例编写。
