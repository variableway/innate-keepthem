# Usage Guide

## CLI Usage

### Basic Commands

```bash
# Download a single video
./vYtDL download --no-tui "https://www.youtube.com/watch?v=VIDEO_ID"

# Download to a specific directory
./vYtDL download --no-tui --output ./downloads "VIDEO_URL"

# Download with quality setting
./vYtDL download --no-tui --quality 1080 "VIDEO_URL"

# Download a time-range clip
./vYtDL download --no-tui --start 00:01:00 --end 00:02:30 "VIDEO_URL"
```

### Playlist Downloads

```bash
# Download a full playlist
./vYtDL download --no-tui --playlist --output ./downloads "PLAYLIST_URL"

# Resume an interrupted playlist (just re-run the same command)
./vYtDL download --no-tui --playlist --output ./downloads "PLAYLIST_URL"

# Start fresh (ignore saved state)
./vYtDL download --no-tui --playlist --reset-playlist-state --output ./downloads "PLAYLIST_URL"
```

### All CLI Flags

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
| `--playlist` | false | Download as playlist |
| `--reset-playlist-state` | false | Clear saved playlist state |
| `--yt-dlp-bin` | from config | Override yt-dlp binary path |
| `--proxy` | - | Proxy URL |
| `--cookies` | - | Cookie file path |
| `--cookies-from-browser` | - | Browser to extract cookies from |
| `--user-agent` | - | Custom user agent |
| `--extractor-args` | - | yt-dlp extractor arguments |
| `--retries` | - | Number of retries |
| `--socket-timeout` | - | Socket timeout in seconds |
| `--force-ipv4` | false | Force IPv4 |

### Shell Scripts

```bash
# Single video
./scripts/download_video.sh "VIDEO_URL" ./downloads [quality]

# Collection/Playlist
./scripts/download_collection.sh "PLAYLIST_URL" ./downloads [quality]
```

### Output Files

Each run generates:
- `download_record.json` or `.csv` - Download status log
- `subtitle_mapping.json` or `.csv` - Video-to-subtitle mapping
- `.playlist_state.json` - Playlist progress state (playlist mode only)

### Configuration

Edit `vYtDL/config.json`:

```json
{
  "yt_dlp_bin": "/opt/homebrew/bin/yt-dlp"
}
```

Use a custom config file:
```bash
VYTDL_CONFIG=/path/to/config.json ./vYtDL download --no-tui "VIDEO_URL"
```

## Desktop Usage

### Starting the App

**Cross-platform (recommended):**
```bash
cd vYtDL-desktop
python scripts/start-desktop.py
```

**Mac/Linux:**
```bash
cd vYtDL-desktop && ./scripts/start-desktop.sh
```

**Windows:**
```bash
cd vYtDL-desktop && .\scripts\start-desktop.ps1
```

### Batch Download

Switch to the **Batch** tab to download multiple videos at once:

1. Paste multiple URLs into the textarea, one per line
2. (Optional) Click **Import from file** to load URLs from a `.txt` file
3. Lines starting with `#` are treated as comments and ignored
4. Select quality, format, and subtitle options
5. Click **Download** — all URLs are added to the queue

The queue processes up to 3 downloads concurrently by default.

### Smart Download

Switch to the **Smart** tab for batch download with automatic playlist detection:

1. Paste URLs as in Batch mode
2. The app automatically detects playlist/channel URLs and enables playlist mode for them
3. Regular video URLs are treated as single downloads

### Building

```bash
cd vYtDL-desktop
pnpm tauri:build
```

### Download Queue

The desktop app supports downloading multiple videos simultaneously with a configurable queue:

1. **Queue Position** - Pending downloads show their position in the queue
2. **Max Concurrent** - Configure how many downloads run at once (Settings → Max Concurrent Downloads)
3. **Status Persistence** - All download states are saved to SQLite and survive app restarts
4. **Retry** - Failed or cancelled downloads can be retried with one click
5. **Cancel** - Active or queued downloads can be cancelled at any time

### Real-time Logs

Each download has a log viewer that shows:
- yt-dlp command output
- Progress updates
- Warnings and errors
- Auto-scrolls to the latest log

Toggle log view by clicking the chevron icon on any download item.

### Pages

- **Home** - Download form for entering URLs and selecting quality/format
- **Library** - View download history and manage downloaded files
- **Settings** - Configure yt-dlp path, download directory, preferences, language, and max concurrent downloads

### Changing Language

1. Open the **Settings** page from the sidebar
2. Scroll to the **Language** section
3. Select your preferred language: English, 中文, or 日本語
4. Click **Save** — the interface updates immediately

Language files are stored as JSON in `apps/desktop/src/i18n/locales/` and can be extended with new languages by adding a new JSON file and registering it in `apps/desktop/src/i18n/index.tsx`.

## Web Version (Docker) Usage

### Deploy with Docker Compose

```bash
# Start the web server
docker-compose up -d

# View logs
docker-compose logs -f vytdl-web

# Stop
docker-compose down
```

### Access the UI

Open `http://localhost:3000` in your browser.

### Download Management

The web UI provides the same features as the desktop app:
- Paste URLs and fetch video info
- Select quality, format, and subtitle options
- View download progress in real-time (via WebSocket)
- Manage download queue and history
- Retry failed downloads

### Data Persistence

Downloads are stored in two Docker volumes:
- `vytdl-downloads` - Downloaded video files
- `vytdl-data` - SQLite database with download records and settings

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `VYTDL_DB_PATH` | ./data/vytdl.db | SQLite database path |
| `VYTDL_OUTPUT_DIR` | ./downloads | Download output directory |
| `VYTDL_STATIC_DIR` | ./out | Static files directory |

## URL Extractor Usage

### Extracting URLs

1. Open a YouTube channel or playlist page in Chrome
2. Click the URL Extractor extension icon
3. Set filters if needed:
   - **First N videos** - Limit count
   - **Include keyword** - Only matching titles
   - **Exclude keyword** - Skip matching titles
4. Click **Get Video List**
5. Select/deselect individual videos
6. Click **Export Selected URLs** or **Export All URLs**
7. Save the text file

### Batch Download

```bash
# Basic
python batch_download.py urls.txt ./downloads

# With options
python batch_download.py urls.txt ./downloads --quality 1080 --format mp4

# Playlist mode
python batch_download.py urls.txt ./downloads --playlist
```

### URL File Format

```text
https://www.youtube.com/watch?v=VIDEO_ID_1
https://www.youtube.com/watch?v=VIDEO_ID_2
# Lines starting with # are comments
https://www.youtube.com/watch?v=VIDEO_ID_3
```
