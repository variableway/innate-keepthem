# vYtDL Usage

## Quick Start

### CLI

Build the binary:

```bash
cd vYtDL
go build -o vYtDL .
```

The default `yt-dlp` binary path is configured in `vYtDL/config.json`:

```json
{
  "yt_dlp_bin": "/opt/homebrew/bin/yt-dlp"
}
```

Common `yt_dlp_bin` values:

- macOS: `/opt/homebrew/bin/yt-dlp` or `/usr/local/bin/yt-dlp`
- Linux: `/usr/bin/yt-dlp` or `/usr/local/bin/yt-dlp`
- Windows 11: `C:\\Users\\<you>\\AppData\\Local\\Microsoft\\WinGet\\Links\\yt-dlp.exe`

You can also load config from a custom file path:

```bash
VYTDL_CONFIG=/absolute/path/to/config.json ./vYtDL download --no-tui "VIDEO_URL"
```

Before any download starts, the CLI now validates that the configured yt-dlp binary is resolvable and prints install hints when missing.

## Single Video

Download one video into the current directory:

```bash
./vYtDL download --no-tui "https://www.youtube.com/watch?v=VIDEO_ID"
```

Download one video to a target folder with 1080p quality:

```bash
./vYtDL download --no-tui \
  --output ./downloads \
  --quality 1080 \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

Download a clip from a time range:

```bash
./vYtDL download --no-tui \
  --start 00:01:00 \
  --end 00:02:30 \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

## Collection Download

Download a full YouTube playlist or collection:

```bash
./vYtDL download --no-tui \
  --playlist \
  --output ./downloads \
  "https://www.youtube.com/playlist?list=PLAYLIST_ID"
```

Collection download with custom quality and CSV logs:

```bash
./vYtDL download --no-tui \
  --playlist \
  --quality 720 \
  --log-format csv \
  --output ./downloads \
  "https://www.youtube.com/playlist?list=PLAYLIST_ID"
```

What happens:

- `./downloads` is the root output directory.
- The playlist title becomes a subdirectory under `./downloads`.
- Each video is downloaded one by one into that playlist directory.
- `download_record.json` or `download_record.csv` is written in the output root.
- `subtitle_mapping.json` or `subtitle_mapping.csv` is written in the output root.

## Resume Solution For Playlist Downloads

Playlist resume is now built in.

The implementation works like this:

- vYtDL fetches the full playlist entry list first.
- It creates a state file named `.playlist_state.json` inside the playlist directory.
- Each video is tracked with a status: `pending`, `running`, `succeeded`, or `failed`.
- Downloads are executed one by one.
- After each item finishes, the state file is updated immediately.
- On the next run with the same playlist URL and output directory, already successful items are skipped and only unfinished or failed items are retried.

Resume example:

```bash
./vYtDL download --no-tui \
  --playlist \
  --output ./downloads \
  "https://www.youtube.com/playlist?list=PLAYLIST_ID"
```

If the run stops halfway, just run the exact same command again. vYtDL will resume from the remaining failed or unfinished items.

State file example location:

```text
./downloads/My Playlist/.playlist_state.json
```

Start the playlist from scratch and ignore the saved state:

```bash
./vYtDL download --no-tui \
  --playlist \
  --reset-playlist-state \
  --output ./downloads \
  "https://www.youtube.com/playlist?list=PLAYLIST_ID"
```

## Shell Scripts

Single video:

```bash
./scripts/download_video.sh "https://www.youtube.com/watch?v=VIDEO_ID" ./downloads
```

Single video with custom quality:

```bash
./scripts/download_video.sh "https://www.youtube.com/watch?v=VIDEO_ID" ./downloads 720
```

Collection:

```bash
./scripts/download_collection.sh "https://www.youtube.com/playlist?list=PLAYLIST_ID" ./downloads
```

Collection with custom quality:

```bash
./scripts/download_collection.sh "https://www.youtube.com/playlist?list=PLAYLIST_ID" ./downloads 720
```

The shell script resume behavior is the same as the CLI. Re-run the same script command and it will continue from unfinished playlist items.
Both `download_video.sh` and `download_collection.sh` also check for `yt-dlp`/`youtube-dl` in PATH before running.

## Desktop App

### Start in Development Mode

Cross-platform (recommended):

```bash
cd vYtDL-desktop
python scripts/start-desktop.py
```

Platform-specific:

```bash
./scripts/start-desktop.sh       # Mac/Linux
.\scripts\start-desktop.ps1      # Windows
```

### Build for Production

```bash
cd vYtDL-desktop
pnpm tauri:build
```

### Download Queue

The desktop app supports downloading multiple videos simultaneously with a configurable queue:

- **Queue Position** — Pending downloads show their position in the queue
- **Max Concurrent** — Configure how many downloads run at once (Settings → Max Concurrent Downloads, default: 3)
- **Status Persistence** — All download states are saved to SQLite and survive app restarts
- **Retry** — Failed or cancelled downloads can be retried with one click
- **Cancel** — Active or queued downloads can be cancelled at any time
- **Real-time Logs** — Toggle log viewer on any download to see yt-dlp output

### Changing Language

Open **Settings** and select your preferred language from the **Language** dropdown. Supported languages:
- English
- 中文 (Chinese)
- 日本語 (Japanese)

## Web UI (Docker)

Deploy vYtDL as a web application using Docker Compose:

```bash
# Start the web server
docker-compose up -d

# Access at http://localhost:3000
```

### Configuration

Edit `docker-compose.yml` to customize ports and volumes:

```yaml
services:
  vytdl-web:
    ports:
      - "3000:3000"
    volumes:
      - ./downloads:/app/downloads
      - vytdl-data:/app/data
```

### For Raspberry Pi / ARM

The Dockerfile uses `node:20-slim` which supports multi-arch builds. Docker will automatically pull the correct architecture image.

```bash
docker-compose build
docker-compose up -d
```

## Output Files

Each run writes two main files to the chosen output directory:

- `download_record.json` or `download_record.csv`
- `subtitle_mapping.json` or `subtitle_mapping.csv`

For playlist runs, vYtDL also writes:

- `.playlist_state.json` inside the playlist directory

The download record includes:

- whether the download succeeded
- failure reason when it did not
- source URL
- output path
- timestamps and duration

The subtitle mapping includes:

- video id
- video title
- video file path
- subtitle file paths

The playlist state file includes:

- full playlist queue
- per-video status
- attempt count
- last error
- last finished filename

## Recovery Options

If YouTube blocks anonymous extraction, use the recovery flags:

```bash
./vYtDL download --no-tui \
  --cookies-from-browser chrome \
  --extractor-args "youtube:player_client=web,android" \
  --force-ipv4 \
  --socket-timeout 30 \
  --retries 10 \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

Supported passthrough flags:

- `--yt-dlp-bin`
- `--proxy`
- `--cookies`
- `--cookies-from-browser`
- `--user-agent`
- `--extractor-args`
- `--retries`
- `--socket-timeout`
- `--force-ipv4`

## Known Fix

The original failure log used an escaped URL:

```text
https://www.youtube.com/watch\?v\=EBWTRvjZ1dw
```

The downloader now normalizes that input automatically to:

```text
https://www.youtube.com/watch?v=EBWTRvjZ1dw
```
