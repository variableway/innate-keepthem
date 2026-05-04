# Feature: Video Packaging & Export

## 概述
实现视频和 URL 的打包导出功能，便于备份、分享和跨设备迁移。

## 子任务

### 7.1 视频打包
**优先级**: P2
**状态**: ⏳ 待实现

**打包格式**: `.vytdl` (ZIP with metadata)

**文件结构**:
```
package.vytdl/
├── manifest.json      # 元数据
├── video.mp4          # 视频文件
├── subtitles/         # 字幕文件
│   ├── en.vtt
│   └── zh.vtt
├── thumbnail.jpg      # 缩略图
└── summary.md         # AI 总结 (可选)
```

**manifest.json**:
```json
{
  "version": "1.0",
  "title": "Video Title",
  "original_url": "https://youtube.com/watch?v=...",
  "downloaded_at": "2024-01-01T00:00:00Z",
  "duration": 3600,
  "resolution": "1080p",
  "format": "mp4",
  "checksum": "sha256:..."
}
```

### 7.2 URL 列表导出
**优先级**: P2
**状态**: ⏳ 待实现

- [ ] 导出为 TXT (纯 URL)
- [ ] 导出为 JSON (含元数据)
- [ ] 导出为 CSV
- [ ] 导入 URL 列表

### 7.3 应用数据导出
**优先级**: P2
**状态**: ⏳ 待实现

- [ ] 完整备份 (数据库+视频)
- [ ] 仅元数据备份
- [ ] 增量备份

### 7.4 分享功能
**优先级**: P3
**状态**: ⏳ 待实现

- [ ] 生成分享链接 (本地网络)
- [ ] 二维码分享
- [ ] 发送到手机

## 使用场景

1. **备份收藏**: 打包珍藏视频到外部硬盘
2. **分享好友**: 导出 URL 列表分享给朋友
3. **跨设备迁移**: 导出到新电脑
4. **离线存档**: 完整视频+字幕打包
