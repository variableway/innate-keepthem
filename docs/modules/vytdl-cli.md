# vYtDL CLI（tools/vytdl-cli）

Go 实现的命令行/TUI 下载工具，包装 yt-dlp，覆盖 1800+ 站点。**规范仓库**为 [qdriven/innate-vytdl](https://github.com/qdriven/innate-vytdl)，本目录是其 monorepo 镜像工作副本（Go 源码保持一致；见 `MOVED.md`）。

## 技术栈

Go 1.24+ / Cobra（命令）/ Bubble Tea（TUI）/ 标准库为主

## 目录结构

```
tools/vytdl-cli/
├── main.go
├── cmd/                  # Cobra 命令：download、analyze、root
├── internal/
│   ├── config/           # config.json 读取（yt_dlp_bin 路径）
│   ├── downloader/       # yt-dlp 进程封装、进度解析、选项映射
│   ├── ytdlpbin/         # yt-dlp 二进制解析器（PATH→内嵌→缓存→自动下载）
│   │   └── binaries/     # （构建时）内嵌用 yt-dlp 存放处
│   ├── playliststate/    # 播放列表断点续传状态
│   ├── record/           # download_record / subtitle_mapping 记录
│   ├── tui/              # Bubble Tea 终端 UI
│   └── vtt/              # VTT 字幕解析
├── scripts/              # build.sh/ps1、fetch-ytdlp.sh、cut_mp3 等
└── batch_download.py     # 历史批量脚本（Python）
```

## 对外接口

```bash
vYtDL download [--no-tui] [-o DIR] [-q 1080] [--playlist]
               [--cookies-from-browser B] [--install-yt-dlp] URL...
vYtDL analyze URL        # 字幕/VTT 分析（桌面端 sidecar 调用的入口）
```

用户手册：根目录 `USAGE.md`；完整示例与 yt-dlp 参数对照：`tools/vytdl-cli/help.md`。

## yt-dlp 二进制解析顺序

`--yt-dlp-bin` 参数 -> `config.json` 的 `yt_dlp_bin` -> PATH -> 编译期内嵌（`-tags embed_ytdlp`）-> 用户缓存（`~/Library/Caches/vYtDL` 等）-> GitHub 自动下载（支持 `VYTDL_YTDLP_MIRROR` 镜像）。实现：`internal/ytdlpbin/resolve.go`。

## 与其他模块的关系

- **vytdl-desktop**：桌面端通过 Tauri sidecar（`externalBin`）捆绑本模块构建的二进制，`vtt_analysis` 走 `vYtDL analyze`；构建统一见 `scripts/build-desktop.py`。
- **vytdl-web / url-extractor**：独立调用 yt-dlp 或与 CLI 语义对齐，不直接依赖本二进制。

## 测试

`go test ./...`（config/downloader/record/vtt/ytdlpbin 有单测；CI 必跑）。

## 同步约定（monorepo <-> standalone）

1. 功能改动优先在 standalone 仓库（qdriven/innate-vytdl）开发。
2. monorepo 内改动（如路径适配）需回传 standalone，保持 Go 源码一致。
3. 本目录特有的文件：`MOVED.md`、monorepo 语境的 `README.md`；其余应与 standalone 相同。
