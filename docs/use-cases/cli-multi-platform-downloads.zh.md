# vYtDL CLI 多平台下载用例

> 适用对象：`vYtDL-standalone/` 中的 Go CLI（`vYtDL download`，别名 `dl` / `get`）。
> CLI **不设域名白名单**——任何 [yt-dlp](https://github.com/yt-dlp/yt-dlp) 支持的站点都能下载（这一点与桌面 / Web 前端的表单白名单不同）。本文聚焦四个主要平台的实际用例：**YouTube、X（Twitter）、Bilibili、小红书**。
>
> 英文版：[cli-multi-platform-downloads.en.md](./cli-multi-platform-downloads.en.md)

## 1. 准备

```bash
# 克隆并构建（monorepo 内已有 checkout 则跳过 clone）
git clone https://github.com/qdriven/innate-vytdl.git vYtDL-standalone
cd vYtDL-standalone && GOWORK=off go build -o vYtDL .
# 或在 monorepo 根目录：task cli:build

# 可选：把最新的 yt-dlp 缓存到本地
./vYtDL download --install-yt-dlp
```

yt-dlp 二进制的解析顺序（`internal/ytdlpbin`）：

1. `--yt-dlp-bin` 参数 / `config.json` 的 `yt_dlp_bin` / 环境变量 `YT_DL_BIN`
2. `PATH` 中的 `yt-dlp` / `youtube-dl`
3. 内嵌二进制（`-tags embed_ytdlp` 构建）
4. 本地缓存（macOS `~/Library/Caches/vYtDL`，其他 `~/.cache/vYtDL`）
5. GitHub Releases 自动下载（可用 `VYTDL_YTDLP_MIRROR` 加速）

## 2. 通用用法

```bash
vYtDL download [flags] <url> [url…]
```

默认行为：

| 默认项 | 值 |
|--------|-----|
| 容器格式 | `-f mp4` |
| 字幕 | 英文 + 中文，含自动字幕（`--no-subs` 关闭） |
| JS 运行时（YouTube） | `--js-runtimes node` |
| 并发 | `-j 1`（顺序） |
| 进度 | TUI（脚本 / cron 场景加 `--no-tui`） |
| 记录 | `download_record.json` + `subtitle_mapping.json` |

常用参数：

| 参数 | 作用 |
|------|------|
| `-q 1080` | 画质上限（映射为 `bestvideo[height<=1080]+bestaudio/best[height<=1080]`） |
| `-f mp4/webm/mkv` | 合并容器（`--merge-output-format`） |
| `-o ./dir` | 输出目录，文件名为 `%(title)s.%(ext)s` |
| `--playlist` / `-p` | 播放列表模式：按标题建子目录 + 断点续传 |
| `-j N` | 多 URL 并发 |
| `--start` / `--end` | 片段剪辑（需 FFmpeg） |
| `--sub-langs zh` | 字幕语言 |
| `--cookies-from-browser chrome` | 复用浏览器登录态 |
| `--cookies cookies.txt` | Netscape 格式 cookie 文件 |
| `--proxy` / `--user-agent` / `--retries` / `--socket-timeout` / `--force-ipv4` | 透传给 yt-dlp |

---

## 3. YouTube

### URL 形态

| 类型 | 示例 |
|------|------|
| 普通视频 | `https://www.youtube.com/watch?v=VIDEO_ID` |
| 短链 | `https://youtu.be/VIDEO_ID` |
| Shorts | `https://www.youtube.com/shorts/VIDEO_ID` |
| 播放列表 | `https://www.youtube.com/playlist?list=PLxxxx` |

被 shell 转义的 URL（如 `watch\?v\=ID`）会自动归一化，无需手动处理。

### 用例 A：单视频 + 字幕

```bash
./vYtDL download --no-tui -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

默认下载英文字幕 + 中文字幕（含自动字幕）。只要中文字幕：加 `--sub-langs zh`；不要字幕：加 `--no-subs`。

### 用例 B：剪辑片段

```bash
# 截取 00:01:00 - 00:02:30（需要 FFmpeg）
./vYtDL download --no-tui -o ./downloads \
  --start 00:01:00 --end 00:02:30 \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

### 用例 C：播放列表 + 断点续传

```bash
./vYtDL download --no-tui --playlist -o ./downloads -q 720 \
  --cookies-from-browser chrome \
  "https://www.youtube.com/playlist?list=PLxxxx"
```

流程：抓取列表元数据 → 创建 `./downloads/<列表标题>/` → 逐条下载，状态写入 `.playlist_state.json`。中断后**重跑同一条命令**即续传（已成功条目跳过）；`--reset-playlist-state` 可清空状态重来。

### 用例 D：多个 URL 并发

```bash
./vYtDL download --no-tui -j 2 -o ./downloads \
  --cookies-from-browser chrome \
  "https://www.youtube.com/watch?v=ID1" \
  "https://www.youtube.com/watch?v=ID2"
```

并发越高越容易触发风控，建议 `-j 1` ~ `-j 3`。

### 平台说明：风控与 n challenge

YouTube 的 `n` 参数挑战需要 JS 运行时，CLI 已默认 `--js-runtimes node`。常见报错的处理：

| 症状 | 处理 |
|------|------|
| `No supported JavaScript runtime` | 安装 Node.js，或 `brew install deno` 后加 `--js-runtimes deno` |
| `HTTP Error 403` | 升级 yt-dlp（`--install-yt-dlp`）+ `--cookies-from-browser` |
| `Sign in to confirm you're not a bot` | 用已登录浏览器导出 cookie |
| SSL / 代理报错 | 检查 `--proxy`，或加 `--force-ipv4` |

顽固场景可叠加 extractor-args：

```bash
./vYtDL download --no-tui -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  --extractor-args "youtube:player_client=web,android" \
  --force-ipv4 \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

---

## 4. X / Twitter

### URL 形态

| 类型 | 示例 |
|------|------|
| 标准域名 | `https://x.com/user/status/123`、`https://twitter.com/user/status/123` |
| 镜像域名 | `vxtwitter.com`、`fxtwitter.com`、`nitter.net`（同样被识别） |

### 用例 A：公开推文视频（零额外参数）

```bash
./vYtDL download --no-tui -o ./downloads \
  "https://x.com/user/status/123"
```

CLI 检测到 Twitter/X URL（含上述镜像域名及 `*.twitter.com`）时，会自动附加 `--extractor-args twitter:api=syndication`——因为匿名 GraphQL API 频繁被 Cloudflare / TLS EOF 拦截，而 syndication embed API 仍可获取公开视频。**用户无需任何操作。**

### 用例 B：私密 / 登录可见推文

```bash
# cookies 走 GraphQL；显式指定 twitter:api=graphql 会停用 syndication 降级
./vYtDL download --no-tui -o ./downloads \
  --cookies-from-browser chrome \
  --extractor-args "twitter:api=graphql" \
  "https://x.com/user/status/123"
```

规则：只要 `--extractor-args` 中出现 `twitter:api=`，CLI 就不再自动追加 syndication，用户参数优先。

---

## 5. Bilibili（哔哩哔哩）

### URL 形态

| 类型 | 示例 |
|------|------|
| BV 号（单 P / 多 P） | `https://www.bilibili.com/video/BVxxxxxx` |
| av 号 | `https://www.bilibili.com/video/av123456` |
| 短链 | `https://b23.tv/xxxxx` |
| 番剧 / 课程 | `https://www.bilibili.com/bangumi/play/ss…`、`ep…` |

### 用例 A：单视频（单 P）

```bash
./vYtDL download --no-tui -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  "https://www.bilibili.com/video/BV1xx411c7mD"
```

不加 `--playlist` 时传给 yt-dlp 的是 `--no-playlist`，多 P 视频只下载默认 / 当前 P。

### 用例 B：多 P / 番剧全季

```bash
# 一个 BV 下的全部分 P
./vYtDL download --no-tui --playlist -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  "https://www.bilibili.com/video/BVxxxxxx"

# 番剧整季
./vYtDL download --no-tui --playlist -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  "https://www.bilibili.com/bangumi/play/ss12345"
```

续传机制与 YouTube 播放列表一致（`.playlist_state.json`）。

### 用例 C：高画质 / 大会员 / 地区限制

| 需求 | 做法 |
|------|------|
| 高清晰度 / 大会员内容 | `--cookies-from-browser chrome`（需 bilibili.com 已登录） |
| Netscape cookie 文件 | `--cookies ./cookies.txt` |
| 地区限制 | `--proxy "http://127.0.0.1:7890"` |

```bash
./vYtDL download --no-tui --playlist -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  --proxy "socks5://127.0.0.1:7890" \
  "https://www.bilibili.com/video/BVxxxxxx"
```

### 平台说明

- `-q 1080` 仍映射为高度过滤，实际最高画质取决于登录态 / 大会员。
- 官方 / CC 字幕可用性因视频而异，自动字幕远少于 YouTube；默认请求 `en,zh` 无害。
- 中文标题直接可用，播放列表目录名会做文件系统安全化处理。

---

## 6. 小红书（Xiaohongshu / RedNote）

### URL 形态

| 类型 | 示例 |
|------|------|
| 笔记页 | `https://www.xiaohongshu.com/explore/xxxxxx` |
| 短链 | `https://xhslink.com/xxxxx` |

yt-dlp 提取器名：`XiaoHongShu`（可用 `yt-dlp --list-extractors | grep -i xiao` 验证）。

### 用例 A：下载笔记视频

```bash
./vYtDL download --no-tui -o ./downloads \
  --cookies-from-browser chrome \
  "https://www.xiaohongshu.com/explore/xxxxxx"
```

### 平台说明

- 小红书对匿名访问限制较严，**通常需要 cookie**（浏览器登录后 `--cookies-from-browser`，或导出 Netscape 文件 `--cookies`）。
- `xhslink.com` 短链由 yt-dlp 自动跳转解析，无需先展开。
- 笔记一般无字幕，默认的 `--write-subs` 不产生副作用；介意时可加 `--no-subs`。
- 图文笔记（无视频）不属于下载器范畴，会报"无视频流"类错误，属预期行为。

---

## 7. 其他平台

CLI 无白名单，TikTok、Instagram、TikTok 镜像、Vimeo、Twitch、Facebook、Nicovideo 等所有 yt-dlp 支持站点用法相同：

```bash
./vYtDL download --no-tui -o ./downloads --cookies-from-browser chrome \
  "https://www.tiktok.com/@user/video/123"
```

- TikTok / Instagram 通常需要 cookie。
- 完整站点列表：`yt-dlp --list-extractors`。
- 与桌面 / Web 前端的差异：前端表单有 12 个域名的白名单（见 `apps/vytdl-desktop/src/components/download-form.tsx`），CLI 不受此限制。

## 8. 跨平台通用能力

| 能力 | 用法 |
|------|------|
| 播放列表续传 | `--playlist`；重跑同一命令续传，`--reset-playlist-state` 重来 |
| 并发下载 | `-j N`（worker pool + 信号量） |
| 下载记录 | `download_record.json` / `subtitle_mapping.json`；`--log-format csv`、`--record-file`、`--mapping-file` 可定制 |
| 字幕转文稿 | `./vYtDL analyze --mode text video.en.vtt`（处理 YouTube 自动字幕 VTT） |
| 脚本封装 | `scripts/download_video.sh`（单视频）、`scripts/download_collection.sh`（合集） |

## 9. 故障排查

| 问题 | 处理 |
|------|------|
| yt-dlp 缺失 | `--install-yt-dlp`、内嵌构建，或 `--yt-dlp-bin` 指定路径 |
| GitHub 下载慢 | `export VYTDL_YTDLP_MIRROR="https://ghproxy.net/https://github.com/yt-dlp/yt-dlp/releases/latest/download/"` |
| YouTube 403 / n challenge | Node/Deno + cookie + 升级 yt-dlp（见第 3 节） |
| X 匿名下载 TLS/Cloudflare 报错 | 已内置 syndication 降级；仍失败则加 cookie + `twitter:api=graphql` |
| B 站画质低 | 登录 cookie / 大会员 |
| 小红书无法解析 | 加 `--cookies-from-browser` |
| 播放列表续传错乱 | 保持 `-o` 与 URL 一致；或 `--reset-playlist-state` |

## 10. 参考

- CLI 完整参数与实现细节：[`vYtDL-standalone/USAGE.md`](../../vYtDL-standalone/USAGE.md)
- CLI 模块文档：[`docs/modules/vytdl-cli.md`](../modules/vytdl-cli.md)
- 平台检测代码：`vYtDL-standalone/internal/downloader/downloader.go`（`isTwitterURL` / `extractorArgFlags`）
- 参数定义：`vYtDL-standalone/cmd/download.go`
