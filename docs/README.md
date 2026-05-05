# vYtDL Documentation

Documentation for the vYtDL project - a YouTube downloader suite with CLI, desktop app, web UI (Docker), and Chrome extension.

## Contents

| Section | Description |
|---------|-------------|
| [Getting Started](quick-start/) | Install and run each component |
| [Features](features/) | Feature overview for CLI, Desktop, Web, and Extension |
| [Usage Guide](usage/) | Detailed usage instructions and examples |
| [Tips & Troubleshooting](tips/) | Common issues and solutions |
| [Technical Spec](spec/) | Architecture and technical details |
| [How-To Guide](how-to/) | AI-assisted development tutorial and setup |
| [yt-dlp & FFmpeg 手册](how-to/yt-dlp-ffmpeg-guide.md) | Video download and processing capabilities |
| [Agents](Agents.md) | AI agent context for codebase contributors |

## Project Components

- **vYtDL** - Go CLI for downloading YouTube videos and playlists
- **vYtDL Desktop** - Cross-platform desktop app (Tauri v2 + Next.js + React 19) with multi-language support
- **vYtDL Web** - Docker-deployable web UI for NAS and Raspberry Pi
- **URL Extractor** - Chrome extension for extracting video URLs from YouTube pages

## Recent Updates

- Added Docker Compose deployment for web UI
- Added download queue with configurable concurrency
- Added real-time download logs viewer
- Added retry functionality for failed downloads
- Added Japanese language support to the desktop app
- Added bundled yt-dlp binaries for all platforms
- Expanded i18n system with JSON-based language files
