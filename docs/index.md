# vYtDL - YouTube Downloader Suite

A complete YouTube downloading toolkit: CLI, desktop app, and browser extension.

## Components

### vYtDL CLI

A command-line YouTube video and playlist downloader built with Go, powered by yt-dlp.

- Single video or full playlist download
- Format selection (mp4, webm, mkv)
- Quality selection (720p, 1080p, 2160p)
- Time-range clipping
- Automatic subtitle download
- Download tracking with JSON/CSV logs
- Interactive TUI with live progress bars
- Playlist resume capability

### vYtDL Desktop

A cross-platform desktop application built with Tauri v2, Next.js, React 19, and TypeScript.

- GUI for downloading videos and playlists
- Download management and history
- Settings and configuration
- Runs on macOS, Linux, and Windows

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
