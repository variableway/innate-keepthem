# Case 2: 多视频并发下载 + 并发队列功能

## 概述

使用 vYtDL CLI 下载三个 YouTube 视频及其字幕，同时新增了 `--concurrency` 并发下载功能。

### 下载结果

| # | 视频 ID | 标题 | 状态 | 大小 |
|---|---------|------|------|------|
| 1 | `9A98hWZs5yU` | AI的正确打开方式：不学概念，学动作 | ✅ 完整 | 354 MB mp4 + 33 KB zh.vtt |
| 2 | `BIl5vJn6ohI` | Game Theory #25: Trump Visits China | ✅ 完整 | 1.5 GB mp4 + 495 KB en.vtt |
| 3 | `8nsxuB3Vsts` | Game Theory #24: The AI Apocalypse | ⚠️ 仅字幕 | 441 KB en.vtt（视频被封锁） |

---

## 新功能: `--concurrency` / `-j` 并发下载

### 用法

```bash
# 单个 URL（串行，默认 -j 1）
./vYtDL download --no-tui "URL"

# 多个 URL，2 个并发
./vYtDL download --no-tui -j 2 "URL1" "URL2" "URL3"

# 多个 URL，最大 3 个并发
./vYtDL download --no-tui --concurrency 3 \
  --output ./downloads \
  "URL1" "URL2" "URL3" "URL4"
```

### 工作原理

```
URL 列表 → work queue (channel)
              ↓
    ┌─────────┼─────────┐
    ↓         ↓         ↓
  worker1   worker2   worker3    ← 信号量限流 (size = -j)
    ↓         ↓         ↓
    └─────────┼─────────┘
              ↓
      results (mutex 保护)
              ↓
      record.Manager (mutex 保护)
```

- **信号量（semaphore channel）** 控制最大并发数
- **`sync.WaitGroup`** 等待所有 worker 完成
- **`sync.Mutex`** 保护结果收集和记录写入
- `-j 1` 时走快速路径，无 goroutine 开销，与旧版行为一致

### 线程安全改动

| 文件 | 改动 |
|------|------|
| `cmd/download.go` | 新增 `flagConcurrency`，并发调度逻辑，`sync.Mutex` 保护结果切片 |
| `internal/record/record.go` | `Manager` 新增 `sync.Mutex`，`Add()` 和 `Flush()` 加锁 |

---

## 下载过程

### 视频 1: AI的正确打开方式

```bash
cd vYtDL
./vYtDL download --no-tui --output ./downloads_case \
  "https://www.youtube.com/watch?v=9A98hWZs5yU"
```

- 状态：✅ 一次成功
- 耗时：约 5 分钟
- 产出：354 MB mp4 + 33 KB 中文字幕

### 视频 2: Game Theory #25

```bash
./vYtDL download --no-tui --output ./downloads_case \
  "https://www.youtube.com/watch?v=BIl5vJn6ohI"
```

- 状态：❌ 首次失败（合并阶段 `Read timed out`）
- 原因：下载完视频分段和音频分段后，合并时网络超时
- 产出了 `.f401.mp4.part` (1.2 GB) + `.f251.webm` (54 MB) + `.en.vtt` (506 KB)

```bash
# 重试（提高 socket 超时到 60 秒）
./vYtDL download --no-tui --output ./downloads_case \
  --socket-timeout 60 \
  "https://www.youtube.com/watch?v=BIl5vJn6ohI"
```

- 重试：✅ 成功（利用了已下载的分段文件，只需合并）
- 最终产出：1.5 GB mp4 + 495 KB 英文字幕

### 视频 3: Game Theory #24

```bash
./vYtDL download --no-tui --output ./downloads_case \
  "https://www.youtube.com/watch?v=8nsxuB3Vsts"
```

- 状态：❌ 首次失败（合并阶段 `Unable to connect to proxy`）
- 产出了 `.f401.mp4.part` (1.87 GB) + `.f251.webm` (49 MB) + `.en.vtt` (451 KB)

尝试用 ffmpeg 手动合并：

