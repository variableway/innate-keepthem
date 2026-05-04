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

- GUI download form with URL input
- Format and quality selection
- Download progress tracking
- Download history/library view

### Cross-Platform

- macOS, Linux, and Windows support
- Native desktop integration via Tauri v2
- System tray and window management

### Settings

- yt-dlp binary path configuration
- Default download directory
- Quality and format preferences

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
