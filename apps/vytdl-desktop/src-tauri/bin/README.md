# Bundled yt-dlp Binaries

This directory is no longer the primary location for bundled yt-dlp binaries.

## Current Approach

yt-dlp binaries are now bundled as **Tauri resources** in:

```
src-tauri/resources/yt-dlp/
  macos/           — Apple Silicon (yt-dlp_macos + _internal/)
  windows-x86/     — Windows x86 (yt-dlp_x86.exe + _internal/)
  windows-arm64/   — Windows ARM64 (yt-dlp_arm64.exe + _internal/)
```

## How It Works

1. **Build-time**: `tauri.conf.json` bundles `resources/yt-dlp/` into the app
2. **Runtime**: On app startup, `lib.rs` extracts the platform-specific binary from resources to:
   - macOS: `~/Library/Application Support/com.vytdl.desktop/yt-dlp/yt-dlp`
   - Windows: `%APPDATA%/com.vytdl.desktop/yt-dlp/yt-dlp.exe`
   - Linux: `~/.local/share/com.vytdl.desktop/yt-dlp/yt-dlp`
3. **Execution**: `downloader.rs` checks `VYTLD_BUNDLED_YT_DLP` env var (set during extraction)

## yt-dlp Discovery Priority

1. User-configured path (Settings → yt-dlp path)
2. `YT_DLP_BIN` environment variable
3. **Bundled yt-dlp** (extracted from resources on first run)
4. System PATH (`which` / `where`)
5. Common installation paths (Homebrew, WinGet, etc.)
6. Error with OS-specific install hints

## Download Sources

Binaries are downloaded from:
https://github.com/yt-dlp/yt-dlp/releases/latest

The original zip files are stored in `../../../../vYtDL/bin/`.
