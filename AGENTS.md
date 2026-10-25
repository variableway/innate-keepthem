# AGENTS.md - AI Agent Context

This document provides context for AI agents working on the vYtDL codebase.

## Project Overview

vYtDL is a YouTube downloader suite with four components:
- **vYtDL CLI** - Go-based CLI wrapping yt-dlp
- **vYtDL Desktop** - Tauri v2 + Next.js + React 19 desktop app with i18n support
- **vYtDL Web** - Docker-deployable web UI with Hono backend
- **URL Extractor** - Chrome extension for URL extraction

## Technology Stack

### CLI (services/vytdl/)
- **Language**: Go 1.26+
- **CLI Framework**: spf13/cobra
- **TUI Framework**: charmbracelet/bubbletea + lipgloss
- **External Dependency**: yt-dlp (called as subprocess)
- **Location**: `services/vytdl/` — canonical source, tracked in this monorepo (refactor Sprint 1); `qdriven/innate-vytdl` receives one-way sync PRs
- **Background service**: `vYtDL serve` daemon (`cmd/serve.go`, `internal/server/`) — HTTP API + WS + queue + SQLite, single backend for the web UI (see `docs/refactor/sprint-0/`)

### Desktop (apps/web + apps/shell — refactor Sprint 2/3)
- **Frontend**: `apps/web` — Next.js + React 19 + TypeScript + Tailwind, static export (`output: "export"`), pure HTTP/WS (`api-client.ts` lives in plugin-runtime); native-only actions go through the `window.vytdlShell` preload bridge and degrade/hide in plain browsers
- **Plugin architecture (Sprint 3)**: `packages/plugin-runtime` — manifest contract (`plugin.json` + engine check), permission-gated API proxy, registry with error isolation, safe mode (`?safe-mode=1`), slot mounts; feature pages live in `packages/plugin-{downloads,library,settings,analyze,workspace}`, host routes are thin `<PluginPage>` mounts; shared client (api-client/stores/types/i18n) is exported from plugin-runtime subpaths
- **Desktop Shell**: `apps/shell` — Electron host (no business logic): spawns/guards the Go daemon, sandboxed BrowserWindow loads the daemon URL; preload bridge exposes reveal-folder/open-terminal/dialog/clipboard; AI agent terminal launcher ported from Tauri (`src/main/terminal-launcher.ts`)
- **Build**: pnpm monorepo (apps/*, packages/*, services/vytdl)
- **State**: Zustand stores in plugin-runtime (`/store` subpath): downloadStore (shared backbone), settingsStore; chatStore lives in plugin-workspace
- **i18n**: provider + locales in plugin-runtime (`/i18n` subpath); plugins merge fragments via `registerTranslations`
- **API**: HTTP + WebSocket against `vytdl serve` (Electron: `http://127.0.0.1:<random port>`; browser/Docker: same API, any origin)

### Web Server (apps/vytdl-web/)
- **Backend**: Node.js + Hono (@hono/node-server) + WebSocket (`ws`)
- **Database**: better-sqlite3 (same schema as desktop)
- **Queue**: In-memory queue manager with configurable concurrency
- **yt-dlp**: Spawned as child process

### URL Extractor (extensions/url-extractor/)
- **Chrome Extension**: Manifest V3
- **Frontend**: Vanilla HTML/CSS/JS
- **Batch Script**: Python 3.6+

## Architecture

### CLI

```
main.go → cmd.Execute() → cmd/root.go
                    ├─── cmd/download.go (flags parsing, concurrent dispatch)
                    │            ↓
                    │    downloader.New() → yt-dlp subprocess
                    │            ↓
                    │    record.Manager → JSON/CSV output files
                    │
                    └─── cmd/analyze.go (--mode text)
                                 ↓
                         vtt.Parse() → plain text
```

### Desktop

```
Electron Shell (apps/shell)          ── spawn + health ──►  vYtDL daemon (Go)
    ↓ BrowserWindow loads                                   │ HTTP API + WS
apps/web (Next.js static export) ◄────── same-origin ────────┘
    ↓
plugin-runtime registry/slots  ◄──  packages/plugin-* (nav + pages)
    ↓
@vytdl/plugin-runtime/client (HTTP/WS)  ·  window.vytdlShell (native bridge)
    ↓
Tauri IPC (commands.rs → queue.rs → downloader.rs, database.rs)
    ↓
yt-dlp subprocess (via Tauri Rust backend)
```

### Web Server (Docker)

```
Browser
    ↓
Next.js Static Build (served by Hono)
    ↓
HTTP API / WebSocket (Hono server)
    ↓
Queue Manager → yt-dlp subprocess
    ↓
SQLite Database
```

## Key Modules

### CLI (services/vytdl/)

- `main.go` → cmd.Execute() → cmd/root.go
- `cmd/download.go` - CLI flags, download orchestration, concurrent dispatch, TUI coordination
- `cmd/serve.go` - daemon subcommand (flags: --port/--host/--static/--home/--dev)
- `cmd/analyze.go` - VTT subtitle analysis subcommand (`--mode text`)
- `internal/config/` - Loads `config.json` for yt-dlp binary path
- `internal/downloader/` - Core download logic, wraps yt-dlp as subprocess (cancellation + log streaming for the daemon queue)
- `internal/server/` - Daemon: HTTP routes (handlers.go), SQLite (database.go), queue manager (queue.go), WS hub (hub.go), yt-dlp metadata (meta.go), VTT analyzer (vttanalyzer.go), extract-audio (audio.go)
- `internal/playliststate/` - Manages `.playlist_state.json` for resume
- `internal/record/` - Manages download_record and subtitle_mapping files (thread-safe)
- `internal/tui/` - bubbletea-based terminal UI
- `internal/vtt/` - WebVTT parser (handles YouTube auto-generated and manual captions)

### Desktop (apps/web + apps/shell + packages/plugin-*)

- `apps/web/src/` - Frontend host: thin route mounts (`<PluginPage>`), `plugins.ts` bootstrap, app-shell/sidebar
- `packages/plugin-runtime/` - Plugin contract + runtime (manifest, permission-gated API proxy, registry with error isolation, safe mode) + shared client (`/client` `/store` `/types` `/i18n` `/layout` `/lib`)
- `packages/plugin-{downloads,library,settings,analyze,workspace}/` - First-party feature plugins (component + nav + page registrations, `plugin.json` manifests)
- `apps/shell/src/main/` - Electron main: `main.ts` (window/IPC/auto-update), `daemon.ts` (spawn/guard `vytdl serve`), `terminal-launcher.ts`, `migration.ts` (one-time legacy Tauri data import)
- `apps/shell/src/preload/` - `contextBridge` → `window.vytdlShell`
- Third-party plugins install to `~/.vytdl/plugins/<id>/` (`vytdl plugin install`); daemon serves them under `/api/plugins`

### URL Extractor (extensions/url-extractor/)

- `manifest.json` - Chrome extension config (Manifest V3)
- `popup.html/js/css` - Extension popup UI
- `content.js` - Content script for URL extraction from YouTube pages

## Download Form Modes

The download page has three tabs:

| Tab | Component | Input | Behavior |
|-----|-----------|-------|----------|
| Single | `download-form.tsx` (`mode="single"`) | Single `<Input>` | Fetches video info on URL input; playlist URLs show a collection preview and expand per-entry on submit |
| Batch | `download-form.tsx` (`mode="batch"`) | `<textarea>` + file import | Parses multiple URLs (one per line), submits all to queue |
| Collection | `collection-tab.tsx` | Single URL | Fetches playlist/collection entries with selection, size estimates, then submits per-entry |

Batch mode:
- URLs are split by newlines, filtered for validity, deduplicated
- `#` lines are treated as comments and ignored
- `.txt` file import supported via hidden `<input type="file">`
- Sequential `startDownload()` calls; queue handles concurrency

## AI Agent Terminal Launcher

> 已于 2026-10-25 移除（issue #25）——AI 工作台/终端启动器产品线下线；桌面通用桥能力保留。

## Download Queue System

The Go daemon (`services/vytdl/internal/server/queue.go`) is the single queue implementation:

- FIFO with configurable `max_concurrent` (default: 3, clamped 1–10, persisted in settings)
- Status transitions: `pending` → `downloading` → `completed`/`failed`/`cancelled`
- Cancel kills the yt-dlp process (context) and classifies as `cancelled`
- Resume on startup: rows still `pending`/`downloading` are re-enqueued from the serialized request in the `options` column; rows without options are marked failed
- Progress/logs broadcast over `/api/ws` (`download:progress:<id>`, `download:log:<id>`, `download:status:<id>`, `queue:update`)

Behavior baseline was the desktop `queue.rs` / web `queue.ts` pair (both now removed).

## API Client

`@vytdl/plugin-runtime/client` is the single API layer (HTTP + WebSocket):

- `apiInvoke(command, args)` - `POST /api/{command}` against the daemon (same-origin or `NEXT_PUBLIC_API_BASE`)
- `apiListen(event, handler)` - WebSocket `/api/ws` with auto-reconnect
- `shellBridge()` - typed accessor for the Electron `window.vytdlShell` preload bridge; absent in plain browsers (native buttons hide)

The same frontend serves desktop (daemon on 127.0.0.1 random port) and Docker web contexts.

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
| options | TEXT | JSON serialized `StartDownloadRequest` for resume |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `settings` table
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PRIMARY KEY | Setting key |
| value | TEXT | Setting value |
| updated_at | TIMESTAMP | |

## Common Tasks

### Adding a New CLI Flag

1. Add flag variable in `cmd/download.go` init()
2. Add to `downloader.Options` struct
3. Pass through to yt-dlp in `internal/downloader/downloader.go`

### Adding a Desktop Feature

1. Feature code lives in the owning `packages/plugin-*` (or a new plugin package with a `plugin.json` + entry registering nav/pages)
2. Call the daemon via `@vytdl/plugin-runtime/client` `apiInvoke()` (declare the permission in the manifest)
3. Native-only actions go through the `window.vytdlShell` preload bridge; hide them when the bridge is absent
4. Translation keys go in `packages/plugin-runtime/locales/*.json` (plugin-local locale fragments merge via `registerTranslations`)

### Adding a New Language

1. Create `packages/plugin-runtime/locales/<lang>.json` (copy structure from `en.json`)
2. Translate all values
3. Register the locale in `packages/plugin-runtime/src/i18n.tsx` and add the option in `plugin-settings`

### Modifying Download Behavior

- Single implementation: `services/vytdl/internal/downloader/downloader.go` (args) + `internal/server/queue.go` (queue semantics)

### Adding a Daemon API Endpoint

1. Handler in `services/vytdl/internal/server/handlers.go` + route in `registerRoutes`
2. Map the command to a capability domain in `packages/plugin-runtime/src/permissions.ts` if plugins may call it
3. Use `apiInvoke()` from the frontend with the same command name

## File Conventions

- Go files: standard Go formatting, no external formatters required
- TypeScript: ESLint + Prettier
- Test files: `*_test.go` (Go), `*.test.ts` (TypeScript)
- JSON config: simple key-value, no nested structures
- JSON locale files: nested object structure with dot-notation keys

## Shell Scripts

Located in `services/vytdl/scripts/`:
- `download_video.sh` - Single video wrapper
- `download_collection.sh` - Playlist wrapper
- `build.sh` - Cross-build helper for macOS/Linux/Windows targets
- `build.ps1` - Cross-build helper for macOS/Linux/Windows targets on PowerShell

Located in `scripts/`:
- `start-desktop.sh` - Mac/Linux desktop startup
- `start-desktop.ps1` - Windows desktop startup
- `start-desktop.py` - Cross-platform desktop launcher
- `vytdl-launcher.py` - Python launcher (dev/build/clean/schedule)

Download wrapper scripts validate `yt-dlp`/`youtube-dl` availability before running.

## Documentation

- Index: [`docs/README.md`](docs/README.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Modules: [`docs/modules/`](docs/modules/)

Project-local AI Skills (`.agents/skills`) have been removed; use the docs above for context.

## Known Issues

- yt-dlp must be installed separately and path configured in `config.json` (or rely on auto-resolve / `--install-yt-dlp`)
- YouTube may block anonymous requests; use `--cookies-from-browser` as workaround
- YouTube `n` challenge requires a JS runtime (deno/node). vYtDL CLI defaults to `--js-runtimes node`
- URL escaping issues were fixed; downloader normalizes input URLs
- Desktop `tauriStorage` type has known TypeScript incompatibility with Zustand `PersistStorage`
