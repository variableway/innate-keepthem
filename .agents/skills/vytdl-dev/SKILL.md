---
name: vytdl-dev
description: |
  Development and maintenance guide for the vYtDL project — a YouTube/video downloader suite with Go CLI, Tauri v2 desktop app, Docker web UI, and Chrome extension.
  Use when working on:
  - Adding new download features or platform support
  - Modifying the desktop app frontend (Next.js/React) or Rust backend
  - Updating CLI flags or download behavior
  - Adding i18n languages or modifying UI components
  - Changing database schema or download queue logic
  - Building, bundling, or deploying any component
  - Working with yt-dlp integration, FFmpeg, or video processing
---

# vYtDL Development Skill

## Project Overview

vYtDL is a multi-component video downloader suite:

| Component | Tech Stack | Location |
|-----------|-----------|----------|
| CLI | Go 1.24+, Cobra, Bubble Tea TUI | **Canonical** `https://github.com/qdriven/innate-vytdl` — local checkout `vYtDL-standalone/` (skill: `vytdl-cli`). Old `vYtDL-standalone/` mirror removed. |
| Desktop | Tauri v2 (Rust), Next.js 15, React 19, TypeScript, Tailwind | `apps/vytdl-desktop/` |
| Web Server | Node.js, Express, WebSocket, better-sqlite3 | `apps/vytdl-web/` |
| Chrome Extension | Manifest V3, vanilla HTML/JS/CSS | `extensions/url-extractor/` |

External dependency: **yt-dlp** (called as subprocess). FFmpeg is optional (for audio extraction).

## Quick Reference

### Adding a New Rust IPC Command

1. Add command function in `src-tauri/src/commands.rs`
2. Register in `src-tauri/src/lib.rs` via `tauri::generate_handler!`
3. Add frontend API call via `apiInvoke()` in `src/lib/api-client.ts`
4. Add translation keys to all `src/i18n/locales/*.json`

### Adding a Desktop UI Feature

1. Add/modify React component in `src/components/`
2. Use `useTranslation()` hook for all user-facing strings
3. Add Zustand store state if needed (`src/store/`)
4. Call backend via `apiInvoke()` (not direct Tauri imports)
5. Update all three locale files: `en.json`, `zh.json`, `ja.json`

### Modifying Download Behavior

- **CLI**: `vYtDL-standalone/internal/downloader/downloader.go`
- **Desktop Rust**: `apps/vytdl-desktop/src-tauri/src/downloader.rs`
- **Web Server**: `apps/vytdl-web/src/downloader.ts`

### Database Schema

`downloads` table: id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, queue_position, options, created_at, updated_at.

`settings` table: key, value, updated_at.

Migrations are handled via `ALTER TABLE ... ADD COLUMN` in `database.rs::init()`.

## Architecture Details

See `references/architecture.md` for full dependency map and data flow.
See `references/components.md` for per-component development patterns.

## Related Skills

| Task | Skill |
|------|-------|
| CLI-only build / flags / multi-site download | `vytdl-cli` (standalone repo `.agents/skills/vytdl-cli`) |
| VTT subtitle AI analysis | `vtt-analyze` |
| ContentForge ingest/process/publish | `contentforge` |
| ContentForge pipeline presets | `contentforge-pipeline` |

Full index: [`_index.md`](../_index.md)

## Build Commands

```bash
# CLI
cd vYtDL && go build -o vYtDL .

# Desktop (Task — recommended)
task desktop:check
task desktop:dev
task desktop:build

# Desktop (Python script — equivalent)
python3 scripts/build-desktop.py dev

# Web (Docker)
docker-compose up -d
```

## Common Issues

- **yt-dlp not found**: Ensure yt-dlp is installed and in PATH, or set path in Settings
- **"state not managed" error**: A command is being called before `.manage()` in `lib.rs` setup
- **i18n missing key**: All locale JSON files must have the same keys
- **Tauri icon cache**: After changing icons, `cargo clean` and rebuild, then clear macOS icon cache
