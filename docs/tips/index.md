# Tips & Troubleshooting

## yt-dlp Issues

### yt-dlp not found

Make sure yt-dlp is installed and the path in `config.json` is correct:

```bash
# Check if yt-dlp is in PATH
which yt-dlp

# Install yt-dlp
brew install yt-dlp          # macOS
pip install yt-dlp           # Python
winget install yt-dlp        # Windows
```

### YouTube blocks anonymous requests

Use cookie-based authentication:

```bash
./vYtDL download --no-tui \
  --cookies-from-browser chrome \
  --extractor-args "youtube:player_client=web,android" \
  --force-ipv4 \
  --socket-timeout 30 \
  --retries 10 \
  "VIDEO_URL"
```

### Slow downloads or timeouts

```bash
# Increase retries and timeout
./vYtDL download --no-tui \
  --retries 10 \
  --socket-timeout 30 \
  "VIDEO_URL"

# Use a proxy
./vYtDL download --no-tui \
  --proxy "http://proxy:port" \
  "VIDEO_URL"
```

## Desktop App Issues

### pnpm not found

```bash
# Install pnpm
npm install -g pnpm
```

### Rust not found

The Tauri desktop app requires Rust. Install it:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Build fails with Tauri errors

1. Ensure Rust is installed: `rustc --version`
2. Ensure all npm dependencies are installed: `pnpm install`
3. Clear and rebuild: `rm -rf node_modules && pnpm install`

### Language not changing

- Make sure you click **Save** after selecting a new language in Settings
- If the UI doesn't update, try restarting the app
- Language preference is stored in `localStorage` under the key `vytdl-language`

### Adding a new language

1. Create a new JSON file in `apps/desktop/src/i18n/locales/` (e.g., `es.json`)
2. Copy the structure from `en.json` and translate the values
3. Import the file in `apps/desktop/src/i18n/index.tsx` and add it to the `translations` map
4. Add the new locale option in `apps/desktop/src/app/settings/page.tsx`

## Chrome Extension Issues

### Extension cannot get video list

1. Make sure you are on a YouTube page (channel or playlist)
2. Refresh the page and try again
3. Check the browser console (F12) for errors

### Icons missing

Generate icons from the script:

```bash
cd url-extractor/icons
python generate_icons.py
```

## Playlist Resume

### Resume doesn't work

- Ensure the output directory is the same as the previous run
- The `.playlist_state.json` file must exist in the playlist directory
- Use `--reset-playlist-state` to start fresh if state is corrupted

### URL escaping issues

vYtDL automatically normalizes escaped URLs (e.g., `watch\?v\=` → `watch?v=`). If you still see issues, pass the URL in quotes.
