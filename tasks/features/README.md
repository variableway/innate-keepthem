# vYtDL Desktop - Feature Documentation

本文档目录包含 vYtDL Desktop 桌面应用的详细功能分解和开发指南。

## 功能文档

### 核心功能

| 文档 | 说明 | 状态 |
|------|------|------|
| [desktop-core-download.md](./desktop-core-download.md) | 核心下载功能 (URL、选项、进度、yt-dlp 集成) | ✅ |
| [desktop-multi-platform.md](./desktop-multi-platform.md) | 多平台支持 (YouTube, Bilibili, XHS, etc.) | ✅ |
| [desktop-playlist-selection.md](./desktop-playlist-selection.md) | 播放列表/频道视频列表选择 | ✅ |
| [desktop-playlist-parsing-notes.md](./desktop-playlist-parsing-notes.md) | 播放列表解析平台差异说明 | ✅ |
| [desktop-format-selection.md](./desktop-format-selection.md) | 视频格式选择 (分辨率、编码、文件大小) | ✅ |
| [desktop-ui-components.md](./desktop-ui-components.md) | UI 组件库、主题系统、设计规范 | ✅ |
| [desktop-video-player.md](./desktop-video-player.md) | 视频播放器、媒体库、文件管理 | ✅ |
| [desktop-data-persistence.md](./desktop-data-persistence.md) | 数据库、设置存储、数据导出 | ✅ |

### 增值功能

| 文档 | 说明 | 状态 |
|------|------|------|
| [desktop-ai-summary.md](./desktop-ai-summary.md) | AI 视频总结 (OpenAI/Claude/Gemini) | ⏳ |
| [desktop-notification.md](./desktop-notification.md) | 桌面通知系统 | ✅ |
| [desktop-packaging-export.md](./desktop-packaging-export.md) | 视频打包、导出、分享 | ⏳ |
| [desktop-offline-support.md](./desktop-offline-support.md) | 离线支持、断点续传、代理 | ⏳ |

### 开发指南

| 文档 | 说明 |
|------|------|
| [BUILD.md](./BUILD.md) | 构建指南 (开发/生产/签名/CI) |
| [DEBUG.md](./DEBUG.md) | 调试指南 (常见问题/工具/日志) |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 开发工作流 (规范/流程/测试) |

## 功能实现状态

### 已实现 (MVP)

- ✅ URL 输入与验证
- ✅ 视频质量选择
- ✅ 视频格式选择 (显示所有可用格式)
- ✅ 播放列表/频道视频列表选择
- ✅ 批量下载 (多 URL)
- ✅ 字幕下载 (多语言)
- ✅ 实时进度显示
- ✅ 下载历史管理
- ✅ 内置视频播放器
- ✅ 媒体库浏览器
- ✅ SQLite 数据持久化
- ✅ 设置面板
- ✅ 桌面通知

### 待实现

- ⏳ AI 视频总结
- ⏳ 视频打包导出
- ⏳ 断点续传
- ⏳ 代理配置
- ⏳ 数据导入导出
- ⏳ 缩略图生成
- ⏳ 播放历史

## 快速导航

### 如果你是开发者

1. 先阅读 [DEVELOPMENT.md](./DEVELOPMENT.md) 了解开发规范
2. 查看 [BUILD.md](./BUILD.md) 配置构建环境
3. 遇到问题时参考 [DEBUG.md](./DEBUG.md)

### 如果你是产品经理

1. 查看核心功能文档了解已实现功能
2. 查看增值功能文档了解路线图
3. 每个文档包含详细的子任务和验收标准

### 如果你是测试工程师

1. 每个功能文档包含"测试要点"章节
2. [DEBUG.md](./DEBUG.md) 包含错误诊断流程
3. 参考文档中的"已知问题"章节

## 文档规范

每个功能文档包含以下章节:

1. **概述** - 功能简介
2. **关联代码** - 相关文件位置
3. **子任务** - 详细的功能分解
4. **技术细节** - 关键代码和数据结构
5. **测试要点** - 测试场景和用例
6. **已知问题** - 当前限制和 bug
7. **改进建议** - 未来优化方向

## 贡献指南

更新文档时:

1. 保持文档与代码同步
2. 更新功能状态 (✅/⏳/❌)
3. 添加新的已知问题
4. 更新测试要点

## 相关链接

- [项目 README](../../vYtDL-desktop/README.md)
- [快速开始](../../vYtDL-desktop/QUICKSTART.md)
- [分析文档](../analysis/desktoplize-analysis.md)
