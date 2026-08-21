# CI 说明（CI）

统一流水线定义在 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)，对 `main` 的 push 和所有 PR 触发。同一分支的重复推送自动取消（concurrency）。

## Job 结构

按技术栈分四个 job 并行，对应 monorepo 的四个构建域：

| Job | Runner | 覆盖范围 | 关键步骤 |
|---|---|---|---|
| **Go (CLI tools)** | ubuntu | `vYtDL-standalone`、`tools/contentforge-cli` | `go build` + `go test`（vytdl-cli）；`go build`（contentforge-cli） |
| **Rust (matrix)** | ubuntu | `apps/vytdl-desktop`、`apps/contentforge-desktop` 两个 Tauri 应用（matrix 并行） | 见下 |
| **Node (workspace)** | ubuntu | pnpm workspace 全部 `apps/*` + `packages/*` | `pnpm install --frozen-lockfile` + `pnpm run build`（turbo 按依赖序） |
| **Python** | ubuntu | `packages/contentforge-core/python` + `scripts/` | `compileall` 语法检查 |

### Rust job 的特殊前置

vytdl-desktop 的 `cargo check` 需要 Tauri 构建脚本校验通过，因此 CI 先执行与本地完全相同的预置步骤：

1. `python3 scripts/build-desktop.py cli` -- 从 `vYtDL-standalone` 构建并预置 sidecar（`bin/vYtDL-<triple>`）
2. `python3 scripts/download-yt-dlp-binaries.py` -- 下载 yt-dlp 到 `resources/yt-dlp/`
3. 安装 Tauri Linux 系统依赖（libwebkit2gtk-4.1-dev 等）
4. `cargo check --manifest-path apps/<app>/src-tauri/Cargo.toml`

contentforge-desktop 无外部资源依赖，直接 `cargo check`。

## 设计原则

1. **单一流水线**：不分仓库、不分 workflow，所有模块的验证在同一份 ci.yml 里可见。
2. **CI 命令与本地命令一致**：CI 里的预置/构建命令就是 BUILD.md 里写给开发者的命令，避免"CI 绿、本地挂"。
3. **预置产物不进 git**：sidecar 与 yt-dlp 资源在 CI 内即时构建/下载（GitHub Actions 访问 GitHub releases 无需镜像）。
4. **matrix 隔离失败**：两个 Tauri 应用用 matrix 并行，`fail-fast: false`，一个挂不影响另一个的信号。

## 本地复现 CI

```bash
# Go
cd vYtDL-standalone && go build ./... && go test ./... && cd ../..

# Rust (先预置，与 CI 相同)
python3 scripts/build-desktop.py cli
python3 scripts/download-yt-dlp-binaries.py
cargo check --manifest-path apps/vytdl-desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/contentforge-desktop/src-tauri/Cargo.toml

# Node
pnpm install --frozen-lockfile && pnpm run build

# Python
python3 -m compileall -q packages/contentforge-core/python scripts
```

## 尚未纳入 CI 的事项

见 [STATUS.md](STATUS.md)：桌面端完整打包（tauri build 产出安装包）、Go/Rust lint、Python 单元测试（当前无测试）、发布流水线（release artifacts）等。
