# 构建方式（BUILD）

所有构建入口统一在仓库根目录。前提工具：**Go 1.24+**、**Node 22 + pnpm 9**、**Rust（cargo）**、**Python 3**。macOS 首次准备可运行 `./setup-macos.sh`。

## 总入口：Taskfile

```bash
task                      # 列出所有任务
```

常用任务（定义见根 `Taskfile.yml`）：

| 任务 | 作用 |
|---|---|
| `task cli:build` | 构建 `tools/vytdl-cli` -> `./vYtDL` |
| `task cli:test` | 运行 CLI 单元测试 |
| `task desktop:cli` | 构建 CLI 并预置为桌面端 sidecar（`src-tauri/bin/vYtDL-<triple>`） |
| `task desktop:yt-dlp` | 下载 yt-dlp 平台二进制到桌面端资源目录 |
| `task desktop:dev` | 桌面端开发模式（自动预置 sidecar） |
| `task desktop:build` | 桌面端生产构建 |
| `task desktop:bundle` | 构建 + 生成安装包 |

## 1. vYtDL CLI（tools/vytdl-cli）

```bash
cd tools/vytdl-cli
go build -o vYtDL .
go test ./...
./vYtDL download --no-tui -o ./downloads -q 1080 "https://..."

# 单文件发布版（内嵌 yt-dlp）
./scripts/fetch-ytdlp.sh --embed
go build -tags embed_ytdlp -o vYtDL .
```

- CLI 的 yt-dlp 解析顺序：`--yt-dlp-bin` -> PATH -> 内嵌 -> 缓存 -> 自动从 GitHub 下载。
- 慢网络用镜像：`export VYTDL_YTDLP_MIRROR="https://ghproxy.net/https://github.com/yt-dlp/yt-dlp/releases/latest/download/"`。
- 规范仓库为 [qdriven/innate-vytdl](https://github.com/qdriven/innate-vytdl)；monorepo 内改动需双向同步。

## 2. vYtDL Desktop（apps/vytdl-desktop）

```bash
# 方式一：Python 脚本（推荐，自动处理 sidecar 与资源）
python3 scripts/build-desktop.py dev      # 开发
python3 scripts/build-desktop.py build    # 生产构建
python3 scripts/build-desktop.py bundle   # 构建 + 安装包
python3 scripts/build-desktop.py cli      # 仅预置 CLI sidecar
python3 scripts/build-desktop.py check    # 检查依赖

# 交叉编译
python3 scripts/build-desktop.py build --target x86_64-pc-windows-msvc

# 方式二：task / pnpm
task desktop:dev
pnpm vytdl:build
```

构建前置（脚本自动完成，手动时需自知）：

1. **CLI sidecar**：`bundle.externalBin` 要求 `src-tauri/bin/vYtDL-<target-triple>` 存在。`build-desktop.py` 会自动从 `tools/vytdl-cli` 构建并按 Rust triple 命名预置（GOOS/GOARCH 自动映射）。产物 gitignored。
2. **yt-dlp 资源**：`resources/yt-dlp/`（分平台解压后的 yt-dlp），由 `scripts/download-yt-dlp-binaries.py` 下载，gitignored，支持 `VYTDL_YTDLP_MIRROR`。
3. **Node 依赖**：`pnpm install`（根 workspace，一次安装覆盖全部 apps/packages）。

## 3. vYtDL Web（apps/vytdl-web）

```bash
pnpm install
pnpm --filter @vytdl/web-server build     # tsc 编译

# Docker 部署（根目录）
docker-compose up -d
```

## 4. ContentForge

```bash
# CLI（Go）
cd tools/contentforge-cli && go build ./...

# 核心 Python 包
pip install -e packages/contentforge-core/python   # 或按 contentforge-core 文档

# 桌面端（Tauri + Next.js）
cd apps/contentforge-desktop/src-tauri && cargo check
pnpm --filter contentforge-desktop build           # Next.js 前端
```

## 5. Node workspace 全量构建

```bash
pnpm install        # 生成/使用 pnpm-lock.yaml
pnpm run build      # turbo 按依赖序构建（Next 应用、web-server、utils 包）
```

## 产物与忽略规则

- CLI 二进制、sidecar（`bin/vYtDL-*`）、yt-dlp 资源、`node_modules`、`.next`、`src-tauri/target` 均 gitignored。
- 安装包输出：`apps/*/src-tauri/target/release/bundle/`。
- 统一发布产物目录（如需）：`dist/`（gitignored）。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| `cargo check` 报 `resource path resources/yt-dlp doesn't exist` | 先 `python3 scripts/download-yt-dlp-binaries.py` |
| `cargo check` 报 externalBin 找不到 | 先 `python3 scripts/build-desktop.py cli` |
| yt-dlp 下载卡住 | 设置 `VYTDL_YTDLP_MIRROR` 镜像后重试 |
| pnpm 找不到 workspace 包 | 在仓库根执行 `pnpm install` |
