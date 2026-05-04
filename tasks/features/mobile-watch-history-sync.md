# Feature: Sync Mobile Watch History for Download

## Overview
Allow users to download videos they've watched on their mobile devices (YouTube, Bilibili, etc.).

## Why It's Challenging

| Challenge | Reason |
|-----------|--------|
| **iOS Sandboxing** | Apps can't access Safari/YouTube app data |
| **Android Restrictions** | Limited access to other apps' data |
| **Privacy** | Watch history is sensitive user data |
| **Platform APIs** | YouTube API has quotas and restrictions |

## Possible Solutions

### Solution 1: Cookie Export/Import ⭐ (Recommended)

**How it works:**
1. User exports cookies from mobile browser
2. Transfers to desktop (AirDrop, email, cloud)
3. Desktop app imports cookies
4. yt-dlp accesses YouTube watch history

**Implementation:**

```rust
// Tauri command
#[tauri::command]
pub async fn import_mobile_cookies(
    cookie_file: String,
) -> Result<ApiResponse<Vec<Video>>, String> {
    // 1. Parse cookie file (Netscape format)
    let cookies = parse_cookie_file(&cookie_file)?;
    
    // 2. Use yt-dlp to fetch watch history
    let output = Command::new("yt-dlp")
        .args(&[
            "--cookies", &cookie_file,
            "--dump-json",
            "--flat-playlist",
            "https://www.youtube.com/feed/history"
        ])
        .output()
        .await?;
    
    // 3. Parse video list
    let videos = parse_yt_dlp_output(&output.stdout)?;
    
    Ok(ApiResponse::ok(videos))
}
```

**User Flow:**
```
Mobile Browser → Export Cookies → Send to PC → Import → Select Videos → Download
```

