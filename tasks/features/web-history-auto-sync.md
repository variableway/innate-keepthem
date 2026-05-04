# Web History Auto-Sync (Via Page Agent)

## 核心洞察 💡

> "既然每个app都记录浏览历史，用户通过模拟登录网站也可以获取浏览记录，而且本地都有cookie了"

**YouTube/Bilibili 等平台的网页版会显示全设备的观看历史！**

```
手机 YouTube App 观看          电脑浏览器观看
        ↓                            ↓
   同步到 Google 账号              同一账号
        ↘                        ↙
              网页版历史页面
                   ↓
           桌面 App 登录获取
                   ↓
              自动下载
```

## 工作原理

### 账号同步机制

| 平台 | 网页历史页面 | 同步范围 |
|------|-------------|----------|
| **YouTube** | youtube.com/feed/history | 全设备（手机/平板/电脑/TV） |
| **Bilibili** | bilibili.com/account/history | 全设备 |
| **抖音** | douyin.com | 全设备 |
| **Netflix** | netflix.com/browse/my-list | 全设备 |

**关键：只要登录同一个账号，就能看到所有设备的观看记录！**

---

## 技术实现

### 架构

```
vYtDL Desktop App (Tauri)
    ↓
Page Agent MCP / CDP (控制 Chrome)
    ↓
打开 youtube.com/feed/history
    ↓
用户登录（或自动使用保存的cookie）
    ↓
Page Agent 提取视频列表
    ↓
返回视频 URL 列表
    ↓
yt-dlp 下载（使用相同cookie）
```

### 代码实现

#### 1. 启动浏览器并获取历史

```rust
use serde::{Deserialize, Serialize};
use chromiumoxide::{Browser, BrowserConfig};
use std::time::Duration;

#[derive(Debug, Serialize)]
pub struct WatchRecord {
    pub title: String,
    pub url: String,
    pub channel: String,
    pub watched_at: String,
    pub thumbnail: Option<String>,
}

pub struct WebHistorySync;

impl WebHistorySync {
    /// 同步 YouTube 观看历史
    pub async fn sync_youtube_history(&self) -> Result<Vec<WatchRecord>, String> {
        // 启动浏览器（使用用户数据目录，保留登录状态）
        let browser = Browser::launch(
            BrowserConfig::builder()
                .user_data_dir("./browser_data/youtube".into())
                .window_size(1280, 720)
                .build()
                .map_err(|e| e.to_string())?
        ).await.map_err(|e| e.to_string())?;
        
        let page = browser.new_page("https://www.youtube.com/feed/history")
            .await
            .map_err(|e| e.to_string())?;
        
        // 等待页面加载
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // 检查是否需要登录
        let need_login = page.evaluate("document.querySelector('yt-formatted-string:contains(\"Sign in\")') !== null")
            .await
            .map_err(|e| e.to_string())?;
        
        if need_login {
            return Err("请先在浏览器中登录 YouTube".to_string());
        }
        
        // 滚动加载更多历史
        for _ in 0..5 {
            page.evaluate(r#"
                window.scrollTo(0, document.body.scrollHeight);
            "#).await.map_err(|e| e.to_string())?;
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        
        // 提取视频信息
        let videos = page.evaluate(r#"
            Array.from(document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer')).map(el => {
                const titleEl = el.querySelector('#video-title');
                const channelEl = el.querySelector('#channel-name a');
                const linkEl = el.querySelector('a#thumbnail');
                const thumbEl = el.querySelector('img');
                
                return {
                    title: titleEl?.textContent?.trim() || '',
                    url: 'https://youtube.com' + (linkEl?.getAttribute('href') || ''),
                    channel: channelEl?.textContent?.trim() || '',
                    thumbnail: thumbEl?.src
                };
            }).filter(v => v.title && v.url)
        "#).await.map_err(|e| e.to_string())?;
        
        let records: Vec<WatchRecord> = videos
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .map(|v| WatchRecord {
                title: v["title"].as_str().unwrap_or("").to_string(),
                url: v["url"].as_str().unwrap_or("").to_string(),
                channel: v["channel"].as_str().unwrap_or("").to_string(),
                watched_at: chrono::Local::now().to_rfc3339(),
                thumbnail: v["thumbnail"].as_str().map(|s| s.to_string()),
            })
            .collect();
        
        // 关闭浏览器
        browser.close().await.map_err(|e| e.to_string())?;
        
        // 保存记录到数据库
        self.save_history("youtube", &records).await?;
        
        Ok(records)
    }
    
    /// 同步 Bilibili 观看历史
    pub async fn sync_bilibili_history(&self) -> Result<Vec<WatchRecord>, String> {
        let browser = Browser::launch(
            BrowserConfig::builder()
                .user_data_dir("./browser_data/bilibili".into())
                .build()
                .map_err(|e| e.to_string())?
        ).await.map_err(|e| e.to_string())?;
        
        let page = browser.new_page("https://www.bilibili.com/account/history")
            .await
            .map_err(|e| e.to_string())?;
        
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // 提取 Bilibili 历史
        let videos = page.evaluate(r#"
            Array.from(document.querySelectorAll('.history-list .history-card')).map(el => {
                const titleEl = el.querySelector('.title');
                const linkEl = el.querySelector('a');
                const metaEl = el.querySelector('.meta');
                
                return {
                    title: titleEl?.textContent?.trim() || '',
                    url: linkEl?.href || '',
                    channel: metaEl?.textContent?.split('·')[0]?.trim() || '',
                    watched_at: metaEl?.textContent?.split('·')[1]?.trim() || ''
                };
            }).filter(v => v.title && v.url)
        "#).await.map_err(|e| e.to_string())?;
        
        // ... 保存记录
        
        browser.close().await.map_err(|e| e.to_string())?;
        
        Ok(vec![])
    }
    
    /// 获取今天观看的视频
    pub async fn get_today_videos(&self, platform: &str) -> Result<Vec<WatchRecord>, String> {
        // 从数据库查询今天的记录
        let today = chrono::Local::now().date_naive();
        
        let records = sqlx::query_as::<_, WatchRecord>(
            r#"
            SELECT * FROM watch_history 
            WHERE platform = ? AND date(watched_at) = ?
            ORDER BY watched_at DESC
            "#
        )
        .bind(platform)
        .bind(today.to_string())
        .fetch_all(&self.db)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(records)
    }
    
    async fn save_history(&self, platform: &str, records: &[WatchRecord]) -> Result<(), String> {
        for record in records {
            sqlx::query(
                r#"
                INSERT OR REPLACE INTO watch_history 
                (platform, title, url, channel, watched_at, thumbnail)
                VALUES (?, ?, ?, ?, ?, ?)
                "#
            )
            .bind(platform)
            .bind(&record.title)
            .bind(&record.url)
            .bind(&record.channel)
            .bind(&record.watched_at)
            .bind(&record.thumbnail)
            .execute(&self.db)
            .await
            .map_err(|e| e.to_string())?;
        }
        
        Ok(())
    }
}
```

