# vYtDL - YouTube Downloader Suite

A complete YouTube downloading toolkit with CLI, desktop app, and browser extension. Powered by yt-dlp.

## Features

### CLI
- Single video or full playlist/collection download
- Format selection (mp4, webm, mkv, etc.)
- Quality selection (720p, 1080p, 2160p, etc.)
- Time-range clipping for downloading specific segments
- Automatic subtitle download (English and Chinese by default)
- Download tracking with JSON or CSV logs
- Subtitle-to-video mapping file generation
- Interactive TUI with live progress bars
- Playlist resume capability - continue interrupted downloads

### Desktop App
- Cross-platform GUI (macOS, Linux, Windows)
- Built with Tauri v2 + Next.js + React 19
- Download management and history library
- Settings and configuration persistence
- AI-powered video summarization
- Multiple language support (English, 中文, 日本語)
- Cross-platform Python launcher script

### URL Extractor (Chrome Extension)
- Extract video URLs from YouTube channel and playlist pages
- Filter by count, include/exclude keywords
- Export selected URLs to text file
- Batch download support

## Requirements

- **Go 1.24+** - For the CLI
- **Node.js 18+** and **pnpm** - For the desktop app
- **Rust** - For the Tauri desktop backend
- **yt-dlp** - Required by CLI and Desktop
- **Python 3.6+** - For cross-platform launcher and batch scripts

## Installation

### CLI

```bash
cd vYtDL
go build -o vYtDL .
```

### Desktop App

```bash
cd vYtDL-desktop
pnpm install
```

### Chrome Extension

1. Open Chrome, navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `url-extractor/` directory

## Quick Start

### CLI

```bash
# Download a single video
./vYtDL download --no-tui "https://www.youtube.com/watch?v=VIDEO_ID"

# Download a playlist
./vYtDL download --no-tui --playlist --output ./downloads "PLAYLIST_URL"
```

### Desktop App

```bash
cd vYtDL-desktop

# Check dependencies
python3 scripts/build-desktop.py check

# Development mode
python3 scripts/build-desktop.py dev

# Build production app
python3 scripts/build-desktop.py build

# Build + create distributable package
python3 scripts/build-desktop.py bundle
```

## Usage

See [USAGE.md](USAGE.md) for detailed CLI usage and [docs/](docs/) for full project documentation.

## Project Structure

```
├── vYtDL/                    # Go CLI application
├── vYtDL-desktop/            # Desktop app (Tauri + Next.js monorepo)
│   ├── apps/desktop/         # Desktop application
│   ├── packages/ui/          # Shared UI components
│   ├── packages/utils/       # Shared utilities
│   └── scripts/              # Startup scripts
├── url-extractor/            # Chrome extension
├── docs/                     # Documentation
└── tasks/                    # Task definitions (PRDs)
```

## License

MIT
