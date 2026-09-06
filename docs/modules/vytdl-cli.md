# vYtDL CLI（`vYtDL-standalone/`）

## 定位

Go CLI / TUI，将 **yt-dlp** 作为子进程调用，提供简化参数、播放列表断点续传、下载记录与字幕分析。规范远程仓库：[qdriven/innate-vytdl](https://github.com/qdriven/innate-vytdl)。

本地目录为嵌套 git checkout（monorepo 中 gitignore）。若不存在：

```bash
git clone https://github.com/qdriven/innate-vytdl.git vYtDL-standalone
```

## 技术栈

- Go 1.24+
- spf13/cobra
- charmbracelet/bubbletea + lipgloss
- 可选：`-tags embed_ytdlp` 内嵌 yt-dlp

## 入口

| 文件 | 作用 |
|------|------|
| `main.go` | 入口 → `cmd.Execute()` |
| `cmd/download.go` | 下载命令与并发调度 |
| `cmd/analyze.go` | VTT → text / markdown |
| `internal/downloader/` | 参数组装、进度解析、播放列表 |
| `internal/ytdlpbin/` | yt-dlp 解析 / 安装 / 内嵌 |
| `internal/record/` | `download_record` + `subtitle_mapping` |
| `internal/playliststate/` | `.playlist_state.json` 续传 |
| `internal/tui/` | 终端进度 UI |
| `internal/vtt/` | WebVTT 解析 |

## 功能

- 任意 yt-dlp 支持站点（无域名白名单）
- 画质 `-q`、容器 `-f`、时间片段 `--start` / `--end`
- 默认中英字幕（含自动字幕），可用 `--no-subs` 关闭
- Cookie / 代理 / `--extractor-args` / `--js-runtimes`（默认 `node`）透传
- `--playlist`：按标题建子目录 + 断点续传
- `-j N` 多 URL 并发
- `--install-yt-dlp` 写入本地缓存
- `analyze`：清洗 YouTube 自动字幕 VTT

## 构建

```bash
task cli:build
task cli:build:windows          # amd64 + arm64
task cli:test
cd vYtDL-standalone && GOWORK=off go build -o vYtDL .
```

## 与其他模块

- 桌面 sidecar：`scripts/build-desktop.py` → `apps/vytdl-desktop/src-tauri/bin/vYtDL-<triple>`
- Docker：根 `Dockerfile` clone 本仓库后编译进镜像
- 详细用法：`vYtDL-standalone/USAGE.md`