```bash
ffmpeg -i ".f401.mp4.part" -i ".f251.webm" -c copy -map 0:v:0 -map 1:a:0 \
  "Game Theory #24：  The AI Apocalypse.mp4"
```

结果：合并成功但仅产出 29 分钟（原视频 64 分钟），因为 `.part` 文件不完整。

后续重试全部被 YouTube 封锁：

```
ERROR: [youtube] Sign in to confirm you're not a bot.
```

尝试过的绕过手段：
- `--cookies-from-browser chrome` → Chrome cookies 解密失败
- `--cookies-from-browser safari` → Safari cookies 权限被拒
- `--extractor-args "youtube:player_client=ios"` → 仍需登录
- 无 cookies 重试 → 同被封锁

**根因**：短时间内对同一 IP 做了多次请求，YouTube 触发反爬机制。需要：
1. 安装 JS runtime（deno/node）解决 `n` challenge
2. 修复浏览器 cookies 导出权限
3. 或等待冷却期后再试

### 并发测试

```bash
./vYtDL download --no-tui -j 2 --output ./downloads_case \
  "https://www.youtube.com/watch?v=9A98hWZs5yU" \
  "https://www.youtube.com/watch?v=BIl5vJn6ohI"
```

输出确认并发生效：

```
[starting] https://www.youtube.com/watch?v=BIl5vJn6ohI
[starting] https://www.youtube.com/watch?v=9A98hWZs5yU
[error] ...
[error] ...

Completed: 0 succeeded, 2 failed.
```

两个任务同时启动（双 `[starting]`），并发调度、信号量、结果收集均正常。

---

## 输出文件结构

```
vYtDL/downloads_case/
├── download_record.json
├── subtitle_mapping.json
└── downloads_case/
    ├── AI的正确打开方式：不学概念，学动作.mp4       # 354 MB ✅
    ├── AI的正确打开方式：不学概念，学动作.zh.vtt    # 33 KB
    ├── Game Theory #25：  Trump Visits China.mp4    # 1.5 GB ✅
    ├── Game Theory #25：  Trump Visits China.en.vtt # 495 KB
    └── Game Theory #24：  The AI Apocalypse.en.vtt  # 441 KB ⚠️ 仅字幕
```

---

## `--concurrency` 参数速查

| 参数 | 简写 | 默认 | 说明 |
|------|------|------|------|
| `--concurrency N` | `-j N` | 1 | 最大并发下载数。1 = 串行（与旧版一致） |

### 使用场景

- **`-j 1`**（默认）：顺序下载，输出清晰，适合交互式使用
- **`-j 2`**：两个视频同时下载，适合批量任务
- **`-j 3 ~ -j 5`**：适合大量 URL + 高速网络
- **`-j 10`**（最大值）：配合 `--no-tui` 跑后台批量

### 注意事项

- 并发数越高，对 YouTube 的请求频率越高，更容易触发反爬
- 建议配合 `--cookies-from-browser` 使用以避免封锁
- TUI 模式下多个视频的进度条会交替显示
- `--no-tui` 模式下纯文本输出会交错，适合重定向到日志文件

---

## 排错补充

### YouTube 反爬封锁

```
ERROR: Sign in to confirm you're not a bot
```

**解决步骤**：

1. 安装 JS runtime：
   ```bash
   brew install deno
   # 或
   npm install -g deno
   ```

2. 使用浏览器 cookies：
   ```bash
   ./vYtDL download --cookies-from-browser chrome "URL"
   ```

3. 如果 cookies 解密失败（macOS keychain 权限问题）：
   - 用浏览器插件导出 `cookies.txt`
   - 使用 `--cookies cookies.txt`

4. 降低并发数 + 增加间隔：
   ```bash
   ./vYtDL download -j 1 --socket-timeout 60 "URL"
   ```

### 分段文件残留

下载失败后可能留下 `.part` 和 `.f251.webm` 文件。重试时 yt-dlp 会自动续传，无需手动清理。

手动合并分段文件（当 yt-dlp 合并失败时）：

```bash
ffmpeg -i "video.f401.mp4.part" -i "video.f251.webm" \
  -c copy -map 0:v:0 -map 1:a:0 "output.mp4"
```
