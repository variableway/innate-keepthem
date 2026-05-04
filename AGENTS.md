# AGENTS.md - AI Agent Context

This document provides context for AI agents working on the vYtDL codebase.

## Project Overview

vYtDL is a YouTube downloader suite with three components:
- **vYtDL CLI** - Go-based CLI wrapping yt-dlp
- **vYtDL Desktop** - Tauri v2 + Next.js + React 19 desktop app with i18n support
- **URL Extractor** - Chrome extension for URL extraction

## Technology Stack

### CLI (vYtDL/)
- **Language**: Go 1.24+
- **CLI Framework**: spf13/cobra
- **TUI Framework**: charmbracelet/bubbletea + lipgloss
- **External Dependency**: yt-dlp (called as subprocess)

### Desktop (vYtDL-desktop/)
- **Frontend**: Next.js + React 19 + TypeScript + Tailwind CSS
- **Desktop Shell**: Tauri v2 (Rust backend)
- **Build**: pnpm monorepo (apps/desktop, packages/ui, packages/utils)
- **State**: Zustand stores (downloadStore, settingsStore)
- **Storage**: Tauri storage adapter + SQLite database
- **i18n**: Custom React context with JSON locale files (`src/i18n/`)

### URL Extractor (url-extractor/)
- **Chrome Extension**: Manifest V3
- **Frontend**: Vanilla HTML/CSS/JS
- **Batch Script**: Python 3.6+

## Architecture

### CLI

```
main.go → cmd.Execute() → cmd/root.go
                              ↓
                    cmd/download.go (flags parsing)
                              ↓
                    downloader.New() → yt-dlp subprocess
                              ↓
                    record.Manager → JSON/CSV output files
```

### Desktop

```
Next.js App Router
    ↓
React Components (download-form, download-list, app-shell, app-sidebar)
    ↓
Zustand Stores (downloadStore, settingsStore)
    ↓
Tauri IPC (commands.rs → downloader.rs, database.rs)
    ↓
yt-dlp subprocess (via Tauri Rust backend)
```

## Key Modules

### CLI (vYtDL/)

- `cmd/root.go` - Cobra root command
- `cmd/download.go` - CLI flags, download orchestration, TUI coordination
- `internal/config/` - Loads `config.json` for yt-dlp binary path
- `internal/downloader/` - Core download logic, wraps yt-dlp as subprocess
- `internal/playliststate/` - Manages `.playlist_state.json` for resume
- `internal/record/` - Manages download_record and subtitle_mapping files
- `internal/tui/` - bubbletea-based terminal UI

### Desktop (vYtDL-desktop/)

- `apps/desktop/src/app/` - Next.js pages (home, settings, library, player)
- `apps/desktop/src/components/` - React components
- `apps/desktop/src/i18n/` - Internationalization (provider, hook, locale JSON files)
- `apps/desktop/src/store/` - Zustand stores
- `apps/desktop/src-tauri/src/` - Rust backend (commands, downloader, database)
- `packages/ui/` - Shared UI components
- `packages/utils/` - Shared utilities
- `scripts/` - Startup scripts (start-desktop.sh, start-desktop.ps1, start-desktop.py, vytdl-launcher.py)

### URL Extractor (url-extractor/)

- `manifest.json` - Chrome extension config (Manifest V3)
- `popup.html/js/css` - Extension popup UI
- `content.js` - Content script for URL extraction from YouTube pages

## Common Tasks

### Adding a New CLI Flag

1. Add flag variable in `cmd/download.go` init()
2. Add to `downloader.Options` struct
3. Pass through to yt-dlp in `internal/downloader/downloader.go`

### Adding a Desktop Feature

1. Add Rust command in `src-tauri/src/commands.rs`
2. Add frontend API call via `@tauri-apps/api`
3. Build React component in `src/components/`
4. Wire into Zustand store if state management needed
5. Add translation keys to all locale JSON files in `src/i18n/locales/`

### Adding a New Language

1. Create a new JSON file in `apps/desktop/src/i18n/locales/` (copy from `en.json`)
2. Translate all values
3. Import and register in `apps/desktop/src/i18n/index.tsx`
4. Add option in `apps/desktop/src/app/settings/page.tsx`

### Modifying Download Behavior

- CLI: Edit `internal/downloader/downloader.go`
- Desktop: Edit `src-tauri/src/downloader.rs`

## File Conventions

- Go files: standard Go formatting, no external formatters required
- TypeScript: ESLint + Prettier
- Test files: `*_test.go` (Go), `*.test.ts` (TypeScript)
- JSON config: simple key-value, no nested structures
- JSON locale files: nested object structure with dot-notation keys

## Shell Scripts

Located in `vYtDL/scripts/`:
- `download_video.sh` - Single video wrapper
- `download_collection.sh` - Playlist wrapper
- `build.sh` - Cross-build helper for macOS/Linux/Windows targets
- `build.ps1` - Cross-build helper for macOS/Linux/Windows targets on PowerShell

Located in `vYtDL-desktop/scripts/`:
- `start-desktop.sh` - Mac/Linux desktop startup
- `start-desktop.ps1` - Windows desktop startup
- `start-desktop.py` - Cross-platform desktop launcher
- `vytdl-launcher.py` - Python launcher (dev/build/clean/schedule)

Download wrapper scripts validate `yt-dlp`/`youtube-dl` availability before running.

## Known Issues

- yt-dlp must be installed separately and path configured in `config.json`
- YouTube may block anonymous requests; use `--cookies-from-browser` as workaround
- URL escaping issues were fixed; downloader normalizes input URLs
