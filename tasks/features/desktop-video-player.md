# Feature: Video Player & Media Library

## 概述
实现应用内视频播放器和媒体库管理功能，支持字幕显示和播放控制。

## 关联代码
- `vYtDL-desktop/src/components/VideoPlayer.tsx`
- `vYtDL-desktop/src/components/LibraryPage.tsx`
- `vYtDL-desktop/src-tauri/src/commands.rs` (open_download_folder)

## 子任务

### 3.1 视频播放器
**优先级**: P0
**状态**: ✅ 已完成

- [x] HTML5 Video 播放器
- [x] 基础播放控制 (播放/暂停/进度/音量)
- [x] 全屏支持
- [x] 字幕轨道加载
- [x] 多字幕切换

**技术细节**:
```tsx
<video
  ref={videoRef}
  className="w-full h-full"
  controls
  crossOrigin="anonymous"
>
  <source src={`file://${download.filename}`} />
  {download.subtitles.map((sub) => (
    <track
      key={sub}
      kind="subtitles"
      src={`file://${sub}`}
      srcLang={extractLang(sub)}
      label={formatLabel(sub)}
    />
  ))}
</video>
```

### 3.2 播放器增强 (预留)
**优先级**: P1
**状态**: ⏳ 待实现

- [ ] Plyr 或 Video.js 集成
- [ ] 自定义播放控制 UI
- [ ] 播放速度控制 (0.5x - 2x)
- [ ] 画中画模式
- [ ] 截图功能
- [ ] 章节导航

### 3.3 媒体库浏览器
**优先级**: P0
**状态**: ✅ 已完成

- [x] 网格布局展示
- [x] 视频卡片组件
- [x] 搜索过滤
- [x] 排序功能 (时间/标题)

**技术细节**: `LibraryPage.tsx`

### 3.4 视频元数据
**优先级**: P1
**状态**: ⏳ 待实现

- [ ] 缩略图生成
- [ ] 视频时长显示
- [ ] 分辨率/码率信息
- [ ] 文件大小显示
- [ ] 视频预览 (hover 播放)

### 3.5 文件管理
**优先级**: P0
**状态**: ✅ 已完成

- [x] 打开下载文件夹
- [ ] 重命名文件
- [ ] 移动文件
- [ ] 删除文件 (带确认)
- [ ] 导出/分享

**Tauri 命令**:
```rust
#[tauri::command]
pub async fn open_download_folder(path: String) -> Result<ApiResponse<()>, String> {
    match opener::open(path) {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to open folder: {}", e))),
    }
}
```

### 3.6 播放历史
**优先级**: P2
**状态**: ⏳ 待实现

- [ ] 最近播放列表
- [ ] 播放进度记忆 (断点续播)
- [ ] 播放统计 (总时长/次数)

## 文件访问

### 安全限制
Tauri 默认限制文件系统访问，需要配置权限:

```json
// capabilities/main-capability.json
{
  "permissions": [
    "fs:allow-app-read",
    "fs:allow-app-write",
    "fs:allow-download-read",
    "fs:allow-download-write"
  ]
}
```

### 文件路径处理
```typescript
// 从 Rust 获取的路径
const videoPath = `file://${download.filename}`;

// 注意: 需要配置 CSP 允许 file:// 协议
```

## 支持的格式

| 格式 | 支持状态 | 说明 |
|------|----------|------|
| MP4 | ✅ | 完全支持 |
| WebM | ✅ | 完全支持 |
| MKV | ⚠️ | 依赖浏览器解码器 |
| MOV | ✅ | 完全支持 |
| SRT | ✅ | 字幕 |
| VTT | ✅ | 字幕 (推荐) |

## 测试要点

1. **字幕测试**
   - 多语言字幕切换
   - 字幕同步
   - 特殊字符显示

2. **大文件测试**
   - 4GB+ 文件播放
   - 网络存储 (NAS) 播放
   - 外置硬盘播放

3. **兼容性测试**
   - 不同编码格式 (H.264, H.265, AV1)
   - 不同分辨率 (720p - 4K)

## 已知限制

1. **编解码器支持**: 依赖系统安装的解码器
2. **DRM 内容**: 不支持 DRM 保护的视频
3. **网络流媒体**: 目前仅支持本地文件

## 改进建议

1. 集成 FFmpeg 实现缩略图生成
2. 添加视频转码功能
3. 支持 DLNA/Chromecast 投屏
