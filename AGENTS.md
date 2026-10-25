# AGENTS.md - AI Agent Context

This document provides context for AI agents working on the innate-keepthem monorepo.

## Repository Layout (2026-10 reorg, issue #28)

Two product projects live side by side, split by tech stack, plus a shared
technology layer. They build and ship independently; merging strategies are a
later concern.

```
/
├── vytdl/                        # vYtDL — video downloader (Go + Next.js/Electron)
│   ├── apps/web/                 #   Next.js host (static export, thin routes)
│   ├── apps/shell/               #   Electron shell (spawns the Go daemon)
│   ├── packages/plugin-*/        #   business plugins (downloads/library/settings/analyze)
│   ├── services/vytdl/           #   Go CLI + `vytdl serve` daemon (canonical)
│   ├── extensions/url-extractor/ #   Chrome extension
│   ├── scripts/                  #   build-shell-resources.py etc.
│   └── Dockerfile, docker-compose.yml
├── contentforge/                 # ContentForge — research pipeline (Rust + Python + Go)
│   ├── apps/contentforge-desktop/#   Tauri v2 desktop (own Next.js frontend, frozen WIP)
│   ├── core/                     #   Python library (contentforge.core) + scripts/cf-env.sh
│   ├── cli/                      #   Go CLI (contentforge)
│   └── setup-macos.sh            #   venv bootstrap (see Taskfile setup:macos)
├── packages/                     # 共享技术层 (DSH/desktop positioning)
│   ├── ui/                       #   shadcn-style component library (@vytdl/ui)
│   ├── utils/                    #   shared TS utils (@vytdl/utils)
│   └── plugin-runtime/           #   DSH plugin architecture: manifest contract,
│                                 #   permission-gated proxy, registry, slots, i18n
├── docs/                         # architecture, modules, plugin-protocol, runbooks
├── tasks/tracing/                # git-workflow local tracing records
└── pnpm-workspace.yaml / go.work / Taskfile.yml
```

The daemon (`vytdl/services/vytdl`) is the canonical Go source; `qdriven/innate-vytdl`
receives one-way sync PRs. `packages/*` is deliberately project-agnostic so
contentforge can adopt the DSH plugin architecture later without moving code.

## Technology Stack

### vYtDL (vytdl/)

- **CLI + daemon**: `vytdl/services/vytdl/` — Go 1.26+, spf13/cobra,
  charmbracelet/bubbletea; yt-dlp as subprocess. `vytdl serve` = HTTP API + WS +
  FIFO queue + SQLite (`modernc.org/sqlite`, CGO_ENABLED=0)
- **Frontend**: `vytdl/apps/web/` — Next.js + React 19 + TS + Tailwind v4,
  static export; feature pages live in plugins, host routes are thin
  `<PluginPage>` mounts. Tailwind scans `packages/` via `@source` (see
  `vytdl/apps/web/src/app/globals.css`)
- **Business plugins**: `vytdl/packages/plugin-{downloads,library,settings,analyze}/`
  — `plugin.json` manifests, nav/page/slot registrations
- **Desktop shell**: `vytdl/apps/shell/` — Electron host (no business logic):
  spawns/guards the daemon on a random loopback port, sandboxed BrowserWindow,
  preload bridge (`reveal-folder`/`open-folder`/`pick-folder`/`clipboard-write`/`get-versions`),
  legacy Tauri data import (`migration.ts`), electron-updater
- **Extension**: `vytdl/extensions/url-extractor/` — Chrome MV3, vanilla JS
- **Docker**: `vytdl/docker-compose.yml` builds from the repo ROOT context
  (the frontend consumes the shared `packages/` layer)

### ContentForge (contentforge/)

- `contentforge/apps/contentforge-desktop/` — Tauri v2 + own Next.js 15 frontend
  (zero imports from `@vytdl/*`), frozen WIP pending Rust commands rebuild
- `contentforge/core/` — Python library; activate via
  `source contentforge/core/scripts/cf-env.sh` (venv at repo root `.venv-cf/`)
- `contentforge/cli/` — Go CLI (module stays `.../tools/contentforge-cli`;
  renaming the Go module path is deferred)

### Shared (packages/)

- `@vytdl/ui` — component library (Tailwind v4 tokens, shadcn-style)
- `@vytdl/utils` — shared TS utilities
- `@vytdl/plugin-runtime` — the DSH plugin architecture: manifest validation,
  permission-gated API proxy, registry with error isolation, safe mode,
  slot mounts, i18n merge. Protocol spec: `docs/plugin-protocol.md`
- Typed as best-effort: `packages/ui` has known typing debt against
  React 19/Base UI (kept out of CI); the plugin packages each carry a
  `tsconfig.json` for strict local checks

## Architecture

### vYtDL

```
Electron shell (vytdl/apps/shell)   ── spawn + health ──►  vytdl serve (Go)
    ↓ BrowserWindow loads                                 │ HTTP API + WS
vytdl/apps/web (static export) ◄────── same-origin ────────┘
    ↓
plugin-runtime registry/slots  ◄──  vytdl/packages/plugin-* (nav + pages)
    ↓
@vytdl/plugin-runtime/client (HTTP/WS)  ·  window.vytdlShell (native bridge)
    ↓
Go daemon: queue → downloader → yt-dlp subprocess · SQLite
```

### ContentForge

