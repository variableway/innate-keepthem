# 脚本（`scripts/`）

根目录构建与启动辅助，**主要服务 vYtDL 桌面**（非 contentforge-desktop）。

| 脚本 | 作用 |
|------|------|
| `build-desktop.py` | 主入口：依赖检查、从 `vYtDL-standalone` 编 sidecar、`dev` / `build` / `bundle` |
| `vytdl-launcher.py` | 备选：`dev` / `build` / `clean` / `schedule` |
| `start-desktop.sh` / `.ps1` / `.py` | 薄封装启动桌面 |
| `bootstrap-ytdlp-dev.sh` | 将系统 yt-dlp 拷到 `src-tauri/resources/yt-dlp/` 供开发编译 |
| `download-yt-dlp-binaries.py` | 拉取多平台 yt-dlp 供生产打包 |

## Taskfile 对应

```bash
task desktop:check
task desktop:cli              # 仅 sidecar
task desktop:bootstrap-ytdlp
task desktop:yt-dlp
task desktop:dev
task desktop:build
task desktop:bundle
```

缺少 `vYtDL-standalone/go.mod` 时，`build-desktop.py` 会提示先 clone 规范仓库。
