# vYtDL Usage

## Quick Start

Build the binary:

```bash
cd vYtDL
go build -o vYtDL .
```

The default `yt-dlp` binary path is configured in `vYtDL/config.json`:

```json
{
  "yt_dlp_bin": "/Applications/ServBay/package/python/3.14/3.14.0b1/Python.framework/Versions/3.14/bin/yt-dlp"
}
```

If your local `yt-dlp` is somewhere else, edit `config.json`. You only need `--yt-dlp-bin` when you want to override that config for one command.

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
  "https://www.youtube.com/playlist?list=PL2C4A8A7A6F3A5D3C"
```

Collection download with custom quality and CSV logs:

```bash
./vYtDL download --no-tui \
  --playlist \
  --quality 720 \
  --log-format csv \
  --output ./downloads \
  "https://www.youtube.com/playlist?list=PL2C4A8A7A6F3A5D3C"
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
  "https://www.youtube.com/playlist?list=PL2C4A8A7A6F3A5D3C"
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
  "https://www.youtube.com/playlist?list=PL2C4A8A7A6F3A5D3C"
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
./scripts/download_collection.sh "https://www.youtube.com/playlist?list=PL2C4A8A7A6F3A5D3C" ./downloads
```

Collection with custom quality:

```bash
./scripts/download_collection.sh "https://www.youtube.com/playlist?list=PL2C4A8A7A6F3A5D3C" ./downloads 720
```

The shell script resume behavior is the same as the CLI. Re-run the same script command and it will continue from unfinished playlist items.
Both `download_video.sh` and `download_collection.sh` also check for `yt-dlp`/`youtube-dl` in PATH before running.

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

If YouTube blocks anonymous extraction, use the recovery flags from `help.md`:

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
