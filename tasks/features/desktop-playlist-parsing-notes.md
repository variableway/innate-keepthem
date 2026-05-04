# Playlist Parsing - Platform Differences

## 问题背景

当解析包含多个视频的页面 URL（播放列表、频道等）时，不同平台提供的数据详细程度不同。

## 平台数据对比

### 完全信息 (YouTube)

YouTube 的 `--flat-playlist` 返回完整信息：

```json
{
  "id": "video123",
  "title": "Video Title",
  "duration": 360,
  "thumbnail": "https://i.ytimg.com/...",
  "uploader": "Channel Name",
  "webpage_url": "https://youtube.com/watch?v=video123"
}
```

### 有限信息 (Bilibili, 部分平台)

某些平台只返回基本信息：

```json
{
  "id": "BV1GJ411x7h7",
  "_type": "url",
  "ie_key": "BiliBili",
  "url": "https://bilibili.com/video/BV1GJ411x7h7"
  // 缺少: title, duration, thumbnail, uploader
}
```

## 解决方案

### 1. 前端适配 (已实现)

```tsx
// VideoListSelector.tsx
const hasDetailedInfo = playlistInfo?.entries.some(e => e.title && e.title !== e.id);

// UI 适配
{video.title && video.title !== video.id ? (
  // 显示完整信息: 标题、时长、缩略图
) : (
  // 有限信息: 只显示 ID 和 URL
  <>
    <h4>ID: {video.id}</h4>
    <p>{video.webpage_url}</p>
  </>
)}
```

### 2. 平台检测和提示

```tsx
<Badge>{platform}</Badge>

{!hasDetailedInfo && (
  <Alert>
    {platform} only provides limited information in playlist mode.
    Video titles will be fetched during download.
  </Alert>
)}
```

### 3. URL 构造

后端根据平台类型构造正确的视频 URL：

```rust
let webpage_url = match entry.ie_key.as_deref() {
    Some("Youtube") => format!("https://www.youtube.com/watch?v={}", entry.id),
    Some("BiliBili") => format!("https://www.bilibili.com/video/{}", entry.id),
    _ => entry.url.clone(), // Fallback
};
```

## 各平台支持情况

| 平台 | 播放列表详情 | 说明 |
|------|--------------|------|
| **YouTube** | ✅ 完整 | 标题、时长、缩略图、作者 |
| **Bilibili** | ⚠️ 有限 | 只有 ID 和 URL |
| **Vimeo** | ✅ 完整 | Showcase 支持良好 |
| **Dailymotion** | ✅ 完整 | 用户视频列表 |
| **其他** | ❓ 未知 | 取决于 yt-dlp 支持 |

## 用户体验优化

### 1. 有限信息提示

当平台只提供有限信息时，显示警告：

```
⚠️ Bilibili only provides limited information in playlist mode.
   Video titles will be fetched during download.
```

### 2. 显示平台标识

让用户知道当前解析的是哪个平台：

```
📺 Playlist Title          [Bilibili]
👤 Channel Name
📄 25 video(s) found (limited info available)
```

### 3. 下载时获取完整信息

即使列表中没有标题，下载时 yt-dlp 也会获取完整信息：

```rust
// 下载时会有完整的视频信息
--print-json  // 输出包含完整标题、作者等信息
```

## 技术实现要点

### Rust 后端 (downloader.rs)

```rust
pub async fn get_playlist_info(&self, url: &str) -> Result<PlaylistInfo, String> {
    // 1. 使用 --flat-playlist 快速获取列表
    // 2. 处理不同平台的数据结构差异
    // 3. 为每个条目构造正确的网页 URL
    // 4. 返回标准化的 PlaylistInfo
}
```

### 关键考虑

1. **性能 vs 详细信息**
   - `--flat-playlist`: 快速，但信息有限
   - 不使用: 慢（需要获取每个视频的详细信息）
   - 我们选择: `--flat-playlist` + 下载时获取详情

2. **平台兼容性**
   - 不是所有平台都支持播放列表提取
   - 需要优雅降级
   - 提供清晰的错误信息

3. **URL 构造**
   - 不同平台的视频 URL 格式不同
   - 根据 `ie_key` (extractor key) 选择正确的格式
   - 提供 fallback 机制

## 测试建议

1. **测试不同平台的播放列表**
   ```
   YouTube: youtube.com/playlist?list=...
   Bilibili: bilibili.com/list/...
   Vimeo: vimeo.com/showcase/...
   ```

2. **验证 URL 构造**
   - 确保生成的视频 URL 可以正常访问
   - 测试单个视频下载是否成功

3. **测试空播放列表**
   - 处理没有视频的播放列表
   - 友好的错误提示

## 参考

- [yt-dlp Playlist Extraction](https://github.com/yt-dlp/yt-dlp#usage-and-options)
- [yt-dlp Extractors](https://github.com/yt-dlp/yt-dlp/tree/master/yt_dlp/extractor)
