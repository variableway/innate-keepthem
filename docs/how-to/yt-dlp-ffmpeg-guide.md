# yt-dlp 与 FFmpeg 功能速查手册

> 本文档总结了视频下载与处理中最常用的 15 个功能，覆盖 yt-dlp（下载）和 FFmpeg（处理）两大工具。

---

## 工具定位

| 工具 | 定位 | 典型场景 |
|------|------|----------|
| **yt-dlp** | 视频下载器 | 从 YouTube、Bilibili 等 1000+ 站点下载视频、音频、播放列表 |
| **FFmpeg** | 音视频处理器 | 格式转换、剪辑、合并、添加字幕/水印、调整画质等 |

两者配合使用，可实现"下载 → 处理 → 输出"的完整工作流。

---

## 一、yt-dlp 常用功能（7 项）

### 1. 下载单视频

```bash
yt-dlp "https://www.youtube.com/watch?v=VIDEO_ID"
```

默认下载最高画质，自动合并视频+音频。

### 2. 下载播放列表 / 频道

```bash
# 整个播放列表
yt-dlp "https://www.youtube.com/playlist?list=PLAYLIST_ID"

# 频道全部视频
yt-dlp "https://www.youtube.com/@CHANNEL/videos"

# 只下载前 10 个
yt-dlp --playlist-items 1-10 "PLAYLIST_URL"
```

### 3. 选择画质和格式

```bash
# 指定最高 1080p
yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" URL

# 只下载 720p MP4
yt-dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]" URL

# 列出所有可用格式
yt-dlp -F URL
```

### 4. 只提取音频（MP3/M4A）

```bash
# MP3
yt-dlp -x --audio-format mp3 --audio-quality 0 URL

# M4A（AAC，不重新编码，更快）
yt-dlp -x --audio-format m4a --audio-quality 0 URL

# 只提取，不下载视频
yt-dlp -x URL
```

### 5. 下载字幕

```bash
# 下载手动字幕（中文+英文）
yt-dlp --write-subs --sub-langs zh-CN,en URL

# 下载自动生成的字幕
yt-dlp --write-auto-subs --sub-langs zh-CN,en URL

# 嵌入字幕到视频（软字幕）
yt-dlp --write-subs --embed-subs --sub-langs zh-CN URL
```

### 6. 下载指定时间片段

```bash
# 下载 1:30 到 3:00 的片段
yt-dlp --download-sections "*1:30-3:00" --force-keyframes-at-cuts URL

# 只下载前 60 秒
yt-dlp --download-sections "*0-60" URL
```

### 7. 使用 Cookies 下载限制内容

```bash
# 从浏览器获取 cookies
yt-dlp --cookies-from-browser chrome URL
ytt-dlp --cookies-from-browser safari URL

# 使用导出的 cookies 文件
yt-dlp --cookies cookies.txt URL
```

适用于：会员视频、年龄限制、区域限制内容。

---

## 二、FFmpeg 常用功能（8 项）

### 8. 视频格式转换

```bash
# MP4 → MKV
ffmpeg -i input.mp4 -c copy output.mkv

# 任何格式 → MP4（重新编码，兼容性最好）
ffmpeg -i input.avi -c:v libx264 -c:a aac output.mp4

# 压缩视频（降低码率）
ffmpeg -i input.mp4 -crf 23 -preset fast output_compressed.mp4
```

### 9. 提取音频（从视频）

```bash
# 提取为 MP3
ffmpeg -i input.mp4 -vn -c:a libmp3lame -q:a 2 output.mp3

# 提取为 M4A（AAC，直接复制音频流，无损且快）
ffmpeg -i input.mp4 -vn -c:a copy output.m4a

# 提取为 FLAC（无损）
ffmpeg -i input.mp4 -vn -c:a flac output.flac
```

### 10. 剪辑视频 / 音频（指定时间范围）

```bash
# 从 1:30 切到 3:00
ffmpeg -ss 00:01:30 -to 00:03:00 -i input.mp4 -c copy output.mp4

# 从 90 秒开始，切 60 秒
ffmpeg -ss 90 -t 60 -i input.mp4 -c copy output.mp4

# 音频同理
ffmpeg -ss 00:01:30 -to 00:03:00 -i input.mp3 -c copy output.mp3
```

> `-c copy` 表示直接复制流，**不重新编码** → 速度快 + 画质无损。

### 11. 合并视频 + 音频

```bash
# 分开的视频和音频文件合并
ffmpeg -i video.mp4 -i audio.m4a -c copy output.mp4

# 替换视频中的音频轨道
ffmpeg -i video.mp4 -i new_audio.mp3 -c:v copy -map 0:v:0 -map 1:a:0 -shortest output.mp4
```

### 12. 添加字幕（烧录/软嵌入）

```bash
# 硬字幕（烧录到画面上，无法关闭）
ffmpeg -i input.mp4 -vf "subtitles=subtitle.srt" -c:a copy output.mp4

# 硬字幕（ASS 格式，保留样式）
ffmpeg -i input.mp4 -vf "ass=subtitle.ass" -c:a copy output.mp4

# 软字幕（嵌入轨道，播放器可开关）
ffmpeg -i input.mp4 -i subtitle.srt -c copy -c:s mov_text output.mp4
```