**Pros:**
- Works for all platforms (YouTube, Bilibili, etc.)
- No API keys needed
- Full privacy (data never leaves user's devices)

**Cons:**
- Manual cookie export process
- Cookies expire (need periodic re-export)
- Technical for average users

**Mobile Cookie Export Methods:**

**iOS:**
- Safari: Settings → Advanced → Experimental Features → Cookie Export (not available)
- Alternative: Use "Cookies" app from App Store
- Or: Use Shortcuts app to extract cookies (limited)

**Android:**
- Kiwi Browser: Built-in cookie export
- Firefox: about:config → export cookies
- Chrome: Requires root or ADB

---

### Solution 2: Google Takeout Integration

**How it works:**
1. User requests YouTube watch history export from Google Takeout
2. Google emails download link (ZIP file)
3. Desktop app imports the JSON watch history
4. App extracts video URLs and metadata

**Implementation:**

```typescript
// Frontend
async function importGoogleTakeout(zipFile: File) {
  // 1. Unzip file
  const files = await unzip(zipFile);
  
  // 2. Find watch-history.html or watch-history.json
  const historyFile = files.find(f => 
    f.name.includes('watch-history')
  );
  
  // 3. Parse YouTube watch history
  const videos = parseYouTubeHistory(historyFile.content);
  
  // 4. Display for selection
  return videos;
}

// Parse YouTube HTML history
function parseYouTubeHistory(html: string): Video[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const videos: Video[] = [];
  const entries = doc.querySelectorAll('.outer-cell');
  
  entries.forEach(entry => {
    const titleEl = entry.querySelector('.mdl-typography--title a');
    const timeEl = entry.querySelector('.content-cell.mdl-typography--body-1');
    
    if (titleEl) {
      videos.push({
        title: titleEl.textContent || '',
        url: titleEl.getAttribute('href') || '',
        watchedAt: parseDate(timeEl?.textContent),
      });
    }
  });
  
  return videos;
}
```

**User Flow:**
```
Google Takeout → Request Export → Download ZIP → Import to App → Select Videos → Download
```

**Pros:**
- Official Google data export
- Complete watch history
- Works for all Google services (YouTube, YouTube Music)

**Cons:**
- Takes 24+ hours for Google to prepare
- Large file size (years of history)
- Manual process

---

### Solution 3: YouTube API + OAuth

**How it works:**
1. App initiates YouTube OAuth login
2. User grants "YouTube Data API v3" permission
3. App fetches watch history via API
4. Display videos for selection

**Implementation:**

```rust
// OAuth flow in Tauri
#[tauri::command]
pub async fn youtube_oauth_login() -> Result<AuthUrl, String> {
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
        client_id={}&\
        redirect_uri={}&\
        response_type=code&\
        scope=https://www.googleapis.com/auth/youtube.readonly&\
        access_type=offline",
        CLIENT_ID,
        REDIRECT_URI
    );
    
    // Open browser for login
    open::that(&auth_url)?;
    
    // Wait for callback (local HTTP server)
    let auth_code = wait_for_oauth_callback().await?;
    
    // Exchange for access token
    let token = exchange_code_for_token(auth_code).await?;
    
    Ok(token)
}

// Fetch watch history
#[tauri::command]
pub async fn fetch_youtube_history(
    token: String,
) -> Result<Vec<Video>, String> {
    let client = reqwest::Client::new();
    
    let response = client
        .get("https://www.googleapis.com/youtube/v3/playlistItems")
        .query(&[
            ("part", "snippet"),
            ("playlistId", "HL"), // Watch History playlist
            ("maxResults", "50"),
        ])
        .bearer_auth(token)
        .send()
        .await?;
    
    let data: YoutubeResponse = response.json().await?;
    
    let videos = data.items.into_iter()
        .map(|item| Video {
            id: item.snippet.resource_id.video_id,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.default.url,
        })
        .collect();
    
    Ok(videos)
}
```

**Limitations:**

⚠️ **YouTube API has strict quotas:**
- 10,000 units per day per project
- Each API call costs units
- Watch history API requires special permissions (not always available)

⚠️ **OAuth scopes:**
- `youtube.readonly` - Basic info
- No direct "watch history" scope available
- Most users won't have API access enabled

**Conclusion:** Not recommended due to API limitations

---

### Solution 4: Browser Extension (Most Practical)

**How it works:**
1. Develop browser extension (Chrome/Firefox/Safari)
2. Extension tracks YouTube videos watched
3. Syncs to cloud or local network
4. Desktop app retrieves list

**Extension Architecture:**

```javascript
// content.js - Runs on YouTube pages
let lastVideo = null;

// Listen for video changes
setInterval(() => {
  const videoData = extractVideoData();
  
  if (videoData && videoData.id !== lastVideo?.id) {
    lastVideo = videoData;
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'VIDEO_WATCHED',
      data: videoData
    });
  }
}, 2000);

function extractVideoData() {
  const url = new URL(window.location.href);
  const videoId = url.searchParams.get('v');
  
  if (!videoId) return null;
  
  return {
    id: videoId,
    title: document.querySelector('h1.title')?.textContent,
    url: window.location.href,
    timestamp: Date.now(),
    platform: 'youtube'
  };
}
```

```javascript
// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'VIDEO_WATCHED') {
    // Store locally
    chrome.storage.local.get(['watchHistory'], (result) => {
      const history = result.watchHistory || [];
      history.push(request.data);
      
      // Keep only last 1000 videos
      if (history.length > 1000) {
        history.shift();
      }
      
      chrome.storage.local.set({ watchHistory: history });
    });
    
    // Sync to desktop app via WebSocket
    syncToDesktop(request.data);
  }
});
```

**Pros:**
- Real-time sync
- Works on both mobile (Firefox Mobile supports extensions) and desktop
- No API keys needed
- Complete privacy (local storage)

**Cons:**
- Requires browser extension installation
- iOS Safari extensions limited
- Must be installed before watching videos

---

### Solution 5: QR Code / Local Network Sync

**How it works:**
1. Desktop app shows QR code / local IP address
2. Mobile user opens special webpage
3. Webpage detects YouTube links (share via "Copy Link")
4. Sends to desktop via WebSocket / HTTP

**Mobile Webpage:**

```html
<!-- Mobile sync page -->
<!DOCTYPE html>
<html>
<head>
    <title>Send to vYtDL</title>
</head>
<body>
    <h1>Paste YouTube URL</h1>
    <input type="text" id="urlInput" placeholder="Paste YouTube link">
    <button onclick="sendToDesktop()">Send to Desktop</button>
    
    <script>
        function sendToDesktop() {
            const url = document.getElementById('urlInput').value;
            const desktopIP = new URLSearchParams(location.search).get('ip');
            
            fetch(`http://${desktopIP}:8080/add-url`, {
                method: 'POST',
                body: JSON.stringify({ url }),
                headers: { 'Content-Type': 'application/json' }
            });
        }
    </script>
