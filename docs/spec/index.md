# Technical Specifications

## Project Structure

```
innate-keepthem/
├── vYtDL/                    # Go CLI application
│   ├── main.go               # Application entry
│   ├── config.json            # Default configuration
│   ├── cmd/
│   │   ├── root.go           # CLI entry point
│   │   └── download.go       # Download command
│   ├── internal/
│   │   ├── config/           # Configuration loading
│   │   ├── downloader/       # Core download logic
│   │   ├── playliststate/    # Playlist resume state
│   │   ├── record/           # Download record management
│   │   └── tui/              # Terminal UI
│   └── scripts/              # Shell helper scripts
│
├── vYtDL-desktop/            # Desktop application (monorepo)
│   ├── package.json          # Root monorepo config
│   ├── pnpm-workspace.yaml   # Workspace configuration
│   ├── scripts/
│   │   ├── start-desktop.sh  # Mac/Linux startup script
│   │   ├── start-desktop.ps1 # Windows startup script
│   │   ├── start-desktop.py  # Cross-platform startup script
│   │   └── vytdl-launcher.py # Python launcher (dev/build/clean/schedule)
│   ├── apps/desktop/         # Desktop app
│   │   ├── src-tauri/        # Tauri v2 Rust backend
│   │   │   └── src/
│   │   │       ├── main.rs
│   │   │       ├── lib.rs
│   │   │       ├── commands.rs   # Tauri IPC commands
│   │   │       ├── downloader.rs # Download logic
│   │   │       └── database.rs   # SQLite storage
│   │   └── src/              # Next.js frontend
│   │       ├── app/          # App Router pages
│   │       ├── components/   # React components
│   │       ├── i18n/         # Internationalization
│   │       │   ├── index.tsx # I18n provider & hook
│   │       │   └── locales/  # JSON language files
│   │       ├── store/        # Zustand stores
│   │       ├── lib/          # Utilities
│   │       └── types/        # TypeScript types
│   └── packages/
│       ├── ui/               # Shared UI components
│       └── utils/            # Shared utilities
│
├── url-extractor/            # Chrome extension
│   ├── manifest.json         # Manifest V3 config
│   ├── popup.html/js/css     # Extension popup
│   ├── content.js            # Content script
│   └── icons/                # Extension icons
│
├── docs/                     # Documentation
├── tasks/                    # Task definitions (PRDs)
├── AGENTS.md                 # AI agent context
├── README.md                 # Project overview
└── USAGE.md                  # Detailed CLI usage
```

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| CLI | Go | 1.24+ |
| CLI Framework | spf13/cobra | - |
| TUI | charmbracelet/bubbletea | - |
| Desktop Frontend | Next.js + React | 19 |
| Desktop Shell | Tauri | v2 |
| Desktop Backend | Rust | - |
| Language | TypeScript | 5.6+ |
| Styling | Tailwind CSS | v4 |
| Package Manager | pnpm | 9.0+ |
| Extension | Chrome Manifest V3 | - |
| External Tool | yt-dlp | - |

## Data Formats

### Download Record (JSON)

```json
{
  "url": "https://youtube.com/watch?v=...",
  "title": "Video Title",
  "output_path": "/downloads/video.mp4",
  "success": true,
  "error": "",
  "started_at": "2026-01-01T00:00:00Z",
  "finished_at": "2026-01-01T00:05:00Z",
  "duration_seconds": 300
}
```

### Playlist State

```json
{
  "playlist_title": "My Playlist",
  "items": [
    {
      "url": "https://youtube.com/watch?v=...",
      "title": "Video Title",
      "status": "succeeded",
      "attempts": 1,
      "last_error": "",
      "last_filename": "video.mp4"
    }
  ]
}
```

States: `pending`, `running`, `succeeded`, `failed`

### Subtitle Mapping

```json
{
  "video_id": "abc123",
  "video_title": "Video Title",
  "video_path": "/downloads/video.mp4",
  "subtitle_files": [
    "/downloads/video.en.srt",
    "/downloads/video.zh.srt"
  ]
}
```

### Language File (JSON)

Translation files use a flat nested-key structure:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel"
  },
  "home": {
    "title": "Download",
    "subtitle": "Download videos from YouTube and more"
  }
}
```

Looked up via dot-notation keys (e.g., `t("home.title")`).

## IPC Communication (Desktop)

The desktop app uses Tauri's IPC system:

1. Frontend calls `invoke('command_name', { args })` via `@tauri-apps/api`
2. Tauri routes to the matching Rust function in `commands.rs`
3. Rust function executes (e.g., spawns yt-dlp, queries database)
4. Result is returned to the frontend

## State Management (Desktop)

- **downloadStore** (Zustand) - Tracks active downloads, progress, history
- **settingsStore** (Zustand) - User preferences, yt-dlp config
- **Tauri Storage** - Persistent storage adapter for settings

## Internationalization (Desktop)

- **I18nProvider** - React context providing locale state and `t()` translator
- **useTranslation** - Hook for accessing locale, `setLocale`, and `t()`
- **locales/** - JSON translation files per language
- **Persistence** - Selected language saved to `localStorage` (`vytdl-language`)
- **HTML lang attr** - Updated dynamically to match selected locale
