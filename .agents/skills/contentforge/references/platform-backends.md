# 采集平台后端对照表

## 平台支持矩阵

| 平台 | 能力 | 后端 | 配置 | 状态 |
|------|------|------|------|------|
| **Twitter/X** | 读推文、搜索、时间线 | twitter-cli / OpenCLI / bird CLI | Cookie / API Key | 需配置 |
| **小红书** | 读笔记、搜索、评论 | OpenCLI / xiaohongshu-mcp / xhs-cli | Cookie / 扫码 | 需配置 |
| **YouTube** | 字幕、元数据、搜索 | yt-dlp | 零配置 | ✅ 可用 |
| **Bilibili** | 搜索、视频详情 | bili-cli / OpenCLI | 零配置 | ✅ 可用 |
| **网页** | 任意 URL → Markdown | Jina Reader | 零配置 | ✅ 可用 |
| **RSS** | 订阅源解析 | feedparser | 零配置 | ✅ 可用 |
| **Reddit** | 搜索、帖子、评论 | OpenCLI / rdt-cli | Cookie | 需配置 |
| **V2EX** | 热帖、节点 | 公开 API | 零配置 | ✅ 可用 |
| **GitHub** | 代码搜索、仓库 | gh CLI | 零配置 | 可选 |
| **小宇宙播客** | 音频转录 | Whisper (Groq) | API Key | 需配置 |
| **LinkedIn** | 资料、搜索 | linkedin-mcp / Jina | 零配置 | 部分可用 |
| **Facebook** | 搜索、Feed | OpenCLI | Cookie | 需配置 |
| **Instagram** | 搜索、帖子 | OpenCLI | Cookie | 需配置 |

## 后端详情

### agent-reach 后端

agent-reach 是主要采集基础设施，封装了多个上游工具：

```python
from contentforge.ingestion.agent_reach import AgentReachIngestor

ingestor = AgentReachIngestor()

# 自动路由到合适的后端
unit = ingestor.fetch("https://twitter.com/...")
unit = ingestor.fetch("https://youtube.com/...")
unit = ingestor.fetch("https://xiaohongshu.com/...")
```

### Jina Reader

用于任意网页抓取：

```python
from contentforge.ingestion.web_scraper import JinaWebScraper

scraper = JinaWebScraper()
markdown = scraper.fetch("https://example.com/article")
```

Jina Reader API：`https://r.jina.ai/{URL}`

### yt-dlp

用于 YouTube 视频下载和字幕提取：

```python
from contentforge.ingestion.transcriber import Transcriber

t = Transcriber()

# 提取字幕
text = t.extract_subtitles("https://youtube.com/...")

# 转录音频
text = t.transcribe("https://youtube.com/...")
```

### OpenCLI

用于需要登录态的平台（Twitter、小红书、Reddit、Facebook、Instagram）：

要求：
1. 安装 Chrome 扩展：`npm install -g opencli`
2. 在 Chrome 中安装 OpenCLI 扩展
3. 在浏览器中登录目标平台
4. 运行 `opencli doctor` 验证连接

```bash
# 小红书
opencli xiaohongshu search "query" -f yaml
opencli xiaohongshu note "NOTE_URL" -f yaml

# Twitter
opencli twitter search "query" -f yaml
opencli twitter user-posts @username -f yaml

# Reddit
opencli reddit search "query" -f yaml
```

## 健康检查

```python
from contentforge.ingestion.health_check import HealthChecker

hc = HealthChecker()
report = hc.check_all()

for item in report:
    print(f"{item.name}: {item.status} - {item.message}")
```

## 配置示例

```yaml
# ~/.config/contentforge/config.yaml
ingestion:
  # 强制指定后端
  twitter_backend: twitter-cli
  xiaohongshu_backend: opencli
  
  # 代理设置
  proxy: http://localhost:7890
  
  # 速率限制
  rate_limit:
    requests_per_minute: 30
    delay_between_requests: 2
```

## 故障排除

| 问题 | 原因 | 解决 |
|------|------|------|
| Twitter 采集失败 | 未配置 Cookie | 设置 TWITTER_AUTH_TOKEN 和 TWITTER_CT0 环境变量 |
| 小红书采集失败 | 未登录 | 在 Chrome 中登录小红书，或使用 xiaohongshu-mcp 扫码 |
| yt-dlp 未找到 | 未安装 | `pip install yt-dlp` |
| Jina Reader 超时 | 网络问题 | 检查网络连接，或使用代理 |
| agent-reach 不可用 | venv 未激活 | `source packages/contentforge-core/scripts/cf-env.sh` |