### 13. 添加水印

```bash
# 左上角添加图片水印
ffmpeg -i input.mp4 -i watermark.png -filter_complex "overlay=10:10" -c:a copy output.mp4

# 右下角添加文字水印
ffmpeg -i input.mp4 -vf "drawtext=text='vYtDL':x=w-tw-10:y=10:fontsize=24:fontcolor=white@0.7" -c:a copy output.mp4

# 水印贯穿全程（循环）
ffmpeg -i input.mp4 -i watermark.png -filter_complex "overlay=10:10:enable='between(t,0,999999)'" -c:a copy output.mp4
```

### 14. 添加背景音乐

```bash
# 视频 + 背景音乐（降低原视频音量，混入背景音乐）
ffmpeg -i input.mp4 -i bgm.mp3 -filter_complex \
  "[0:a]volume=0.3[a1];[a1][1:a]amix=inputs=2:duration=first[aout]" \
  -map 0:v -map "[aout]" -c:v copy output.mp4

# 替换原音频为纯背景音乐
ffmpeg -i input.mp4 -i bgm.mp3 -c:v copy -map 0:v -map 1:a -shortest output.mp4
```

### 15. 拼接多个视频

```bash
# 方法1：使用 concat 协议（同编码格式，最快）
echo "file 'part1.mp4'" > list.txt
echo "file 'part2.mp4'" >> list.txt
echo "file 'part3.mp4'" >> list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4

# 方法2：复杂滤镜（不同格式/分辨率）
ffmpeg -i part1.mp4 -i part2.mp4 -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" output.mp4
```

---

## 三、yt-dlp + FFmpeg 组合工作流

### 工作流 1：下载 → 提取音频 → 剪辑

```bash
# 1. 下载视频
yt-dlp -o "video.%(ext)s" "URL"

# 2. 提取音频
ffmpeg -i video.mp4 -vn -c:a libmp3lame -q:a 2 full.mp3

# 3. 剪辑音频（保留 1:00-2:30）
ffmpeg -ss 60 -t 90 -i full.mp3 -c copy clip.mp3
```

### 工作流 2：下载 → 添加字幕 → 压缩

```bash
# 1. 下载视频+字幕
yt-dlp --write-subs --sub-langs zh-CN -o "video.%(ext)s" "URL"

# 2. 烧录字幕
ffmpeg -i video.mp4 -vf "subtitles=video.zh-CN.srt" -c:a copy -crf 23 final.mp4
```

### 工作流 3：下载播放列表 → 提取全部音频 → 合并

```bash
# 1. 下载播放列表（只保留音频）
yt-dlp -x --audio-format mp3 -o "%(playlist_index)s-%(title)s.%(ext)s" "PLAYLIST_URL"

# 2. 生成合并列表
ls -1 *.mp3 | sed "s/^/file '/;s/$/'/" > audio_list.txt

# 3. 合并为一个文件
ffmpeg -f concat -safe 0 -i audio_list.txt -c copy combined.mp3
```

---

## 四、常用参数速查表

### yt-dlp 常用参数

| 参数 | 说明 |
|------|------|
| `-x` | 只提取音频 |
| `-f` | 选择格式 |
| `-F` | 列出可用格式 |
| `-o` | 输出文件名模板 |
| `--write-subs` | 下载字幕 |
| `--write-auto-subs` | 下载自动生成字幕 |
| `--embed-subs` | 嵌入字幕到视频 |
| `--playlist-items` | 下载指定条目 |
| `--download-sections` | 下载时间片段 |
| `--cookies-from-browser` | 使用浏览器 cookies |
| `--proxy` | 使用代理 |

### FFmpeg 常用参数

| 参数 | 说明 |
|------|------|
| `-i` | 输入文件 |
| `-ss` | 开始时间 |
| `-to` | 结束时间 |
| `-t` | 持续时长 |
| `-c copy` | 直接复制（不重新编码） |
| `-c:v libx264` | H.264 视频编码 |
| `-c:a aac` | AAC 音频编码 |
| `-crf 23` | 质量因子（0=无损, 51=最差, 默认23） |
| `-preset fast` | 编码速度预设 |
| `-vf` | 视频滤镜 |
| `-af` | 音频滤镜 |
| `-map` | 选择流 |
| `-shortest` | 以最短输入为准结束 |

---

## 五、安装指南

```bash
# macOS
brew install yt-dlp ffmpeg

# Ubuntu/Debian
sudo apt update
sudo apt install yt-dlp ffmpeg

# Windows (winget)
winget install yt-dlp.yt-dlp Gyan.FFmpeg
```

---

## 参考资源

- [yt-dlp 官方文档](https://github.com/yt-dlp/yt-dlp#usage-and-options)
- [yt-dlp 支持的站点列表](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)
- [FFmpeg 官方文档](https://ffmpeg.org/documentation.html)
- [FFmpeg 滤镜文档](https://ffmpeg.org/ffmpeg-filters.html)
