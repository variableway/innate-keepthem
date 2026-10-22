# 03 · 目标目录结构与迁移映射

## 1. 目标结构

```
innate-keepthem/
├── apps/
│   ├── shell/                    # Electron 宿主（主进程 + preload）
│   │   ├── src/main/             # 窗口、daemon 进程守护、菜单/托盘、更新、原生能力桥
│   │   ├── src/preload/          # contextBridge：reveal-folder / open-terminal / dialog
│   │   └── build/                # 图标、打包配置（electron-builder）
│   └── web/                      # Web 前端宿主（Next.js）
│       └── src/
│           ├── app/              # 只剩布局与插件页面挂载点
│           ├── components/layout/  # app-shell / app-sidebar（插槽宿主）
│           ├── plugin-runtime/     # 运行时本地开发态（发布到 packages/）
│           └── i18n/             # 宿主级语言包
├── packages/
│   ├── plugin-runtime/           # 插件运行时（registry / loader / slots / api 代理）
│   ├── plugin-downloads/
│   ├── plugin-library/
│   ├── plugin-settings/
│   ├── plugin-analyze/           # VTT 分析
│   ├── plugin-workspace/         # AI Agent 终端启动器
│   ├── ui/                       # @vytdl/ui（保留）
│   └── utils/                    # @vytdl/utils（保留）
├── services/
│   ├── vytdl/                    # 后台服务：vYtDL-standalone 检出（gitignore，go.work 成员）
│   │                             #   新增 cmd/serve.go + internal/server/*
│   └── agent-reach/              # 保留
├── extensions/
│   └── url-extractor/            # 保留
├── tools/contentforge-cli/        # 冻结（D5）
├── packages/contentforge-core/    # 冻结（D5）
├── apps/contentforge-desktop/     # 冻结（D5）
├── Taskfile.yml                  # shell:dev / web:dev / daemon:dev / daemon:build
├── go.work                       # services/vytdl + tools/contentforge-cli
└── pnpm-workspace.yaml           # apps/* packages/* tools/* services/* extensions/*
```

## 2. 迁移映射表

| 现状 | 动作 | 目标 |
|------|------|------|
| `apps/vytdl-desktop/src/app`、`src/components`、`src/i18n`、`src/store`、`src/lib/api-client.ts` | `git mv` + 拆分 | `apps/web`（宿主骨架）+ `packages/plugin-*`（功能） |
| `apps/vytdl-desktop/src-tauri/src/terminal_launcher.rs`、`agent_cli.rs`、`agent_runner.rs` | 参照重写（Node） | `apps/shell/src/main/` |
| `apps/vytdl-desktop/src-tauri/src/`（其余：queue/downloader/database/commands/resilience/...） | **不迁移**，由 Go daemon 覆盖 | 删除（Sprint 4 清理） |
| `apps/vytdl-web/src/index.ts` 等 | 行为基线 | Go 重写后删除；Docker 镜像改打 daemon |
| `vYtDL-standalone/` | 更名/改引用 | `services/vytdl/`（仍是独立仓库检出，CI 与 go.work 同步调整） |
| `packages/ui`、`packages/utils` | 保留 | 原地 |
| `docker-compose.yml`、`Dockerfile` | 重写 | 跑 Go daemon + 内嵌静态前端 |

> 迁移全部走 `git mv` 保历史；前端组件到插件的拆分按插件逐个进行（Sprint 3），不做一次性大爆炸。

## 3. Taskfile 任务面（重构后）

| 任务 | 命令 | 说明 |
|------|------|------|
| daemon 开发 | `task daemon:dev` | `go run ./cmd serve --dev`（热重建可选 air） |
| daemon 构建 | `task daemon:build` | 交叉编译各平台二进制（Electron resource 用） |
| Web 开发 | `task web:dev` | Next dev，代理到本地 daemon |
| Shell 开发 | `task shell:dev` | electron . + 前置 daemon:build |
| 桌面打包 | `task desktop:bundle` | electron-builder（dmgr/exe），内嵌 daemon 与前端静态产物 |
| Web Docker | `task web:up` | daemon + 静态前端单镜像 |

## 4. 下线清单

- [ ] `apps/vytdl-desktop/src-tauri/`（Sprint 4，daemon 全功能对齐后）
- [ ] `apps/vytdl-web/src/*.ts`（Sprint 1 末，Go daemon API 对齐后）
- [ ] Tauri 相关 Taskfile 任务、CI job（Rust）随之移除；新增 Electron 构建 job