```
contentforge/cli (Go)  ── orchestrates ──►  contentforge/core (Python)
contentforge/apps/contentforge-desktop (Tauri)  [frozen WIP]
```

## Download Queue (Go daemon — single implementation)

- FIFO, `max_concurrent` (default 3, clamped 1–10, persisted in settings)
- `pending → downloading → completed/failed/cancelled`; cancel kills the
  yt-dlp process context
- Startup resume: `pending`/`downloading` rows re-enqueued from the serialized
  request in `options`; rows without options are marked failed
- WS broadcast: `download:progress:<id>`, `download:log:<id>`,
  `download:status:<id>`, `queue:update`

## API Client

`@vytdl/plugin-runtime/client` is the single API layer:

- `apiInvoke(command, args)` — `POST /api/{command}` (same-origin or
  `NEXT_PUBLIC_API_BASE`)
- `apiListen(event, handler)` — WebSocket `/api/ws` with auto-reconnect
- `shellBridge()` — typed accessor for `window.vytdlShell`; absent in plain
  browsers (native buttons hide)

The same frontend serves desktop (daemon on 127.0.0.1 random port) and Docker.

## Database Schema

### `downloads` table
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PRIMARY KEY | UUID |
| url | TEXT NOT NULL | Video URL |
| title | TEXT | Fetched from yt-dlp |
| status | TEXT | pending/downloading/completed/failed/cancelled |
| progress | REAL | 0.0 - 100.0 |
| speed | TEXT | e.g. "1.5MiB/s" |
| eta | TEXT | e.g. "00:02:15" |
| output_dir | TEXT | Download destination |
| filename | TEXT | Final filename |
| subtitles | TEXT | JSON array of subtitle file paths |
| error | TEXT | Error message if failed |
| queue_position | INTEGER | Position in pending queue |
| options | TEXT | JSON serialized StartDownloadRequest for resume |
| created_at / updated_at | TIMESTAMP | |

### `settings` table
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PRIMARY KEY | Setting key |
| value | TEXT | Setting value |
| updated_at | TIMESTAMP | |

## Common Tasks

### vYtDL: add a CLI flag
1. Flag var in `vytdl/services/vytdl/cmd/download.go` init()
2. Add to `downloader.Options`
3. Pass through in `internal/downloader/downloader.go`

### vYtDL: add a daemon endpoint
1. Handler in `vytdl/services/vytdl/internal/server/handlers.go` + route in `registerRoutes`
2. Map the command to a capability domain in `packages/plugin-runtime/src/permissions.ts` if plugins call it
3. Frontend calls `apiInvoke()` with the same command name

### vYtDL: add a plugin feature
1. Code lives in the owning `vytdl/packages/plugin-*` (or a new package with `plugin.json`)
2. Daemon via `apiInvoke()`; declare permissions in the manifest
3. Native-only actions via the preload bridge; hide when absent
4. Locale keys into `packages/plugin-runtime/locales/*.json` (plugins merge fragments)

### vYtDL: add a language
1. `packages/plugin-runtime/locales/<lang>.json` (copy `en.json` structure)
2. Register in `packages/plugin-runtime/src/i18n.tsx`; add the option in plugin-settings

### ContentForge: build & check
- `task contentforge:build` (Go CLI), `task contentforge:check` (Python import)
- `cargo check --manifest-path contentforge/apps/contentforge-desktop/src-tauri/Cargo.toml`

## File Conventions

- Go: standard gofmt; tests `*_test.go`
- TypeScript: ESLint + Prettier; tests `*.test.ts`
- Locale JSON: nested objects with dot-notation keys
- plugin manifests: `plugin.json` beside the package entry

## Build & Task Entry Points

- `task cli:build` / `task daemon:dev` / `task shell:dev` / `task desktop:bundle` — vYtDL
- `task contentforge:build` / `task contentforge:check` — ContentForge
- `task web:up` — Docker deploy (compose file: `vytdl/docker-compose.yml`)
- CI: `.github/workflows/vytdl.yml` (paths: `vytdl/**`, `packages/**`) and
  `.github/workflows/contentforge.yml` (paths: `contentforge/**`) — independent pipelines

## Documentation

- Index: [`docs/README.md`](docs/README.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Plugin protocol: [`docs/plugin-protocol.md`](docs/plugin-protocol.md)
- Release runbook: [`docs/release-runbook.md`](docs/release-runbook.md)
- Sprint history: [`docs/refactor/`](docs/refactor/)

Project-local AI Skills (`.agents/skills`) have been removed; use the docs above.

## Known Issues

- `packages/ui` has pre-existing TypeScript errors against React 19/Base UI
  ('ref'/align/side props); CI deliberately runs no typecheck over it. New
  packages should ship a `tsconfig.json` (see `vytdl/packages/plugin-settings`)
- Local pnpm has `lockfile=false`; regenerate the lockfile with
  `pnpm install --config.lockfile=true`
- proxy.golang.org is unreachable from this network: use
  `GOPROXY=https://goproxy.cn,direct`
- contentforge `setup:macos` points at `contentforge/setup-macos.sh`, which is
  not yet committed
- yt-dlp must be installed separately (or `--install-yt-dlp`); YouTube may
  block anonymous requests (`--cookies-from-browser`); the `n` challenge needs
  a JS runtime (CLI defaults to `--js-runtimes node`)
