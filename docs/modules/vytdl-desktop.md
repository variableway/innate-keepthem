# vYtDL Desktop（apps/vytdl-desktop）

跨平台桌面下载工作台：Tauri v2（Rust 后端）+ Next.js 15 / React 19 / TypeScript / Tailwind 前端，多语言（中/英/日）。

## 技术栈

- 前端：Next.js 15（App Router）、React 19、Tailwind、`@vytdl/ui`（packages/ui）
- 后端：Rust（tauri 2.x、tokio、sqlx/sqlite）
- 打包：Tauri bundler，产出 dmg/msi/AppImage

## 目录结构

```
apps/vytdl-desktop/
├── src/                      # Next.js 前端
│   ├── app/                  # 页面（App Router）
│   ├── components/           # download-form、download-list、layout、settings、workspace
│   ├── store/                # 状态（downloadStore 等）
│   └── lib/                  # api-client（invoke/WS 双模式）等
└── src-tauri/
    ├── src/
    │   ├── commands.rs       # Tauri command 入口 + yt-dlp 路径解析（VYTDL_CONFIG 等）
    │   ├── downloader.rs     # 下载执行：spawn yt-dlp、进度解析、代理环境清理
    │   ├── vtt_analysis.rs   # 调用 vYtDL CLI sidecar 做字幕分析（find_vytdl_cli）
    │   ├── database.rs       # SQLite（下载记录、日志）
    │   └── queue.rs          # 下载队列与并发
    ├── bin/                  # CLI sidecar（vYtDL-<triple>，gitignored，构建时预置）
    ├── resources/yt-dlp/     # 平台 yt-dlp 二进制（gitignored，脚本下载）
    └── tauri.conf.json       # externalBin=bin/vYtDL、resources、beforeBuild
```

## 关键机制

### CLI sidecar（单一二进制来源）

`tauri.conf.json` 声明 `bundle.externalBin: ["bin/vYtDL"]`。构建时 `scripts/build-desktop.py` 从 `tools/vytdl-cli` 构建并按 Rust triple 预置为 `bin/vYtDL-<triple>`（交叉编译自动映射 GOOS/GOARCH）。运行时 `find_vytdl_cli()` 按序解析：应用旁 sidecar -> `VYTDL_CLI_PATH` -> monorepo 路径 -> PATH。

### yt-dlp 引擎

- 路径解析（`commands.rs`）：`VYTDL_CONFIG` 指向的 config -> `tools/vytdl-cli/config.json`（向上回溯）-> 可执行文件旁 -> bundled `resources/yt-dlp/<platform>` -> PATH。
- 下载执行（`downloader.rs`）：`tokio::task::spawn_blocking` 包装，避免 Tauri v2 下的 tokio 死锁；spawn 前清理 `*_proxy` 环境变量（npm 代理污染问题）。

### 前后端通信

`src/lib/api-client.ts`：Tauri 环境走 `invoke` + Tauri Event；纯浏览器模式走 WebSocket（复用 vytdl-web 协议）。

## 构建/运行

见 `docs/BUILD.md`（`python3 scripts/build-desktop.py dev|build|bundle`，或 `task desktop:dev`）。

## 已知未完成项

见 `docs/STATUS.md`（格式列表解析 TODO、部分 database 方法未接线等）。
