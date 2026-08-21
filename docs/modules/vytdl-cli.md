# vYtDL CLI（vYtDL-standalone）

Go 实现的命令行/TUI 下载工具，包装 yt-dlp，覆盖 1800+ 站点。

**唯一源码位置**：仓库根目录下的 `vYtDL-standalone/`（本地 checkout）。规范远程仓库为 [qdriven/innate-vytdl](https://github.com/qdriven/innate-vytdl)。

> 旧路径 `tools/vytdl-cli/` 已移除，避免与 standalone 双份维护。

## 获取源码

```bash
# 若本地还没有 checkout：
git clone https://github.com/qdriven/innate-vytdl.git vYtDL-standalone
```

`vYtDL-standalone/` 带独立 `.git`，在 monorepo 中被 gitignore（嵌套仓库）。CI / Docker 会在构建时 clone。

## 技术栈

Go 1.24+ / Cobra（命令）/ Bubble Tea（TUI）/ 标准库为主

## 目录结构

```
vYtDL-standalone/
├── main.go
├── cmd/                  # Cobra 命令：download、analyze、root
├── internal/
│   ├── config/           # config.json 读取（yt_dlp_bin 路径）
│   ├── downloader/       # yt-dlp 进程封装、进度解析、选项映射
│   ├── ytdlpbin/         # yt-dlp 二进制解析器（PATH→内嵌→缓存→自动下载）
│   ├── playliststate/    # 播放列表断点续传状态
│   ├── record/           # download_record / subtitle_mapping 记录
│   ├── tui/              # Bubble Tea 终端 UI
│   └── vtt/              # VTT 字幕解析
└── scripts/              # build.sh/ps1、fetch-ytdlp.sh 等
```

## 对外接口

```bash
cd vYtDL-standalone
./vYtDL download [--no-tui] [-o DIR] [-q 1080] [--playlist]
               [--cookies-from-browser B] [--js-runtimes node] URL...
./vYtDL analyze --mode text file.vtt
```

用户手册：`vYtDL-standalone/USAGE.md`（含 YouTube / Bilibili 详细示例）。

## 构建（monorepo Task）

```bash
task cli:build
task cli:build:windows
task cli:test
```

`Taskfile.yml` 的 `CLI_DIR` 指向 `./vYtDL-standalone`，并设置 `GOWORK=off`。

## yt-dlp 二进制解析顺序

`--yt-dlp-bin` → `config.json` → PATH → 内嵌（`-tags embed_ytdlp`）→ 用户缓存 → GitHub 自动下载（`VYTDL_YTDLP_MIRROR`）。

## 与其他模块的关系

- **vytdl-desktop**：`scripts/build-desktop.py` 从 `vYtDL-standalone` 构建 sidecar。
- **vytdl-web**：Docker 构建阶段 `git clone` innate-vytdl，不依赖 monorepo 内嵌源码树。

## 测试

```bash
cd vYtDL-standalone && GOWORK=off go test ./...
```
