# Feature: Video Format Selection

## 概述
允许用户在下载前查看和选择视频的具体格式（分辨率、编码、文件大小等）。

## 使用场景

1. **节省空间**: 选择较小文件大小而非最高质量
2. **特定需求**: 需要特定编码 (如 H.264 兼容性)
3. **音频提取**: 仅下载音频格式
4. **带宽限制**: 选择适合网络条件的质量

## 功能实现

### 前端组件

#### FormatSelector
- **文件**: `src/components/FormatSelector.tsx`
- **功能**:
  - 显示所有可用格式列表
  - 按分辨率分组 (4K, 1080p, 720p, etc.)
  - 显示技术信息 (编码、码率、文件大小)
  - 单选格式
  - 支持自定义格式代码

#### DownloadFormWithFormat
- **文件**: `src/components/DownloadFormWithFormat.tsx`
- **功能**:
  - 集成格式选择流程
  - 先输入 URL → 选择格式 → 开始下载

### 后端命令

#### get_video_formats
```rust
#[tauri::command]
pub async fn get_video_formats(url: String) -> Result<ApiResponse<Vec<FormatInfo>>, String>
```

返回格式信息：
```rust
struct FormatInfo {
    format_id: String,        // 如 "137", "best", "worst"
    ext: String,              // 扩展名: mp4, webm, m4a
    resolution: Option<String>, // 如 "1920x1080"
    fps: Option<i32>,         // 帧率
    filesize: Option<i64>,    // 文件大小 (bytes)
    filesize_approx: Option<i64>, // 估算大小
    video_codec: Option<String>,  // 视频编码: avc1, vp9, av01
    audio_codec: Option<String>,  // 音频编码: mp4a, opus
    vbr: Option<f64>,         // 视频码率 (Mbps)
    abr: Option<i64>,         // 音频码率 (kbps)
    asr: Option<i64>,         // 音频采样率
    quality: String,          // 质量描述
}
```

## 用户界面

### 格式选择器布局

```
┌─────────────────────────────────────────┐
│  📹 Select Download Format               │
├─────────────────────────────────────────┤
│  4K (3840x2160)                         │
│  ┌─────────────────────────────────────┐│
│  │ ○ 137  mp4  avc1  45.2 MB  15 Mbps ││
│  │ ○ 401  webm vp9   38.5 MB  12 Mbps ││
│  └─────────────────────────────────────┘│
│  1080p (1920x1080)                      │
│  ┌─────────────────────────────────────┐│
│  │ ● 137  mp4  avc1   22.1 MB  8 Mbps ││  ← 选中
│  │ ○ 248  webm vp9    18.3 MB  6 Mbps ││
│  └─────────────────────────────────────┘│
│  🎵 Audio Only                          │
│  ┌─────────────────────────────────────┐│
│  │ ○ 140  m4a  mp4a    2.1 MB 128 kbps││
│  │ ○ 251  webm opus    1.8 MB 160 kbps││
│  └─────────────────────────────────────┘│
├─────────────────────────────────────────┤
│  [Cancel]              [Download]       │
└─────────────────────────────────────────┘
```

### 格式代码输入

高级用户可以输入自定义 yt-dlp 格式选择器：
- `bestvideo[height<=1080]+bestaudio` - 最佳 1080p
- `worst` - 最小文件
- `best[filesize<50M]` - 小于 50MB 的最佳质量

## 技术实现

### yt-dlp 命令

```bash
# 获取格式列表
yt-dlp --list-formats "URL"

# 或获取完整 JSON
yt-dlp --dump-json --no-download "URL"
```

### 数据处理

```typescript
// 按分辨率分组
const grouped = formats.reduce((acc, format) => {
  const key = format.resolution || 'audio-only';
  if (!acc[key]) acc[key] = [];
  acc[key].push(format);
  return acc;
}, {});

// 按质量排序 (从高到低)
const sorted = formats.sort((a, b) => {
  const heightA = parseInt(a.resolution?.split('x')[1] || '0');
  const heightB = parseInt(b.resolution?.split('x')[1] || '0');
  return heightB - heightA;
});
```

## 测试要点

1. **格式解析准确性**
   - 验证所有格式正确显示
   - 检查分辨率和文件大小
   - 确认编码信息

2. **选择功能**
   - 单选正常工作
   - 自定义格式代码有效
   - 确认后正确传递

3. **边界情况**
   - 仅音频视频
   - 低质量视频 (360p 以下)
   - 无音频流 (视频 only)

## 使用示例

```tsx
import { FormatSelector } from '@/components/FormatSelector';

function MyComponent() {
  const [url] = useState("https://youtube.com/watch?v=...");
  
  const handleSelect = (formatId: string) => {
    console.log('Selected format:', formatId);
    // startDownload({ url, quality: formatId })
  };

  return (
    <FormatSelector
      url={url}
      onSelect={handleSelect}
      onCancel={() => console.log('Cancelled')}
    />
  );
}
```

## 相关链接

- [yt-dlp Format Selection](https://github.com/yt-dlp/yt-dlp#format-selection)
- [YouTube Video Quality](https://support.google.com/youtube/answer/1722171)