#### 2. Tauri 命令

```rust
// src-tauri/src/commands.rs

#[tauri::command]
pub async fn sync_web_history(
    platform: String,  // "youtube", "bilibili"
    app_state: State<'_, AppState>,
) -> Result<ApiResponse<Vec<WatchRecord>>, String> {
    let sync = WebHistorySync::new(app_state.db.clone());
    
    let records = match platform.as_str() {
        "youtube" => sync.sync_youtube_history().await,
        "bilibili" => sync.sync_bilibili_history().await,
        _ => return Ok(ApiResponse::err(format!("Unsupported platform: {}", platform))),
    };
    
    match records {
        Ok(videos) => {
            // 过滤出今天的新视频
            let today_videos = filter_today_new(&videos).await?;
            
            Ok(ApiResponse::ok(today_videos))
        }
        Err(e) => Ok(ApiResponse::err(e)),
    }
}

#[tauri::command]
pub async fn download_today_history(
    platform: String,
    app_state: State<'_, AppState>,
) -> Result<ApiResponse<DownloadReport>, String> {
    // 1. 获取今天观看的视频
    let sync = WebHistorySync::new(app_state.db.clone());
    let videos = sync.get_today_videos(&platform).await?;
    
    // 2. 过滤已下载的
    let to_download: Vec<_> = videos
        .into_iter()
        .filter(|v| !is_already_downloaded(&v.url))
        .collect();
    
    // 3. 批量下载
    let mut report = DownloadReport::default();
    
    for video in to_download {
        match start_download(video.url, Default::default()).await {
            Ok(_) => report.success += 1,
            Err(e) => {
                report.failed += 1;
                report.errors.push((video.title, e));
            }
        }
    }
    
    Ok(ApiResponse::ok(report))
}
```

#### 3. 前端 UI

