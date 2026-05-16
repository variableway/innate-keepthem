# Case 1: 单视频 + 字幕下载

## 概述

使用 vYtDL CLI 下载单个 YouTube 视频及其字幕（对白）。

- **视频**：https://www.youtube.com/watch?v=9A98hWZs5yU
- **标题**：AI的正确打开方式：不学概念，学动作
- **时长**：约 5 分钟
- **文件大小**：~370 MB (mp4)
- **字幕**：中文 VTT (34 KB)

---

## 前置条件

| 依赖 | 版本 | 安装方式 |
|------|------|----------|
| Go | 1.24+ | `brew install go` |
| yt-dlp | 2026.03.17+ | `brew install yt-dlp` 或 `pipx install yt-dlp` |

确认 yt-dlp 可用：

```bash
which yt-dlp && yt-dlp --version
# /Users/patrick/.local/bin/yt-dlp
# 2026.03.17
```

---

## 步骤

### 1. 构建 CLI 二进制

```bash
cd vYtDL

# 如果模块缓存有权限问题，使用临时缓存目录：
GOMODCACHE=/tmp/gomodcache GOCACHE=/tmp/gobuildcache \
  go build -o vYtDL .

# 验证构建成功
ls -lh vYtDL
# -rwxr-xr-x  5.6M  vYtDL
```

### 2. 配置 yt-dlp 路径

编辑 `vYtDL/config.json`，指向 yt-dlp 的实际位置：

```json
{
  "yt_dlp_bin": "/Users/patrick/.local/bin/yt-dlp"
}
```

常见路径：
- macOS Homebrew: `/opt/homebrew/bin/yt-dlp`
- macOS pipx: `~/.local/bin/yt-dlp`
- Linux: `/usr/bin/yt-dlp`

（也可以在命令行用 `--yt-dlp-bin` 覆盖。）

### 3. 执行下载

```bash
cd vYtDL

./vYtDL download --no-tui \
  --output ./downloads_case \
  "https://www.youtube.com/watch?v=9A98hWZs5yU"
```

**参数说明**：

| 参数 | 含义 |
|------|------|
| `download` | 下载命令 |
| `--no-tui` | 不使用交互式界面，输出纯文本进度 |
| `--output ./downloads_case` | 指定输出目录 |
| URL | 目标视频地址 |

**默认行为**（无需显式指定）：
- 格式：`mp4`
- 质量：最佳可用
- 字幕：英文 + 中文（手动字幕优先，失败则尝试自动生成字幕）
- 记录格式：JSON

### 4. 等待完成

下载过程中会显示实时进度：

```
[starting] https://www.youtube.com/watch?v=9A98hWZs5yU
[merging] AI的正确打开方式：不学概念，学动作
[0.0%] AI的正确打开方式：不学概念，学动作  14.90KiB/s  ETA 06:30:23
  ...
[100.0%] AI的正确打开方式：不学概念，学动作  24.15MiB/s  ETA 00:00
[done] AI的正确打开方式：不学概念，学动作

Download log   : downloads_case/download_record.json
Subtitle map   : downloads_case/subtitle_mapping.json

Completed: 1 succeeded, 0 failed.
```

本次下载耗时约 **5 分钟**。

---

## 输出结果

### 文件结构

```
vYtDL/downloads_case/
├── download_record.json          # 下载记录
├── subtitle_mapping.json         # 字幕-视频映射
└── downloads_case/
    ├── AI的正确打开方式：不学概念，学动作.mp4     # 视频 (370 MB)
    └── AI的正确打开方式：不学概念，学动作.zh.vtt  # 中文字幕 (34 KB)
```

### download_record.json

```json
[
  {
    "video_id": "9A98hWZs5yU",
    "title": "AI的正确打开方式：不学概念，学动作",
    "url": "https://www.youtube.com/watch?v=9A98hWZs5yU",
    "output_dir": "./downloads_case",
    "filename": "downloads_case/AI的正确打开方式：不学概念，学动作.mp4",
    "success": true,
    "error": "",
    "started_at": "2026-05-16T11:20:16+08:00",
    "finished_at": "2026-05-16T11:25:16+08:00",
    "duration": "5m0s"
  }
]
```

### subtitle_mapping.json

```json
[
  {
    "video_id": "9A98hWZs5yU",
    "title": "AI的正确打开方式：不学概念，学动作",
    "video_file": "downloads_case/AI的正确打开方式：不学概念，学动作.mp4",
    "subtitles": ["downloads_case/AI的正确打开方式：不学概念，学动作.zh.vtt"]
  }
]
```

### 字幕内容预览

```
WEBVTT
Kind: captions
Language: zh

00:00:25.333 --> 00:00:26.800
最近我一直在想一个问题

00:00:26.933 --> 00:00:29.800
为什么很多人学 AI 越学越焦虑
...
```

---

## 其他常用参数

| 参数 | 示例 | 说明 |
|------|------|------|
| `--quality 1080` | 限制画质 | 下载最高 1080p |
| `--format webm` | 修改格式 | 输出 webm 容器 |
| `--sub-langs en,ja` | 自定义字幕语言 | 下载英文和日文字幕 |
| `--no-subs` | 禁用字幕 | 不下载任何字幕 |
| `--no-auto-subs` | 禁用自动字幕 | 只下载手动字幕 |
| `--start 00:01:00 --end 00:02:30` | 时间裁剪 | 只下载指定片段 |
| `--cookies-from-browser chrome` | 浏览器 Cookies | 绕过年龄限制/登录墙 |
| `--proxy socks5://127.0.0.1:1080` | 代理 | 通过代理访问 |
| `--log-format csv` | CSV 格式 | 记录文件用 CSV |

---

## 排错指南

### 1. yt-dlp 未找到

```
Error: yt-dlp binary not found
```

**解决**：安装 yt-dlp 或修改 `config.json` 指向正确路径。

### 2. 视频被封锁/需要登录

yt-dlp 报错 `HTTP Error 403` 或 `Sign in to confirm you're not a bot`。

**解决**：使用浏览器 Cookies。

```bash
./vYtDL download --no-tui \
  --cookies-from-browser chrome \
  --output ./downloads_case \
  "URL"
```

### 3. 字幕未下载

可能原因：
- 视频没有该语言的**手动**字幕，且 `--no-auto-subs` 开启了
- 视频没有任何字幕

**解决**：确保不传 `--no-auto-subs`（默认是允许自动生成字幕的），或尝试其他语言。

### 4. Go 构建缓存权限错误

```
operation not permitted
```

**解决**：使用临时缓存目录。

```bash
GOMODCACHE=/tmp/gomodcache GOCACHE=/tmp/gobuildcache go build -o vYtDL .
```

---

## 相关文档

- [vYtDL USAGE.md](../../vYtDL/USAGE.md) — CLI 完整使用指南
- [vYtDL help.md](../../vYtDL/help.md) — yt-dlp 底层参数参考
- [docs/how-to/README.md](../how-to/README.md) — 项目搭建教程
- [docs/how-to/yt-dlp-ffmpeg-guide.md](../how-to/yt-dlp-ffmpeg-guide.md) — yt-dlp 与 FFmpeg 配置
