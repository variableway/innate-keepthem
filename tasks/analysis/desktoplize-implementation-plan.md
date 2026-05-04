# Desktoplize 实施计划

## 项目结构

```
innate-keepthem/
├── tasks/
│   ├── analysis/
│   │   ├── desktoplize-analysis.md        # 可行性分析报告
│   │   └── desktoplize-implementation-plan.md  # 本实施计划
│   └── features/
│       └── desktoplize.md                 # 原始需求
├── vYtDL/                                 # 原始 Go CLI 项目
└── vYtDL-desktop/                         # 新建桌面应用项目
    ├── src/                               # React + TypeScript 前端
    ├── src-tauri/                         # Tauri Rust 后端
    ├── go-downloader/                     # Go 下载器包装器
    └── README.md                          # 项目说明
```

## 已完成工作

### 1. 项目初始化 ✅
- [x] Vite + React + TypeScript 项目创建
- [x] Tauri 项目配置
- [x] Tailwind CSS 配置
- [x] shadcn/ui 风格组件实现

### 2. 前端实现 ✅
- [x] 基础 UI 组件 (Button, Input, Card, Progress, Badge, Alert, Tabs, Label)
- [x] 布局组件 (Layout with Sidebar)
- [x] 下载表单组件 (DownloadForm)
- [x] 下载列表组件 (DownloadList)
- [x] 视频播放器组件 (VideoPlayer with Plyr)
- [x] 媒体库页面 (LibraryPage)
- [x] 设置页面 (SettingsPage)
- [x] 状态管理 (Zustand stores)
- [x] 类型定义

### 3. 后端实现 ✅
- [x] Tauri 命令接口
- [x] SQLite 数据库 (下载记录、设置)
- [x] 下载器包装 (Rust)
- [x] 进度事件系统
- [x] 通知系统集成

### 4. Go 集成 ✅
- [x] Go downloader stdout 协议设计
- [x] Go 包装器实现
- [x] yt-dlp 调用集成

## 文件清单

### Frontend Files

| 文件 | 描述 |
|------|------|
| `src/main.tsx` | React 应用入口 |
| `src/App.tsx` | 主应用组件，路由配置 |
| `src/index.css` | 全局样式 + Tailwind |
| `src/lib/utils.ts` | 工具函数 (cn, formatBytes, formatDuration) |
| `src/types/index.ts` | TypeScript 类型定义 |
| `src/stores/downloadStore.ts` | 下载状态管理 |
| `src/stores/settingsStore.ts` | 设置状态管理 |
| `src/components/ui/*.tsx` | UI 基础组件 |
| `src/components/DownloadForm.tsx` | 下载表单 |
| `src/components/DownloadList.tsx` | 下载列表 |
| `src/components/VideoPlayer.tsx` | 视频播放器 |
| `src/components/Layout.tsx` | 页面布局 |
| `src/components/HomePage.tsx` | 首页 |
| `src/components/LibraryPage.tsx` | 媒体库 |
| `src/components/SettingsPage.tsx` | 设置页面 |

### Backend Files

| 文件 | 描述 |
|------|------|
| `src-tauri/src/main.rs` | Tauri 入口 |
| `src-tauri/src/commands.rs` | IPC 命令实现 |
| `src-tauri/src/database.rs` | SQLite 数据库操作 |
| `src-tauri/src/downloader.rs` | 下载器包装 |
| `src-tauri/Cargo.toml` | Rust 依赖配置 |
| `src-tauri/tauri.conf.json` | Tauri 配置 |
| `src-tauri/capabilities/*.json` | 权限配置 |

### Configuration Files

| 文件 | 描述 |
|------|------|
| `package.json` | Node 依赖和脚本 |
| `tsconfig.json` | TypeScript 配置 |
| `vite.config.ts` | Vite 配置 |
| `tailwind.config.js` | Tailwind 配置 |
| `postcss.config.js` | PostCSS 配置 |

## 下一步工作

### 短期 (1-2 周)

1. **测试和修复**
   - [ ] 端到端测试下载流程
   - [ ] 修复 Rust 代码中的类型错误
   - [ ] 验证 Tauri IPC 通信
   - [ ] 测试视频播放功能

2. **构建配置**
   - [ ] 添加应用图标
   - [ ] 配置代码签名 (macOS/Windows)
   - [ ] 测试生产构建
   - [ ] 创建安装包

3. **yt-dlp 集成优化**
   - [ ] 自动检测 yt-dlp 路径
   - [ ] 内置 yt-dlp 二进制文件
   - [ ] 自动更新 yt-dlp

### 中期 (3-4 周)

1. **AI 总结功能**
   - [ ] 集成 OpenAI API
   - [ ] 集成 Claude API
   - [ ] 集成 Gemini API
   - [ ] 字幕提取和摘要生成
   - [ ] Markdown 渲染优化

2. **高级下载功能**
   - [ ] 批量下载
   - [ ] 下载队列管理
   - [ ] 下载恢复
   - [ ] 代理设置

3. **用户体验优化**
   - [ ] 拖拽下载链接
   - [ ] 剪贴板监控
   - [ ] 深色/浅色主题切换
   - [ ] 键盘快捷键

### 长期 (5-8 周)

1. **媒体库增强**
   - [ ] 视频元数据获取
   - [ ] 缩略图生成
   - [ ] 视频搜索
   - [ ] 播放列表管理

2. **打包和发布**
   - [ ] 视频/URL 打包格式设计
   - [ ] 导入/导出功能
   - [ ] 云同步 (可选)

3. **平台优化**
   - [ ] Windows 安装程序优化
   - [ ] macOS App Store 准备
   - [ ] Linux 包格式 (AppImage, deb, rpm)

## 依赖说明

### 前端依赖

```json
{
  "react": "^18.2.0",
  "react-router-dom": "^6.22.0",
  "zustand": "^4.5.0",
  "plyr": "^3.7.8",
  "plyr-react": "^5.3.0",
  "lucide-react": "^0.454.0",
  "@tauri-apps/api": "^2.0.0"
}
```

### 后端依赖 (Rust)

```toml
[dependencies]
tauri = "2"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.7", features = ["sqlite"] }
serde = { version = "1", features = ["derive"] }
regex = "1"
chrono = "0.4"
uuid = "1"
```

### 系统依赖

- Node.js 18+
- Rust 1.70+
- Go 1.24+ (用于复用现有下载器)
- yt-dlp

## 运行命令

```bash
# 开发模式
cd vYtDL-desktop
npm run tauri:dev

# 生产构建
npm run tauri:build

# 仅前端开发
npm run dev
```

## 注意事项

1. **yt-dlp 路径**: 需要在设置中配置或使用 PATH 中的 yt-dlp
2. **文件权限**: Tauri 需要文件系统权限来保存下载的视频
3. **跨平台**: 不同平台的 yt-dlp 安装方式不同
4. **网络**: 需要处理代理和 Cookie 以支持受限视频

## 风险缓解

| 风险 | 缓解措施 |
|------|----------|
| yt-dlp 不可用 | 提供清晰的错误消息和安装指南 |
| YouTube 限制 | 支持 Cookie 和代理配置 |
| 大文件播放 | 使用原生播放器，支持流媒体 |
| AI API 成本 | 用户自行提供 API Key |
| 跨平台兼容性 | CI/CD 多平台测试 |
