# vYtDL Architecture Reference

## Data Flow

### CLI Mode
```
main.go → cmd/root.go → cmd/download.go
                              ↓
                    internal/downloader/ (yt-dlp subprocess)
                              ↓
                    internal/record/ (JSON/CSV logs)
                    internal/tui/ (bubbletea progress UI)
```

### Desktop Mode
```
Next.js App Router
    ↓
React Components
    ↓
Zustand Stores (downloadStore, settingsStore)
    ↓
api-client.ts (Tauri IPC ↔ HTTP abstraction)
    ↓
Tauri IPC → commands.rs → queue.rs → downloader.rs
    ↓
yt-dlp subprocess
    ↓
SQLite Database (downloads + settings)
```

### Web/Docker Mode
```
Browser → Next.js Static Build (Express-served)
    ↓
HTTP API / WebSocket (Express)
    ↓
Queue Manager → downloader.ts → yt-dlp subprocess
    ↓
SQLite Database
```

## Key File Mapping

| Task | CLI | Desktop Rust | Desktop Frontend | Web Server |
|------|-----|-------------|------------------|------------|
| Download video | `internal/downloader/` | `src/downloader.rs` | N/A | `src/downloader.ts` |
| Queue management | N/A | `src/queue.rs` | `downloadStore.ts` | `src/queue.ts` |
| Database | JSON/CSV files | `src/database.rs` | via API | `src/database.ts` |
| Settings | `config.json` | `src/database.rs` settings table | `settingsStore.ts` | `src/database.ts` |
| Progress events | TUI live update | Tauri events | `apiListen()` | WebSocket |

## API Client Abstraction

`api-client.ts` provides unified interface:

- `apiInvoke(command, args)` → Tauri `invoke()` or HTTP POST `/api/{command}`
- `apiListen(event, handler)` → Tauri `listen()` or WebSocket
- `apiConfirm(message)` → Tauri dialog or native `confirm()`

This allows the same Next.js frontend to run in both Tauri desktop and Docker web contexts.

## Download Queue System

### Rust Queue (`queue.rs`)
- `QueueManager` spawns background Tokio task
- `VecDeque` for pending, `HashMap` for active
- Configurable `max_concurrent` (default 3, range 1-10)
- FIFO with `queue_position` persisted to SQLite
- Cancellation via `tokio::sync::mpsc` channel

### Web Queue (`web-server/src/queue.ts`)
- `QueueManager` with `Map` of active and array of pending
- Configurable `maxConcurrent` (default 3)
- WebSocket broadcast for real-time updates

## i18n System

- Locale files: `src/i18n/locales/{en,zh,ja}.json`
- Nested object structure with dot-notation keys
- `useTranslation()` hook resolves keys like `downloadList.statusCompleted`
- Default language: Chinese (`zh`)

## Technology Versions

| Component | Version |
|-----------|---------|
| Go | 1.24+ |
| Tauri | 2.10.3 |
| Next.js | 15+ |
| React | 19 |
| TypeScript | 5.x |
| Tailwind CSS | 3.x |
| Node.js | 18+ |
| pnpm | 8+ |
| yt-dlp | latest |
| FFmpeg | optional |
