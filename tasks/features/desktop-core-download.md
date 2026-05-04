# Feature: Core Download Functionality

## 概述
实现桌面应用的核心下载功能，包括 URL 解析、视频/播放列表下载、进度追踪。

## 关联代码
- `vYtDL-desktop/src/components/DownloadForm.tsx` - 单视频下载表单
- `vYtDL-desktop/src/components/BatchDownloadForm.tsx` - 批量下载表单
- `vYtDL-desktop/src/components/FormatSelector.tsx` - 格式选择器
- `vYtDL-desktop/src/components/DownloadFormWithFormat.tsx` - 带格式选择的下载表单
- `vYtDL-desktop/src/hooks/useUrlHistory.ts` - URL 历史管理
- `vYtDL-desktop/src/components/DownloadList.tsx` - 下载列表
- `vYtDL-desktop/src-tauri/src/downloader.rs` - yt-dlp 包装器
- `vYtDL-desktop/src-tauri/src/commands.rs` - IPC 命令

## 子任务

### 1.1 URL 输入与验证
**优先级**: P0
**状态**: ✅ 已完成

- [x] URL 输入框组件
- [x] URL 格式基础验证
- [x] 播放列表开关
- [x] URL 预解析（获取标题预览）- 500ms debounce 自动获取
- [x] 历史 URL 下拉提示 - localStorage 存储最近 20 条

**实现文件**:
- `src/components/DownloadForm.tsx` - 主表单组件
- `src/hooks/useUrlHistory.ts` - URL 历史管理 Hook

**技术细节**:
```typescript
// 组件: DownloadForm.tsx
interface DownloadFormProps {
  onSubmit: (options: DownloadOptions) => void;
  isLoading: boolean;
}
```

### 1.2 下载选项配置
**优先级**: P0
**状态**: ✅ 已完成

- [x] 视频质量选择 (best, 2160p, 1080p, 720p, etc.)
- [x] 输出格式选择 (mp4, webm, mkv)
- [x] 字幕语言选择 (多选)
- [x] 自动字幕开关
- [x] 时间段裁剪 (start/end time)

**技术细节**:
```rust
// 结构体: DownloadOptions
pub struct DownloadOptions {
    pub url: String,
    pub is_playlist: bool,
    pub quality: Option<String>,
    pub format: Option<String>,
    pub sub_langs: Option<Vec<String>>,
    pub write_subs: bool,
    pub write_auto_subs: bool,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}
```

### 1.3 yt-dlp 集成
**优先级**: P0
**状态**: ✅ 已完成

- [x] Rust 端子进程调用 yt-dlp
- [x] 参数构建器
- [x] 自动检测 yt-dlp 路径
- [x] 错误处理

**实现位置**: `src-tauri/src/downloader.rs`

### 1.3.1 视频格式列表获取
**优先级**: P1
**状态**: ✅ 已完成

- [x] 解析所有可用格式
- [x] 显示分辨率、编码、文件大小
- [x] 按质量分组
- [x] 用户选择特定格式下载

**实现文件**:
- `src/components/FormatSelector.tsx` - 格式选择 UI
- `src-tauri/src/commands.rs` - `get_video_formats` 命令
- `src-tauri/src/downloader.rs` - `get_formats` 方法

**使用方式**:
```rust
// 获取所有可用格式
let formats = downloader.get_formats(url).await?;

// 返回格式信息
FormatInfo {
    format_id: "137",
    ext: "mp4",
    resolution: "1920x1080",
    video_codec: "avc1.640028",
    audio_codec: null,
    filesize: 123456789,
    vbr: Some(5.0),  // Mbps
}
```

### 1.4 实时进度传输
**优先级**: P0
**状态**: ✅ 已完成

- [x] stdout 进度解析 (正则匹配)
- [x] Tauri Event 推送
- [x] 前端进度订阅
- [x] 进度条实时更新

**数据流**:
```
yt-dlp stdout -> Rust parser -> Tauri Event -> Frontend Zustand -> React UI
```

### 1.5 下载状态管理
**优先级**: P0
**状态**: ✅ 已完成

- [x] SQLite 数据库存储
- [x] 状态枚举 (pending, downloading, completed, failed, cancelled)
- [x] 下载历史列表
- [x] 删除下载记录

**数据库表**:
```sql
CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL,
    progress REAL DEFAULT 0.0,
    speed TEXT,
    eta TEXT,
    output_dir TEXT,
    filename TEXT,
    subtitles TEXT,
    error TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### 1.6 批量下载支持
**优先级**: P1
**状态**: ✅ 已完成

- [x] 多 URL 输入 - 支持每行一个 URL
- [x] 下载队列管理 - 可视化队列状态
- [x] 并发控制 - 可配置 1-5 个并发下载
- [x] 批量操作 (暂停/开始/清除)

**实现文件**:
- `src/components/BatchDownloadForm.tsx` - 批量下载表单
- 状态追踪: pending → downloading → completed/failed
- 进度条显示总体进度

## 测试要点

1. **URL 验证测试**
   - 有效 YouTube URL
   - 无效 URL 错误提示
   - 播放列表 URL 检测

2. **下载流程测试**
   - 单视频下载
   - 播放列表下载
   - 网络中断恢复
   - 磁盘空间不足处理

3. **进度准确性**
   - 进度百分比正确性
   - 速度/ETA 显示
   - 大文件 (>1GB) 测试

## 已知问题

1. **yt-dlp 路径问题**: Windows 上可能需要手动配置路径
2. **权限问题**: macOS 上可能需要授权访问下载目录
3. **网络代理**: 目前未实现代理配置界面

## 改进建议

1. 添加下载速度限制功能
2. 实现断点续传
3. 支持更多视频源 (Bilibili, Vimeo 等)
