# vYtDL / yt-dlp 可支持的视频平台

> **日期**: 2026-08-04  
> **依据**: `vYtDL-desktop` URL 白名单 + 本机 yt-dlp `2026.03.17`（`--list-extractors` ≈ **1872** 个提取器）  
> **完整官方列表**: [yt-dlp supportedsites.md](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

---

## 1. 能力分层说明

| 层级 | 含义 | 范围 |
|------|------|------|
| **A. Desktop UI 白名单** | 下载表单 `isValidVideoUrl` 会放行的域名 | 约 11 个站点族（见 §2） |
| **B. CLI / 引擎实际能力** | `vYtDL` CLI 与桌面后端直接调 yt-dlp，**无域名白名单** | ≈ 1800+ 站点 |
| **C. 产品主路径** | Analyze / VTT / 部分预览逻辑偏 YouTube | YouTube 最完整 |

结论：

- **CLI 已经支持多平台**（只要 yt-dlp 能解析该 URL）。Cookie / 代理 / extractor-args 等标志已具备。
- **Desktop 表单**只主动认可少数域名；未在白名单内的 URL 会被拦住，即使引擎能下。

### CLI 快速验证与独立构建

```bash
cd vYtDL
go build -o vYtDL .
# 或交叉编译：
./scripts/build.sh
./vYtDL download --no-tui "https://www.bilibili.com/video/BVxxxxxx"
./vYtDL download --no-tui --cookies-from-browser chrome "https://www.tiktok.com/@user/video/123"
```

| 问题 | 答案 |
|------|------|
| CLI 是否单独成项目？ | **是** — 独立仓库 `https://github.com/qdriven/innate-vytdl`（Go module `github.com/innate/yt-dl`） |
| 是否单独 git 仓库？ | **是**（已 `git init`，skill：`.agents/skills/vytdl-cli`） |
| 能否直接 build？ | **能**：`cd …/vYtDL && go build -o vYtDL .`；Go 1.24+ |
| yt-dlp 是否打进包？ | **支持**：PATH → `-tags embed_ytdlp` 内嵌 → 缓存自动下载（`--install-yt-dlp`） |
| monorepo 内 `vYtDL-standalone/`？ | 工作副本；见 `vYtDL-standalone/MOVED.md` / `vYtDL-standalone/README.md` |

---

## 2. 当前 UI 已放行（可直接粘贴下载）

来源：`apps/vytdl-desktop/src/components/download-form.tsx`

| 平台 | 匹配域名 |
|------|----------|
| YouTube | `youtube.com`, `youtu.be` |
| Bilibili | `bilibili.com`, `b23.tv` |
| 小红书 | `xiaohongshu.com`, `xhslink.com` |
| Vimeo | `vimeo.com` |
| X / Twitter | `twitter.com`, `x.com` |
| TikTok | `tiktok.com` |
| Dailymotion | `dailymotion.com`, `dai.ly` |
| Twitch | `twitch.tv` |
| Facebook | `facebook.com`, `fb.watch` |
| Instagram | `instagram.com` |
| Niconico | `nicovideo.jp` |

---

## 3. yt-dlp 可支持、建议 UI 后续放开（高价值）

以下提取器本机已存在，但当前表单白名单**未包含**（或仅部分覆盖）。补 Cookie / 代理后成功率更高。

### 3.1 中文区

| 平台 | yt-dlp 提取器示例 | 备注 |
|------|-------------------|------|
| 抖音 | `Douyin` | 常需 Cookie / 代理 |
| 西瓜视频 | `Ixigua` | |
| 微博视频 | `Weibo`, `WeiboVideo` | |
| 知乎 | `Zhihu` | |
| 优酷 | `youku` | |
| 爱奇艺 | `iqiyi` | 会员/DRM 内容受限 |
| AcFun | `AcFunVideo` 等 | |
| B 站扩展形态 | Bangumi / 课堂 / 收藏夹 / 直播等 | UI 已认 bilibili 域名，子类型由 yt-dlp 处理 |

### 3.2 国际主流

| 平台 | yt-dlp 提取器示例 | 备注 |
|------|-------------------|------|
| Reddit | `Reddit` | |
| SoundCloud | `soundcloud` | 音频为主 |
| Rumble | `Rumble` | |
| Odysee | （generic / odysee 系） | |
| PeerTube | `PeerTube` | 联邦实例 |
| Bandcamp | `Bandcamp` | |
| Streamable | `Streamable` | |
| Kick | （若版本含 Kick 提取器） | 随 yt-dlp 版本变化 |
| Loom | `loom` | |
| BitChute | `BitChute` | |
| LinkedIn | `LinkedIn` | 常需登录 Cookie |
| TED | （TED 系） | |
| BBC / NHK | `bbc`, `NhkVod` 等 | 地区限制常见 |

### 3.3 网盘 / 直链类

| 平台 | yt-dlp 提取器示例 | 备注 |
|------|-------------------|------|
| Google Drive | `GoogleDrive` | |
| Dropbox | `Dropbox` | |
| Internet Archive | `archive.org` | |

### 3.4 课程 / 流媒体（能力有限）

| 平台 | 说明 |
|------|------|
| Udemy / Coursera 等 | 提取器存在，通常必须登录 Cookie；条款与 DRM 需自担 |
| Netflix / Disney / HBO / Crunchyroll 等 | 多为 DRM，**实际不可用或极不稳定**，不建议作为产品卖点 |

---

## 4. 与 yt-dlp-gui-v2 的平台差异

| 点 | yt-dlp-gui-v2 | 当前 vYtDL |
|----|---------------|------------|
| URL 限制 | 基本不拦域名，交给 yt-dlp | 前端白名单拦一层 |
| Cookie 按站点 | Cookie Manager / 登录救援，可按域名匹配 | 无 Cookie UI → 多站登录内容易失败 |
| 产品重心 | 通用 yt-dlp 前端 | YouTube 下载 + Analyze/AI 更强 |

**用户感知最大的平台差距**：不是「yt-dlp 少支持了哪些站」，而是 **vYtDL 缺 Cookie + UI 白名单过窄**，导致 B 站大会员、小红书、抖音、Twitter/X、Instagram 等「能认域名但经常下不下来」。

---

## 5. 建议：可支持清单（产品表述用）

对外可写：

> 基于 yt-dlp，可下载 **1800+** 站点内容。桌面端当前快捷支持：YouTube、Bilibili、小红书、TikTok、X/Twitter、Instagram、Facebook、Twitch、Vimeo、Dailymotion、Niconico。更多站点可随白名单扩展；登录/会员内容需配置 Cookie。

对内实现顺序建议：

1. **放宽或去掉域名白名单**（或改为「未知站点警告但仍允许提交」）  
2. **P0 Cookie**（否则多站成功率上不去）  
3. 白名单优先补：**抖音、西瓜、微博、Reddit、SoundCloud、Google Drive**

---

## 6. 验证命令

```bash
yt-dlp --version
yt-dlp --list-extractors | wc -l
yt-dlp --list-extractors | rg -i 'BiliBili|Douyin|XiaoHongShu|TikTok|twitter|Instagram'
# 对具体 URL 试解析（不下载体）：
yt-dlp -F "https://example.com/video/..."
```
