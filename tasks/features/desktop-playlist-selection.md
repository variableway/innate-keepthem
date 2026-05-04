# Feature: Playlist/Channel Video Selection

## 概述
当用户输入 YouTube 播放列表、频道或其他包含多个视频的页面 URL 时，显示视频列表供用户选择要下载哪些视频。

## 支持的 URL 类型

| URL 类型 | 示例 | 说明 |
|----------|------|------|
| 播放列表 | `youtube.com/playlist?list=...` | 标准播放列表 |
| 频道视频 | `youtube.com/@channel/videos` | 频道所有视频 |
| 用户上传 | `youtube.com/user/username/videos` | 用户上传 |
| 搜索页面 | `youtube.com/results?search_query=...` | 搜索结果 |

## 功能实现

### 核心流程

```
用户输入 URL → 检测类型 → 解析视频列表 → 显示选择器 → 用户选择 → 批量下载
```

### 组件

#### VideoListSelector
- **文件**: `src/components/VideoListSelector.tsx`
- **功能**:
  - 显示播放列表/频道信息 (标题、作者、缩略图)
  - 视频列表展示 (缩略图、标题、时长、作者)
  - 批量选择/取消选择
  - 全选/反选
  - 显示选择进度
  - 下载选中视频

#### SmartDownloadForm
- **文件**: `src/components/SmartDownloadForm.tsx`
- **功能**:
  - 智能检测 URL 类型 (单视频/播放列表)
  - 自动选择对应下载流程
  - 支持手动切换模式

### 后端命令

#### get_playlist_info
```rust
#[tauri::command]
pub async fn get_playlist_info(url: String) -> Result<ApiResponse<PlaylistInfo>, String>
```

返回播放列表信息：
```rust
struct PlaylistInfo {
    id: String,
    title: String,
    uploader: Option<String>,
    description: Option<String>,
    thumbnail: Option<String>,
    entries: Vec<PlaylistVideo>,
    webpage_url: String,
}

struct PlaylistVideo {
    id: String,
    title: String,
    duration: Option<i64>,
    thumbnail: Option<String>,
    uploader: Option<String>,
    webpage_url: String,
}
```

### yt-dlp 命令

```bash
# 获取播放列表信息
yt-dlp --dump-single-json --flat-playlist "URL"

# 参数说明:
# --dump-single-json: 输出完整 JSON
# --flat-playlist: 不递归获取每个视频的详细信息 (更快)
```

## 用户界面

### 视频列表选择器

```
┌───────────────────────────────────────────────┐
│  📺 Playlist Title                    [图]   │
│  👤 Channel Name                              │
│  📄 25 videos found                           │
├───────────────────────────────────────────────┤
│  ☑️ Select All                    [5/25]     │
│  ████████████░░░░░░░░░░░░░░░░░░░░ 20%        │
├───────────────────────────────────────────────┤
│  1 ☑️ [缩略图] Video Title 1          5:23   │
│  2 ☐ [缩略图] Video Title 2          12:45  │
│  3 ☑️ [缩略图] Video Title 3          8:30   │
│    ...                                        │
│  25 ☐ [缩略图] Video Title 25        15:00  │
├───────────────────────────────────────────────┤
│  [Cancel]              [Download 5 Videos]    │
└───────────────────────────────────────────────┘
```

### 智能下载表单

提供三种模式:
1. **Auto Detect** - 自动检测 URL 类型
2. **Single Video** - 强制单视频模式
3. **Playlist** - 强制播放列表模式

## 使用流程

### 场景 1: 播放列表下载

1. 用户粘贴播放列表 URL
2. 点击 "Analyze & Download"
3. 显示视频列表选择器
4. 用户选择想要的视频 (默认全选)
5. 点击下载，逐个下载选中视频

### 场景 2: 频道视频下载

1. 用户粘贴频道 URL (如 `youtube.com/@LinusTechTips/videos`)
2. 解析频道最近的视频
3. 用户选择部分视频
4. 批量下载

### 场景 3: 单视频 (备用)

如果 URL 只包含一个视频，直接显示格式选择器

## 批量下载策略

### 顺序下载
- 默认逐个下载
- 避免带宽过载
- 更好的错误处理

### 并发控制 (可选)
- 可配置并发数 (1-3)
- 适用于高速网络

### 错误恢复
- 单个视频失败不影响其他
- 失败视频可重试
- 下载进度保存

## 代码示例

### 前端使用

```tsx
import { VideoListSelector } from '@/components/VideoListSelector';

function MyComponent() {
  const [url] = useState("https://youtube.com/playlist?list=...");
  
  const handleSelect = (videos: PlaylistVideo[]) => {
    console.log(`Selected ${videos.length} videos`);
    // Start batch download
  };

  return (
    <VideoListSelector
      url={url}
      onSelect={handleSelect}
      onCancel={() => console.log('Cancelled')}
    />
  );
}
```

### 后端调用

```rust
// 获取播放列表信息
let info = downloader.get_playlist_info(url).await?;

println!("Playlist: {}", info.title);
println!("Videos: {}", info.entries.len());

for video in info.entries {
    println!("  - {}: {}", video.title, video.webpage_url);
}
```

## 性能考虑

### 大播放列表处理
- 播放列表可能包含数百个视频
- 使用 `--flat-playlist` 快速获取基本信息
- 虚拟滚动显示长列表
- 分页或懒加载

### 缓存
- 缓存播放列表信息
- 避免重复解析
- 设置过期时间 (如 1 小时)

## 测试要点

1. **不同播放列表类型**
   - 普通播放列表
   - 混合播放列表 (视频+直播)
   - 私享/不公开播放列表 (需要 cookie)

2. **大播放列表**
   - 100+ 视频
   - 500+ 视频
   - 分页处理

3. **边界情况**
   - 空播放列表
   - 已删除视频
   - 地区限制视频

## 改进建议

1. **过滤功能**
   - 按日期过滤
   - 按时长过滤
   - 按标题搜索

2. **排序功能**
   - 按日期排序
   - 按时长排序
   - 按标题排序

3. **预览功能**
   - 点击视频预览
   - 显示视频描述

4. **智能选择**
   - 自动选择前 N 个
   - 选择最近一周的
   - 选择特定时长范围内的
