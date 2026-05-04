# Feature: Multi-Platform Video Support

## 概述
vYtDL Desktop 支持从多个视频平台下载内容，不仅仅是 YouTube。

## 支持的平台

| 平台 | 域名 | 支持内容 | 状态 |
|------|------|----------|------|
| **YouTube** | youtube.com, youtu.be | 视频、播放列表、频道 | ✅ 完全支持 |
| **Bilibili** | bilibili.com, b23.tv | 视频、播放列表、用户视频 | ✅ 完全支持 |
| **小红书** | xiaohongshu.com, xhslink.com | 视频笔记 | ✅ 完全支持 |
| **Vimeo** | vimeo.com | 视频、Showcase | ✅ 完全支持 |
| **Twitter/X** | twitter.com, x.com | 视频推文 | ✅ 完全支持 |
| **TikTok** | tiktok.com | 视频 | ✅ 完全支持 |
| **Dailymotion** | dailymotion.com | 视频、用户视频 | ✅ 完全支持 |
| **Twitch** | twitch.tv | 视频、剪辑 | ✅ 完全支持 |
| **Facebook** | facebook.com, fb.watch | 视频 | ✅ 完全支持 |
| **Instagram** | instagram.com | 视频、Reels | ✅ 完全支持 |
| **Niconico** | nicovideo.jp | 视频 | ✅ 完全支持 |

> 注意：所有平台支持都通过 yt-dlp 实现。只要 yt-dlp 支持的网站，vYtDL 都支持。

## 平台特定说明

### Bilibili (哔哩哔哩)

**支持的 URL 格式**:
```
https://www.bilibili.com/video/BV1GJ411x7h7
https://www.bilibili.com/list/123456
https://space.bilibili.com/123456/video
https://b23.tv/xxxx
```

**注意事项**:
- 部分视频需要登录 (cookie) 才能下载高清版本
- 支持下载弹幕 (作为字幕)
- 支持批量下载用户上传视频

### 小红书 (Xiaohongshu)

**支持的 URL 格式**:
```
https://www.xiaohongshu.com/explore/12345678
https://xhslink.com/xxxx
```

**注意事项**:
- 视频通常较短 (1-5分钟)
- 支持下载笔记中的视频
- 不需要登录即可下载

### Twitter/X

**支持的 URL 格式**:
```
https://twitter.com/username/status/1234567890
https://x.com/username/status/1234567890
```

**注意事项**:
- 需要配置 API token 获取高清视频
- 支持下载视频推文

## 技术实现

### URL 验证器

**文件**: `src/lib/urlValidator.ts`

```typescript
// 检查 URL 是否来自支持的平台
isValidVideoUrl(url: string): boolean

// 检测平台名称
detectPlatform(url: string): PlatformName | null

// 获取平台图标
getPlatformIcon(url: string): string

// 检查是否为播放列表 URL
isPlaylistUrl(url: string): boolean
```

### URL 正则表达式

```typescript
const SUPPORTED_PLATFORMS = [
  {
    name: 'YouTube',
    pattern: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/,
    icon: '📺'
  },
  {
    name: 'Bilibili',
    pattern: /^(https?:\/\/)?(www\.)?(bilibili\.com|b23\.tv)\/.+/,
    icon: '📺'
  },
  {
    name: 'Xiaohongshu',
    pattern: /^(https?:\/\/)?(www\.)?(xiaohongshu\.com|xhslink\.com)\/.+/,
    icon: '📕'
  },
  // ... 更多平台
];
```

## 使用方式

### 1. 单视频下载

1. 粘贴任意支持平台的视频 URL
2. 应用自动检测平台
3. 选择格式（如果是 YouTube/Bilibili）
4. 开始下载

### 2. 播放列表下载

**YouTube 播放列表**:
```
https://www.youtube.com/playlist?list=PLxxxxxx
```

**Bilibili 播放列表**:
```
https://www.bilibili.com/medialist/play/xxxxxx
https://space.bilibili.com/xxxxxx/video
```

**Vimeo Showcase**:
```
https://vimeo.com/showcase/xxxxxx
```

### 3. 批量下载

在批量下载模式中，支持混合不同平台的 URL:

```
https://youtube.com/watch?v=xxx
https://bilibili.com/video/BVxxx
https://xhslink.com/xxx
```

## 平台特定功能

### 字幕下载

| 平台 | 自动字幕 | 上传字幕 | 弹幕 |
|------|----------|----------|------|
| YouTube | ✅ | ✅ | ❌ |
| Bilibili | ✅ | ✅ | ✅ |
| 小红书 | ❌ | ❌ | ❌ |
| Vimeo | ❌ | ✅ | ❌ |

### 播放列表支持

| 平台 | 播放列表 | 频道视频 | 用户主页 | 列表详情 |
|------|----------|----------|----------|----------|
| YouTube | ✅ | ✅ | ✅ | 完整 (标题/时长/缩略图) |
| Bilibili | ✅ | ✅ | ✅ | 有限 (ID/URL 只) |
| 小红书 | ❌ | ❌ | ❌ | - |
| Vimeo | ✅ | ❌ | ❌ | 完整 |

**注意**: 某些平台（如 Bilibili）在播放列表模式下只提供视频 ID 和 URL。视频标题等信息会在实际下载时获取。

## 配置建议

### Bilibili 高清下载

如果需要下载 1080p 或更高清的视频，需要配置 cookie：

1. 在浏览器中登录 Bilibili
2. 导出 cookie
3. 在设置中配置 `cookies-from-browser` 选项

```json
{
  "yt_dlp_options": {
    "cookies_from_browser": "chrome"
  }
}
```

### Twitter/X API Token

对于 Twitter 视频，可能需要配置 API token：

```json
{
  "yt_dlp_options": {
    "twitter_api_key": "your_key"
  }
}
```

## 测试要点

1. **不同平台的单视频**
   - 测试每个平台的视频解析
   - 验证缩略图获取
   - 检查时长信息

2. **播放列表/频道**
   - YouTube 播放列表
   - Bilibili 用户视频
   - 大播放列表 (100+ 视频)

3. **特殊内容**
   - 地区限制视频
   - 需要登录的视频
   - 直播回放
   - 短视频 (Shorts/Reels)

4. **混合下载**
   - 批量模式下混合 URL
   - 不同平台的并发下载

## 故障排除

### Bilibili 下载失败

**问题**: 只能下载 480p 或下载失败
**解决**: 
- 配置浏览器 cookie
- 使用 `--cookies-from-browser chrome`

### 小红书下载失败

**问题**: 链接无效或下载失败
**解决**:
- 确保使用完整的分享链接
- 检查链接是否过期

### 其他平台

**问题**: URL 无法识别
**解决**:
- 确认 URL 格式正确
- 检查 yt-dlp 是否支持该平台
- 更新 yt-dlp 到最新版本: `yt-dlp -U`

## 参考链接

- [yt-dlp Supported Sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)
- [Bilibili 视频格式](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py)