```tsx
// src/components/WebHistorySync.tsx

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Youtube, Tv, Download, RefreshCw, CheckCircle } from "lucide-react";

export function WebHistorySync() {
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<WatchRecord[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [report, setReport] = useState<DownloadReport | null>(null);

  const syncYouTube = async () => {
    setSyncing(true);
    try {
      const response = await invoke<ApiResponse<WatchRecord[]>>(
        "sync_web_history", 
        { platform: "youtube" }
      );
      if (response.success && response.data) {
        setHistory(response.data);
      }
    } finally {
      setSyncing(false);
    }
  };

  const downloadAll = async () => {
    setDownloading(true);
    try {
      const response = await invoke<ApiResponse<DownloadReport>>(
        "download_today_history",
        { platform: "youtube" }
      );
      if (response.success && response.data) {
        setReport(response.data);
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tv className="h-5 w-5" />
          同步网页观看历史
        </CardTitle>
        <CardDescription>
          登录 YouTube/Bilibili 网页版，自动获取全设备的观看记录
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* 平台选择 */}
        <div className="flex gap-2">
          <Button 
            onClick={syncYouTube}
            disabled={syncing}
            variant="outline"
            className="flex-1"
          >
            {syncing ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Youtube className="mr-2 h-4 w-4" />
            )}
            同步 YouTube
          </Button>
          
          <Button 
            onClick={() => syncPlatform("bilibili")}
            disabled={syncing}
            variant="outline"
            className="flex-1"
          >
            <Tv className="mr-2 h-4 w-4" />
            同步 Bilibili
          </Button>
        </div>

        {/* 说明 */}
        <Alert className="bg-blue-50">
          <Info className="h-4 w-4" />
          <AlertDescription>
            首次同步需要在打开的浏览器中登录账号。
            登录后 Cookie 会保存，下次自动登录。
          </AlertDescription>
        </Alert>

        {/* 今日观看列表 */}
        {history.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-4 py-2 font-medium flex justify-between">
              <span>今日观看 ({history.length})</span>
              <Button 
                size="sm" 
                onClick={downloadAll}
                disabled={downloading}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloading ? "下载中..." : "全部下载"}
              </Button>
            </div>
            
            <div className="max-h-64 overflow-auto">
              {history.map((video, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border-b">
                  <img 
                    src={video.thumbnail} 
                    alt=""
                    className="w-24 h-16 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{video.title}</p>
                    <p className="text-sm text-muted-foreground">{video.channel}</p>
                  </div>
                  {video.downloaded ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <Button size="sm" variant="ghost">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 下载报告 */}
        {report && (
          <Alert className={report.failed === 0 ? "bg-green-50" : "bg-yellow-50"}>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              成功下载 {report.success} 个视频
              {report.failed > 0 && `，失败 ${report.failed} 个`}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## 工作流程

### 首次使用

```
1. 用户打开 vYtDL
2. 点击"同步 YouTube 历史"
3. App 启动浏览器，打开 youtube.com/feed/history
4. 如果未登录，显示 YouTube 登录页面
5. 用户登录（勾选"保持登录"）
6. Page Agent 自动提取历史记录
7. 显示今天观看的视频列表
8. 用户点击"全部下载"
9. yt-dlp 使用保存的 cookie 下载视频
```

### 日常使用

```
1. 用户晚上打开 vYtDL
2. 点击"同步 YouTube 历史"
3. 自动使用已保存的 cookie 登录
4. 提取今天的观看记录
5. 自动下载未下载的视频
6. 完成提示
```

---

## Cookie 持久化

```rust
// 使用 Chrome 用户数据目录
let browser = Browser::launch(
    BrowserConfig::builder()
        .user_data_dir("./browser_data".into())  // 保存到这里
        .build()?
).await?;

// 下次启动时自动使用保存的登录状态
```

这样用户只需要登录一次，之后都是自动的！

---

## 优势

| 优势 | 说明 |
|------|------|
| **全自动** | 一键同步，无需手动操作 |
| **全设备** | 获取手机/平板/TV/电脑的所有观看记录 |
| **Cookie 持久** | 登录一次，永久使用 |
| **隐私安全** | 所有数据本地存储，不上传云端 |
| **支持多平台** | YouTube、Bilibili、抖音等 |

---

## 实现建议

### Phase 1: YouTube 支持
- 实现基础浏览器控制
- 历史页面提取
- Cookie 保存

### Phase 2: Bilibili 支持
- 适配 Bilibili 页面结构
- 处理国内网络环境

### Phase 3: 自动下载
- 定时任务（每天自动同步）
- 智能去重
- 下载队列管理

**文档：** `tasks/features/web-history-auto-sync.md`

**需要我实现这个功能吗？** 🚀
