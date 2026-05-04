# Auto-Download Daily Watch History (with Page Agent)

## User Scenario
> "I watch videos on my phone as usual, open the desktop app at the end of the day, and all videos I watched are automatically downloaded"

## Can Page Agent Help?

### Short Answer: **Partially, with limitations**

Page Agent alone **CANNOT** access mobile app data due to iOS/Android sandboxing. However, we can build a hybrid solution.

---

## Solution Architecture

### Option 1: Browser-Based (Most Feasible) ⭐

**How it works:**
```
User watches on Mobile Browser (with Page Agent)
                    ↓
        Page Agent records every video watched
                    ↓
        Sync to Cloud/Local API
                    ↓
    Desktop App polls API → Downloads videos
```

**Implementation:**

```javascript
// Page Agent script injected in mobile browser
const pageAgent = new PageAgent({
    model: 'gpt-4',
    apiKey: '...',
    onAction: async (action) => {
        // Detect when user watches a video
        if (action.type === 'WATCH_VIDEO') {
            const videoInfo = {
                url: window.location.href,
                title: document.title,
                platform: detectPlatform(),
                watchedAt: new Date().toISOString(),
                device: 'mobile-browser'
            };
            
            // Send to sync server
            await fetch('https://api.vytdl.local/watch-history', {
                method: 'POST',
                body: JSON.stringify(videoInfo),
                headers: { 'Authorization': userToken }
            });
        }
    }
});

// Auto-detect video watched
setInterval(async () => {
    const videoPlayer = document.querySelector('video');
    if (videoPlayer && videoPlayer.currentTime > 10) {
        // User watched more than 10 seconds
        const videoData = extractVideoData();
        await pageAgent.execute(`Record video: ${JSON.stringify(videoData)}`);
    }
}, 5000);
```

**Limitation:** 
- ❌ Only works if user watches in **browser**, not native app
- ❌ iOS Safari extensions limited

---

### Option 2: Desktop Browser Mirror (Page Agent + Tauri)

**How it works:**
```
Desktop App (Tauri) 
    ↓
Embeds WebView with Page Agent
    ↓
User logs into YouTube/Bilibili in desktop browser
    ↓
Page Agent monitors browsing history
    ↓
At end of day: Auto-download all watched videos
```

**Implementation:**

```rust
// Tauri main.rs
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            start_page_agent_monitor,
            get_daily_watch_history,
            download_watched_videos
        ])
        .setup(|app| {
            // Create WebView for Page Agent
            let webview = app.handle()
                .create_window(
                    "page-agent",
                    tauri::WindowUrl::External("https://youtube.com".parse().unwrap()),
                )
                .unwrap();
            
            // Inject Page Agent script
            webview.eval(r#"
                // Inject Page Agent
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/page-agent@latest/dist/iife/page-agent.js';
                document.head.appendChild(script);
                
                // Monitor video watching
                window.addEventListener('load', () => {
                    const agent = new PageAgent({
                        model: 'local', // Use local model if available
                        onVideoWatch: (data) => {
                            // Send to Tauri backend
                            window.__TAURI__.invoke('record_video_watch', {
                                url: data.url,
                                title: data.title,
                                timestamp: Date.now()
                            });
                        }
                    });
                });
            "#).unwrap();
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap();
}

#[tauri::command]
async fn get_daily_watch_history(
    state: State<'_, AppState>,
) -> Result<Vec<WatchRecord>, String> {
    let today = Local::now().date_naive();
    
    let records = sqlx::query_as::<_, WatchRecord>(
        "SELECT * FROM watch_history WHERE date(watched_at) = ? ORDER BY watched_at DESC"
    )
    .bind(today)
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(records)
}

#[tauri::command]
async fn download_watched_videos(
    state: State<'_, AppState>,
) -> Result<DownloadReport, String> {
    // 1. Get today's watch history
    let videos = get_daily_watch_history(state.clone()).await?;
    
    // 2. Filter out already downloaded
    let to_download: Vec<_> = videos
        .into_iter()
        .filter(|v| !v.is_downloaded)
        .collect();
    
    // 3. Queue downloads
    let mut report = DownloadReport::default();
    
    for video in to_download {
        match download_video(&video.url).await {
            Ok(_) => report.success += 1,
            Err(e) => {
                report.failed += 1;
                report.errors.push(format!("{}: {}", video.title, e));
            }
        }
    }
    
    Ok(report)
}
```

**Limitation:**
- ❌ User must use **desktop browser** within Tauri app
- ❌ Cannot sync with actual mobile usage

---

### Option 3: Page Agent MCP Server (Most Advanced)

Page Agent recently added MCP (Model Context Protocol) Server support. This allows external control.

**Architecture:**
```
Mobile Phone
    ↓ (User watches videos normally)
Desktop App (Tauri)
    ↓ (Runs MCP Client)
Page Agent MCP Server
    ↓ (Controls browser)
Headless Browser (Chrome)
    ↓ (Logs into YouTube)
YouTube Web
    ↓
Extract Watch History
    ↓
Download Videos
```

**Implementation:**

```typescript
// Desktop app uses Page Agent MCP
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@page-agent/mcp-server']
});

const client = new Client(
    { name: 'vytdl-desktop', version: '1.0.0' },
    { capabilities: { prompts: {}, resources: {}, tools: {} } }
);

await client.connect(transport);

// Tool: Get YouTube watch history
const result = await client.callTool({
    name: 'page_agent_execute',
    arguments: {
        url: 'https://www.youtube.com/feed/history',
        instruction: 'Extract all video URLs from the watch history page. Scroll down to load more. Return as JSON array with {title, url, channel, watchedAt}',
        headless: false // Show browser for user to login
    }
});

const watchHistory = JSON.parse(result.content[0].text);

// Download each video
for (const video of watchHistory) {
    await invoke('start_download', { url: video.url });
}
```

