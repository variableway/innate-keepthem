# Features

## CLI Features

### Download Modes

- **Single Video** - Download any YouTube video by URL
- **Playlist/Collection** - Download all videos in a playlist with one command
- **Time-Range Clipping** - Download specific segments using `--start` and `--end`

### Format & Quality

- Container formats: mp4, webm, mkv
- Quality presets: 720p, 1080p, 2160p, best
- Subtitle download with configurable languages

### Progress & Tracking

- **TUI Mode** - Interactive terminal UI with live progress bars
- **Plain Mode** - Simple text output with `--no-tui`
- **Download Records** - JSON or CSV logs of all downloads
- **Subtitle Mapping** - Maps videos to their subtitle files

### Playlist Resume

- Automatically tracks download progress in `.playlist_state.json`
- Resume interrupted downloads by running the same command again
- Reset state with `--reset-playlist-state`

### Network Recovery

- Cookie-based authentication (`--cookies-from-browser`)
- Custom user agent and proxy support
- Retry and timeout configuration
- Force IPv4 option

## Desktop Features

### Download Management

- GUI download form with URL input and auto-fetch video info
- Format and quality selection
- Real-time download progress tracking with speed and ETA
- Per-download log viewer with auto-scroll
- Download history/library view with status filtering
- Retry failed or cancelled downloads
- Open download folder directly from the app

### Download Queue

- FIFO queue system for multiple downloads
- Configurable max concurrent downloads (1-5, default: 3)
- Queue position display for pending downloads
- Automatic status persistence to SQLite database
- Cancel queued or active downloads
- Resume failed downloads with one click

### Cross-Platform

- macOS, Linux, and Windows support
- Native desktop integration via Tauri v2
- Single cross-platform launcher script (`start-desktop.py`)
- Bundled yt-dlp binaries for all platforms (no separate install needed)

### Web Version (Docker)

- Docker Compose deployment for NAS and Raspberry Pi
- Same web UI running in any modern browser
- WebSocket-based real-time progress updates
- Shared SQLite database for persistence
- Lightweight resource limits for low-power devices

### Settings

- yt-dlp binary path configuration
- Default download directory
- Quality and format preferences
- Subtitle language preferences
- Max concurrent downloads configuration
- AI provider configuration for video summarization

### Multiple Language Support

- Built-in internationalization (i18n) system
- JSON-based language files for easy extension
- Language selector in Settings
- Supported languages: English, 中文 (Chinese), 日本語 (Japanese)

## URL Extractor Features

### URL Extraction

- Extract all video URLs from YouTube channel pages
- Extract URLs from playlist pages
- Automatic video metadata collection (title, URL)

### Filtering

- Limit to first N videos
- Filter by title keyword (include)
- Exclude by title keyword

### Export & Batch Download

- Select individual videos or all
- Export URLs to text file
- Batch download via Python script with vYtDL
