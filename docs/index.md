# vYtDL - YouTube Downloader Suite

A complete YouTube downloading toolkit: CLI, desktop app, web UI (Docker), and browser extension.

## Components

### vYtDL CLI

A command-line YouTube video and playlist downloader built with Go, powered by yt-dlp.

- Single video or full playlist download
- Format selection (mp4, webm, mkv)
- Quality selection (720p, 1080p, 2160p, best)
- Time-range clipping
- Automatic subtitle download
- Download tracking with JSON/CSV logs
- Interactive TUI with live progress bars
- Playlist resume capability

### vYtDL Desktop

A cross-platform desktop application built with Tauri v2, Next.js, React 19, and TypeScript.

- GUI for downloading videos and playlists
- Download queue with configurable concurrency (1-5 simultaneous downloads)
- Real-time download logs and progress tracking
- Download status persistence in SQLite database
- Retry failed downloads with one click
- Settings and configuration
- AI-powered video summarization
- Multiple language support (English, 中文, 日本語)
- Runs on macOS, Linux, and Windows
- Cross-platform Python launcher script

### vYtDL Web (Docker)

Deploy vYtDL as a web application using Docker Compose.

- Same web UI accessible from any browser
- Ideal for NAS, Raspberry Pi, and headless servers
- Real-time updates via WebSocket
- Persistent SQLite database and download storage
- Lightweight resource limits for low-power devices

### URL Extractor

A Chrome extension for extracting video URLs from YouTube pages.

- Extract URLs from channel pages and playlists
- Filter by count, include/exclude keywords
- Export selected URLs to text file
- Batch download support via Python script

## Quick Links

- [Getting Started](quick-start/)
- [Features](features/)
- [Usage Guide](usage/)
- [Tips & Troubleshooting](tips/)
- [Technical Spec](spec/)
