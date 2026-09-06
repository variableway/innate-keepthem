# vYtDL CLI Multi-Platform Download Use Cases

> Applies to the Go CLI in `vYtDL-standalone/` (`vYtDL download`, aliases `dl` / `get`).
> The CLI has **no domain whitelist** — any site supported by [yt-dlp](https://github.com/yt-dlp/yt-dlp) can be downloaded (unlike the form whitelist in the desktop / web frontend). This guide focuses on four major platforms: **YouTube, X (Twitter), Bilibili, and Xiaohongshu (RedNote)**.
>
> 中文版：[cli-multi-platform-downloads.zh.md](./cli-multi-platform-downloads.zh.md)

## 1. Prerequisites

```bash
# Clone and build (skip the clone if the monorepo already has the checkout)
git clone https://github.com/qdriven/innate-vytdl.git vYtDL-standalone
cd vYtDL-standalone && GOWORK=off go build -o vYtDL .
# Or from the monorepo root: task cli:build

# Optional: cache a fresh yt-dlp locally
./vYtDL download --install-yt-dlp
```

yt-dlp binary resolution order (`internal/ytdlpbin`):

1. `--yt-dlp-bin` flag / `yt_dlp_bin` in `config.json` / env var `YT_DL_BIN`
2. `yt-dlp` / `youtube-dl` on `PATH`
3. Embedded binary (built with `-tags embed_ytdlp`)
4. Local cache (`~/Library/Caches/vYtDL` on macOS, `~/.cache/vYtDL` elsewhere)
5. Auto-download from GitHub Releases (speed up with `VYTDL_YTDLP_MIRROR`)

## 2. Universal Usage

```bash
vYtDL download [flags] <url> [url…]
```

Default behavior:

| Default | Value |
|---------|-------|
| Container | `-f mp4` |
| Subtitles | EN + ZH, including auto-subs (disable with `--no-subs`) |
| JS runtime (YouTube) | `--js-runtimes node` |
| Concurrency | `-j 1` (sequential) |
| Progress | TUI (add `--no-tui` in scripts / cron) |
| Records | `download_record.json` + `subtitle_mapping.json` |

Common flags:

| Flag | Purpose |
|------|---------|
| `-q 1080` | Quality ceiling (maps to `bestvideo[height<=1080]+bestaudio/best[height<=1080]`) |
| `-f mp4/webm/mkv` | Merge container (`--merge-output-format`) |
| `-o ./dir` | Output directory; files named `%(title)s.%(ext)s` |
| `--playlist` / `-p` | Playlist mode: titled subdirectory + resume |
| `-j N` | Concurrent downloads across URLs |
| `--start` / `--end` | Clip a time range (requires FFmpeg) |
| `--sub-langs zh` | Subtitle languages |
| `--cookies-from-browser chrome` | Reuse a logged-in browser profile |
| `--cookies cookies.txt` | Netscape-format cookies file |
| `--proxy` / `--user-agent` / `--retries` / `--socket-timeout` / `--force-ipv4` | Passed through to yt-dlp |

---

## 3. YouTube

### URL shapes

| Kind | Example |
|------|---------|
| Watch | `https://www.youtube.com/watch?v=VIDEO_ID` |
| Short URL | `https://youtu.be/VIDEO_ID` |
| Shorts | `https://www.youtube.com/shorts/VIDEO_ID` |
| Playlist | `https://www.youtube.com/playlist?list=PLxxxx` |

Shell-escaped URLs (e.g. `watch\?v\=ID`) are normalized automatically.

### Use case A: single video + subtitles

```bash
./vYtDL download --no-tui -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

EN + ZH subtitles (including auto-subs) are downloaded by default. Chinese only: add `--sub-langs zh`. None: add `--no-subs`.

### Use case B: clip a segment

```bash
# Cut 00:01:00 - 00:02:30 (requires FFmpeg)
./vYtDL download --no-tui -o ./downloads \
  --start 00:01:00 --end 00:02:30 \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

### Use case C: playlist with resume

```bash
./vYtDL download --no-tui --playlist -o ./downloads -q 720 \
  --cookies-from-browser chrome \
  "https://www.youtube.com/playlist?list=PLxxxx"
```

Flow: fetch playlist metadata → create `./downloads/<Playlist Title>/` → download entry-by-entry, persisting state to `.playlist_state.json`. If interrupted, **re-run the same command** to resume (succeeded items are skipped); `--reset-playlist-state` discards the state and starts over.

### Use case D: concurrent URLs

```bash
./vYtDL download --no-tui -j 2 -o ./downloads \
  --cookies-from-browser chrome \
  "https://www.youtube.com/watch?v=ID1" \
  "https://www.youtube.com/watch?v=ID2"
```

Higher concurrency raises bot-check risk; prefer `-j 1` to `-j 3`.

### Platform notes: anti-bot and the n challenge

YouTube's `n` parameter challenge requires a JS runtime; the CLI defaults to `--js-runtimes node`. Common errors:

| Symptom | Fix |
|---------|-----|
| `No supported JavaScript runtime` | Install Node.js, or `brew install deno` and pass `--js-runtimes deno` |
| `HTTP Error 403` | Update yt-dlp (`--install-yt-dlp`) + `--cookies-from-browser` |
| `Sign in to confirm you're not a bot` | Cookies from a logged-in browser profile |
| SSL / proxy errors | Check `--proxy`, or add `--force-ipv4` |

For stubborn cases, stack extractor-args:

```bash
./vYtDL download --no-tui -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  --extractor-args "youtube:player_client=web,android" \
  --force-ipv4 \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

---

## 4. X / Twitter

### URL shapes

| Kind | Example |
|------|---------|
| Standard domains | `https://x.com/user/status/123`, `https://twitter.com/user/status/123` |
| Mirror domains | `vxtwitter.com`, `fxtwitter.com`, `nitter.net` (also recognized) |

### Use case A: public tweet video (zero extra flags)

```bash
./vYtDL download --no-tui -o ./downloads \
  "https://x.com/user/status/123"
```

When the CLI detects a Twitter/X URL (including the mirror domains above and `*.twitter.com`), it automatically appends `--extractor-args twitter:api=syndication` — the guest GraphQL API is frequently blocked by Cloudflare / TLS EOF errors, while the syndication embed API still serves public videos. **No user action required.**

### Use case B: private / login-required tweets

```bash
# Cookies go through GraphQL; explicitly setting twitter:api=graphql disables the syndication fallback
./vYtDL download --no-tui -o ./downloads \
  --cookies-from-browser chrome \
  --extractor-args "twitter:api=graphql" \
  "https://x.com/user/status/123"
```

Rule: as soon as `twitter:api=` appears in `--extractor-args`, the CLI stops auto-adding syndication — user arguments take priority.

---

## 5. Bilibili

### URL shapes

| Kind | Example |
|------|---------|
| BV id (single / multi-part) | `https://www.bilibili.com/video/BVxxxxxx` |
| `av` id | `https://www.bilibili.com/video/av123456` |
| Short link | `https://b23.tv/xxxxx` |
| Bangumi / cheese | `https://www.bilibili.com/bangumi/play/ss…`, `ep…` |

### Use case A: single video (one part)

```bash
./vYtDL download --no-tui -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  "https://www.bilibili.com/video/BV1xx411c7mD"
```

Without `--playlist`, yt-dlp receives `--no-playlist`, so only the default / current part of a multi-part video is downloaded.

### Use case B: all parts / full season

```bash
# All parts under one BV
./vYtDL download --no-tui --playlist -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  "https://www.bilibili.com/video/BVxxxxxx"

# A whole bangumi season
./vYtDL download --no-tui --playlist -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  "https://www.bilibili.com/bangumi/play/ss12345"
```

Resume works the same as YouTube playlists (`.playlist_state.json`).

### Use case C: higher quality / VIP / region-locked

| Need | Approach |
|------|----------|
| Higher resolution / VIP content | `--cookies-from-browser chrome` (logged-in bilibili.com session) |
| Netscape cookies file | `--cookies ./cookies.txt` |
| Region-restricted content | `--proxy "http://127.0.0.1:7890"` |

```bash
./vYtDL download --no-tui --playlist -o ./downloads -q 1080 \
  --cookies-from-browser chrome \
  --proxy "socks5://127.0.0.1:7890" \
  "https://www.bilibili.com/video/BVxxxxxx"
```

### Platform notes

- `-q 1080` still maps to a height filter; the actual maximum depends on login state / VIP.
- Official / CC subtitle availability varies per video; auto-subs are far rarer than on YouTube. The default `en,zh` request is harmless.
- Chinese titles work as-is; playlist directory names are sanitized for filesystem safety.

---

## 6. Xiaohongshu (RedNote / 小红书)

### URL shapes

| Kind | Example |
|------|---------|
| Note page | `https://www.xiaohongshu.com/explore/xxxxxx` |
| Short link | `https://xhslink.com/xxxxx` |

yt-dlp extractor name: `XiaoHongShu` (verify with `yt-dlp --list-extractors | grep -i xiao`).

### Use case A: download a note's video

```bash
./vYtDL download --no-tui -o ./downloads \
  --cookies-from-browser chrome \
  "https://www.xiaohongshu.com/explore/xxxxxx"
```

### Platform notes

- Xiaohongshu restricts anonymous access heavily; **cookies are usually required** (`--cookies-from-browser` from a logged-in browser, or an exported Netscape file via `--cookies`).
- `xhslink.com` short links are resolved by yt-dlp automatically; no need to expand them first.
- Notes generally have no subtitles, so the default `--write-subs` has no side effect; add `--no-subs` if you prefer.
- Image-only notes (no video) are outside the downloader's scope and fail with a "no video stream"-style error — expected behavior.

---

## 7. Other Platforms

The CLI has no whitelist. TikTok, Instagram, Vimeo, Twitch, Facebook, Nicovideo, and every other yt-dlp-supported site work the same way:

```bash
./vYtDL download --no-tui -o ./downloads --cookies-from-browser chrome \
  "https://www.tiktok.com/@user/video/123"
```

- TikTok / Instagram usually need cookies.
- Full site list: `yt-dlp --list-extractors`.
- Difference vs. the desktop / web frontend: the frontend form enforces a 12-domain whitelist (see `apps/vytdl-desktop/src/components/download-form.tsx`); the CLI is not subject to it.

## 8. Cross-Platform Capabilities

| Capability | Usage |
|------------|-------|
| Playlist resume | `--playlist`; re-run the same command to resume, `--reset-playlist-state` to start over |
| Concurrent downloads | `-j N` (worker pool + semaphore) |
| Download records | `download_record.json` / `subtitle_mapping.json`; customize with `--log-format csv`, `--record-file`, `--mapping-file` |
| Subtitles to transcript | `./vYtDL analyze --mode text video.en.vtt` (handles YouTube auto-generated VTT) |
| Shell wrappers | `scripts/download_video.sh` (single video), `scripts/download_collection.sh` (collections) |

## 9. Troubleshooting

| Problem | Fix |
|---------|-----|
| yt-dlp missing | `--install-yt-dlp`, embedded build, or set `--yt-dlp-bin` |
| Slow GitHub downloads | `export VYTDL_YTDLP_MIRROR="https://ghproxy.net/https://github.com/yt-dlp/yt-dlp/releases/latest/download/"` |
| YouTube 403 / n challenge | Node/Deno + cookies + update yt-dlp (see section 3) |
| X anonymous download fails with TLS/Cloudflare | Syndication fallback is built in; if it still fails, add cookies + `twitter:api=graphql` |
| Bilibili low quality | Login cookies / VIP |
| Xiaohongshu parse failure | Add `--cookies-from-browser` |
| Playlist resumes wrong items | Keep `-o` and the URL identical; or `--reset-playlist-state` |

## 10. References

- Full CLI reference and implementation details: [`vYtDL-standalone/USAGE.md`](../../vYtDL-standalone/USAGE.md)
- CLI module doc: [`docs/modules/vytdl-cli.md`](../modules/vytdl-cli.md)
- Platform detection code: `vYtDL-standalone/internal/downloader/downloader.go` (`isTwitterURL` / `extractorArgFlags`)
- Flag definitions: `vYtDL-standalone/cmd/download.go`
