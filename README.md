# vYtDL - YouTube Downloader Suite

A complete YouTube downloading toolkit with CLI, desktop app, web UI (Docker), and browser extension. Powered by yt-dlp.

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
- **Single, Batch, and Smart download modes**
- **Batch mode** — paste multiple URLs or import from `.txt` file
- **Smart mode** — batch download with automatic playlist detection
- Download queue with configurable concurrency (1-5 simultaneous downloads)
- Real-time download logs and progress tracking
- Download status persistence in SQLite database
- Retry failed downloads with one click
- Settings and configuration persistence
- AI-powered video summarization
- Multiple language support (English, 中文, 日本語)
- Cross-platform Python launcher script

### Web UI (Docker)
- Deploy as a web application via Docker Compose
- Same features as the desktop app, accessible from any browser
- Ideal for NAS, Raspberry Pi, and headless servers
- Real-time updates via WebSocket
- Persistent SQLite database and download storage

### URL Extractor (Chrome Extension)
- Extract video URLs from YouTube channel and playlist pages
- Filter by count, include/exclude keywords
- Export selected URLs to text file
- Batch download support

### ContentForge (CLI, in development)
- Scrape content from Twitter, YouTube, web, RSS
- AI processing: summarize, translate, analyze, Xiaohongshu conversion
- Pipeline presets for end-to-end workflows
- Go CLI + Python core engine

## Requirements

- **Go 1.24+** - For the CLI
- **Node.js 18+** and **pnpm** - For the desktop app
- **Rust** - For the Tauri desktop backend
- **yt-dlp** - Required by CLI and Desktop
- **Python 3.6+** - For cross-platform launcher and batch scripts
- **Docker & Docker Compose** - For the web UI (optional)

## Installation

### CLI

```bash
git clone https://github.com/qdriven/innate-vytdl.git vYtDL-standalone
cd vYtDL-standalone
GOWORK=off go build -o vYtDL .
```

### Desktop App

```bash
cd apps/vytdl-desktop
pnpm install
```

### Web UI (Docker)

```bash
# Start the web server
docker-compose up -d

# Access at http://localhost:3000
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

**Recommended (Task):**

```bash
task desktop:check    # verify Node / pnpm / Rust
task desktop:dev      # development mode
task desktop:build    # production build
task desktop:bundle   # build + installer
```

**Direct Python scripts (still supported):**

```bash
python3 scripts/build-desktop.py check
python3 scripts/build-desktop.py dev
python3 scripts/build-desktop.py build
python3 scripts/build-desktop.py bundle
```

### Web UI (Docker)

```bash
# Deploy
docker-compose up -d

# View logs
docker-compose logs -f vytdl-web

# Stop
docker-compose down
```

## Usage

See [USAGE.md](USAGE.md) for CLI usage. Project docs: [docs/README.md](docs/README.md) — architecture and per-module guides.

## Project Structure

```
├── apps/
│   ├── vytdl-desktop/         # Desktop app (Tauri + Next.js)
│   ├── vytdl-web/             # Web API server (Node.js, Docker)
│   └── contentforge-desktop/  # ContentForge desktop (Tauri + Next.js)
├── packages/
│   ├── contentforge-core/     # ContentForge Python core
│   ├── ui/                    # @vytdl/ui
│   └── utils/                 # @vytdl/utils
├── services/
│   └── agent-reach/           # Agent Reach (git submodule)
├── tools/
│   └── contentforge-cli/      # ContentForge Go CLI
├── vYtDL-standalone/          # vYtDL Go CLI (clone of qdriven/innate-vytdl)
├── extensions/
│   └── url-extractor/         # Chrome extension
├── scripts/                   # Build/startup scripts
├── docker-compose.yml
├── docs/                      # Architecture + module docs
└── tasks/                     # Task definitions
```

## License

MIT
