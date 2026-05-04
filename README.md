# vYtDL - YouTube Downloader

A command-line YouTube video and playlist downloader built with Go, powered by yt-dlp.

## Features

- Single video or full playlist/collection download
- Format selection (mp4, webm, mkv, etc.)
- Quality selection (720p, 1080p, 2160p, etc.)
- Time-range clipping for downloading specific segments
- Automatic subtitle download (English and Chinese by default)
- Download tracking with JSON or CSV logs
- Subtitle-to-video mapping file generation
- Interactive TUI with live progress bars
- Playlist resume capability - continue interrupted downloads

## Requirements

- Go 1.24+
- yt-dlp (installed and accessible)

## Installation

Build from source:

```bash
cd vYtDL
go build -o vYtDL .
```

## Quick Start

Download a single video:

```bash
./vYtDL download --no-tui "https://www.youtube.com/watch?v=VIDEO_ID"
```

Download a playlist:

```bash
./vYtDL download --no-tui --playlist --output ./downloads "https://www.youtube.com/playlist?list=PLAYLIST_ID"
```

## Usage

### Single Video Download

```bash
./vYtDL download [flags] <url>
```

| Flag | Default | Description |
|------|---------|-------------|
| `-f, --format` | mp4 | Output container format |
| `-q, --quality` | best | Video quality (720, 1080, 2160) |
| `--start` | - | Clip start time (HH:MM:SS or seconds) |
| `--end` | - | Clip end time (HH:MM:SS or seconds) |
| `-o, --output` | . | Output directory |
| `--sub-langs` | en,zh | Comma-separated subtitle languages |
| `--no-subs` | false | Disable subtitle download |
| `--no-auto-subs` | false | Disable auto-generated subtitles |
| `--no-tui` | false | Disable TUI, print plain output |
| `--log-format` | json | Record format (json or csv) |

### Playlist Download

Add `--playlist` or `-p` flag to download all videos in a playlist:

```bash
./vYtDL download --no-tui --playlist --output ./downloads "PLAYLIST_URL"
```

Resume interrupted downloads by running the same command again. Use `--reset-playlist-state` to start fresh.

### Network Recovery Options

If YouTube blocks anonymous extraction:

```bash
./vYtDL download --no-tui \
  --cookies-from-browser chrome \
  --extractor-args "youtube:player_client=web,android" \
  --force-ipv4 \
  --socket-timeout 30 \
  --retries 10 \
  "VIDEO_URL"
```

## Shell Scripts

Two convenience scripts are provided in `vYtDL/scripts/`:

**Single video:**

```bash
./scripts/download_video.sh "VIDEO_URL" ./downloads [quality]
```

**Collection/Playlist:**

```bash
./scripts/download_collection.sh "PLAYLIST_URL" ./downloads [quality]
```

## Output Files

Each run generates:

- `download_record.json` or `.csv` - Download status log with success/failure info
- `subtitle_mapping.json` or `.csv` - Maps videos to their subtitle files
- `.playlist_state.json` - Playlist progress state (for resume capability)

## Configuration

Edit `vYtDL/config.json` to set the default yt-dlp binary path:

```json
{
  "yt_dlp_bin": "/path/to/yt-dlp"
}
```

Examples:

- macOS (Homebrew): `/opt/homebrew/bin/yt-dlp` or `/usr/local/bin/yt-dlp`
- Linux: `/usr/bin/yt-dlp` or `/usr/local/bin/yt-dlp`
- Windows 11: `C:\\Users\\<you>\\AppData\\Local\\Microsoft\\WinGet\\Links\\yt-dlp.exe`

You can also use a project-specific config file:

```bash
VYTDL_CONFIG=/absolute/path/to/config.json ./vYtDL download --no-tui "VIDEO_URL"
```

Override per-command with `--yt-dlp-bin`.

## Project Structure

```
vYtDL/
├── cmd/
│   ├── root.go        # CLI entry point
│   └── download.go    # Download command
├── internal/
│   ├── config/        # Configuration loading
│   ├── downloader/    # Core download logic
│   ├── playliststate/ # Playlist resume state
│   ├── record/        # Download record management
│   └── tui/           # Terminal UI
├── scripts/           # Shell script helpers
├── main.go            # Application entry
└── config.json        # Default configuration
```

## License

MIT
