# Getting Started

## Prerequisites

- **yt-dlp** - Required by both CLI and Desktop. Install via your package manager:
  - macOS: `brew install yt-dlp`
  - Linux: `pip install yt-dlp` or `sudo apt install yt-dlp`
  - Windows: `winget install yt-dlp`
- **Go 1.24+** - For building the CLI
- **Node.js 18+** and **pnpm** - For the desktop app
- **Rust** - For the Tauri desktop backend
- **Python 3.6+** - For the URL extractor batch download script

## vYtDL CLI

### Build

```bash
cd vYtDL
go build -o vYtDL .
```

### Configure

Edit `vYtDL/config.json` to set your yt-dlp binary path:

```json
{
  "yt_dlp_bin": "/opt/homebrew/bin/yt-dlp"
}
```

Common paths:
- macOS: `/opt/homebrew/bin/yt-dlp` or `/usr/local/bin/yt-dlp`
- Linux: `/usr/bin/yt-dlp` or `/usr/local/bin/yt-dlp`
- Windows: `C:\\Users\\<you>\\AppData\\Local\\Microsoft\\WinGet\\Links\\yt-dlp.exe`

### Run

```bash
# Download a single video
./vYtDL download --no-tui "https://www.youtube.com/watch?v=VIDEO_ID"

# Download a playlist
./vYtDL download --no-tui --playlist --output ./downloads "PLAYLIST_URL"

# With quality and format options
./vYtDL download --no-tui --quality 1080 --format mp4 --output ./downloads "VIDEO_URL"
```

## vYtDL Desktop

### Install Dependencies

```bash
cd vYtDL-desktop
pnpm install
```

### Run in Development Mode

**Mac/Linux:**
```bash
./scripts/start-desktop.sh
```

**Windows:**
```powershell
.\scripts\start-desktop.ps1
```

**Or manually:**
```bash
cd vYtDL-desktop
pnpm tauri:dev
```

### Build for Production

```bash
cd vYtDL-desktop
pnpm tauri:build
```

## URL Extractor (Chrome Extension)

### Install

1. Open Chrome, navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `url-extractor/` directory

### Use

1. Navigate to a YouTube channel or playlist page
2. Click the extension icon in the toolbar
3. Set filters (count, include/exclude keywords)
4. Click **Get Video List**
5. Select videos and export URLs
6. Use the batch download script or vYtDL CLI to download