**User Flow:**
```
1. User opens Desktop App
2. Clicks "Sync Today's Watch History"
3. App opens browser via Page Agent
4. User logs into YouTube (if not already)
5. Page Agent navigates to youtube.com/feed/history
6. Extracts all video URLs from today
7. Downloads them one by one
8. Shows progress and completion report
```

**Limitation:**
- ❌ Requires MCP Server setup
- ❌ User must have Chrome installed
- ❌ Manual login required (but only once per session)

---

## The Real Problem: Mobile Native Apps

**None of these solutions work if user watches in native YouTube/Bilibili apps!**

### Why:
```
iOS Architecture:
┌─────────────────┐  ┌─────────────────┐
│   YouTube App   │  │   Safari        │
│   (Sandboxed)   │  │   (Sandboxed)   │
└────────┬────────┘  └────────┬────────┘
         │                    │
         └────────┬───────────┘
                  ▼
         ┌─────────────────┐
         │   iOS Kernel    │  ← No access without jailbreak
         └─────────────────┘
```

### Workaround: Force Browser Usage

**Option A: Browser Extension Prompt**
```
📱 To sync mobile watch history:

1. Install Firefox Mobile (supports extensions)
2. Install vYtDL Sync Extension
3. Watch videos in Firefox
4. History auto-syncs to desktop
```

**Option B: Share Sheet Integration**
```
Mobile YouTube App
    ↓
Share → "Copy Link" or "Share to vYtDL"
    ↓
vYtDL Mobile Web App (PWA)
    ↓
Cloud Sync
    ↓
Desktop App
```

---

## Recommended Solution: Hybrid Approach

### Phase 1: Desktop Browser Sync (Page Agent + MCP)

**Target:** Users who watch on desktop or can switch to desktop browser

```rust
// Daily sync button
#[tauri::command]
pub async fn sync_daily_history() -> Result<SyncReport, String> {
    // 1. Launch Page Agent MCP
    let mcp = PageAgentMcp::new().await?;
    
    // 2. Open YouTube history
    let history = mcp.extract_watch_history().await?;
    
    // 3. Filter today's videos
    let today_videos: Vec<_> = history
        .into_iter()
        .filter(|v| v.watched_at.date() == Local::now().date_naive())
        .collect();
    
    // 4. Download queue
    let report = SyncReport {
        found: today_videos.len(),
        new: 0,
        downloaded: 0,
    };
    
    for video in today_videos {
        if !is_already_downloaded(&video.url).await {
            queue_download(video.url).await?;
            report.new += 1;
        }
    }
    
    Ok(report)
}
```

**UI:**
```
┌──────────────────────────────────────────────┐
│  📱 Sync Watch History                       │
├──────────────────────────────────────────────┤
│                                              │
│  [🔄 Sync Today's History]                   │
│                                              │
│  This will:                                  │
│  1. Open browser                             │
│  2. Navigate to YouTube/Bilibili history     │
│  3. Extract videos watched today             │
│  4. Download them automatically              │
│                                              │
│  ⚠️ Login required on first sync             │
│                                              │
├──────────────────────────────────────────────┤
│  📊 Today's Summary                          │
│  Found: 12 videos                            │
│  New: 3 videos                               │
│  Downloaded: 3/3 ✅                          │
│                                              │
│  [View Downloads] [Open Download Folder]     │
└──────────────────────────────────────────────┘
```

### Phase 2: Browser Extension (Mobile + Desktop)

**For users who want true mobile sync:**
- Firefox Mobile supports extensions
- Extension tracks all watched videos
- Syncs via cloud or local network
- Desktop app downloads from sync queue

### Phase 3: Manual Mobile Share (Fallback)

**Simplest for most users:**
- Mobile share sheet → "Send to vYtDL"
- Desktop app receives URL
- Auto-downloads

---

## Technical Feasibility Matrix

| Approach | Mobile Native App | Mobile Browser | Desktop Browser | Complexity |
|----------|------------------|----------------|-----------------|------------|
| Page Agent MCP | ❌ No | ✅ Yes | ✅ Yes | High |
| Page Agent in Tauri | ❌ No | ❌ No | ✅ Yes | Medium |
| Browser Extension | ❌ No | ✅ Yes | ✅ Yes | Medium |
| Google Takeout | ✅ Yes | ✅ Yes | ✅ Yes | Low |
| Share Sheet | ✅ Yes | ✅ Yes | ✅ Yes | Low |

---

## Conclusion

### Can Page Agent view mobile watch history?
**NO** - Not if user watches in native apps (iOS/Android sandbox prevents this)

### Can we build the desired experience?
**YES - Partially:**
1. Desktop browser usage → Page Agent can track ✅
2. Mobile browser usage → Browser extension can track ✅
3. Mobile native apps → Require manual share or Google Takeout ⚠️

### Best Real-World Solution:

**"Daily Sync" Button in Desktop App:**
1. Click button → Opens browser via Page Agent MCP
2. Auto-navigates to YouTube/Bilibili history
3. Extracts today's watched videos
4. Downloads them automatically
5. Shows summary report

**For mobile-only users:**
- Share to desktop via QR code / local sync
- Or use browser with extension

**Would you like me to implement the Page Agent MCP integration for desktop browser sync?**