</body>
</html>
```

**User Flow:**
```
Mobile YouTube → Share → Copy Link → Open vYtDL Sync Page → Paste → Send
```

**Pros:**
- No app installation needed on mobile
- Works on all platforms
- Simple to use

**Cons:**
- Manual for each video
- Requires local network connection

---

## Recommended Implementation

### Phase 1: Google Takeout Import (Easiest)

1. Support importing Google Takeout ZIP
2. Parse YouTube watch history
3. Display video list for selection
4. Download selected videos

**Time Estimate:** 2-3 days

### Phase 2: Browser Extension

1. Develop Chrome/Firefox extension
2. Track YouTube watch history
3. Sync to desktop via WebSocket
4. Optional: Cloud sync for remote access

**Time Estimate:** 1-2 weeks

### Phase 3: Mobile Browser Cookie Export

1. Create guide for mobile cookie export
2. Support importing mobile cookies
3. Auto-detect watch history from cookies

**Time Estimate:** 1 week

## Technical Implementation

### Data Structure

```typescript
interface WatchHistoryEntry {
  id: string;              // Video ID
  platform: 'youtube' | 'bilibili' | 'xhs' | string;
  title: string;
  url: string;
  thumbnail?: string;
  watchedAt: Date;
  channel?: string;
  duration?: number;       // Video duration in seconds
  watchDuration?: number;  // How much user watched
}

interface WatchHistorySync {
  device: string;          // "iPhone", "Android", "Chrome Desktop"
  entries: WatchHistoryEntry[];
  lastSync: Date;
}
```

### UI Design

```
┌──────────────────────────────────────────────┐
│  📱 Sync Mobile Watch History                │
├──────────────────────────────────────────────┤
│                                              │
│  [Import from Google Takeout]                │
│  [Install Browser Extension]                 │
│  [Import Mobile Cookies]                     │
│  [Scan QR Code]                              │
│                                              │
├──────────────────────────────────────────────┤
│  📊 Recently Watched (from mobile)           │
├──────────────────────────────────────────────┤
│  ☑️ [缩略图] Video Title 1          15:30   │
│  ☑️ [缩略图] Video Title 2          22:45   │
│  ☐ [缩略图] Video Title 3          08:20   │
│                                              │
│  [Download Selected (2)]                     │
└──────────────────────────────────────────────┘
```

## Privacy Considerations

⚠️ **Watch history is sensitive data:**

1. **Local storage only** - Never upload to cloud
2. **Encryption** - Encrypt local database
3. **User consent** - Clear opt-in for history access
4. **Data retention** - Auto-delete after download or user-configurable
5. **No tracking** - Don't track or analytics on watch history

## Conclusion

**Yes, it's possible!** The best approach is:

1. **Short term:** Google Takeout import (immediate value)
2. **Medium term:** Browser extension (best UX)
3. **Long term:** Mobile cookie import (power users)

Would you like me to implement any of these solutions?
