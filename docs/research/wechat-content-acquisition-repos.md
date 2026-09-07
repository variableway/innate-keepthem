# 微信视频号 / 公众号内容获取 — GitHub Top 10 调研

> 调研日期：2026-09-06。Star 数为 GitHub 当日实时数据；各仓库技术原理均已核实 README / 仓库结构。
> 目的：评估「获取视频号 / 公众号内容」的开源方案与技术路线，为后续构建 AI Agent Skill 做准备。

## 一、微信视频号内容获取 — Top 10

| # | 仓库 | Stars | 技术原理 | 状态 |
|---|------|-------|---------|------|
| 1 | [putyy/res-downloader](https://github.com/putyy/res-downloader) | 19.7k | Go + Wails 桌面应用，本地 MITM 代理（127.0.0.1:8899）嗅探流量，视频号需手动点「视频解密」；还支持抖音/快手/小红书/小程序/直播流 | 活跃（维护放缓），Apache-2.0，Win/mac/Linux |
| 2 | [ltaoo/wx_channels_download](https://github.com/ltaoo/wx_channels_download) | 9.1k | Go 本地 HTTPS 代理（装根证书），向 PC 微信视频号页面注入前端加「下载按钮」；解密参考 WechatVideoSniffer2.0 + Hanson/WechatSphDecrypt | 活跃，Win/macOS |
| 3 | [qiye45/wechatVideoDownload](https://github.com/qiye45/wechatVideoDownload) | 5.7k | changfengbox 出品的闭源 GUI（仓库仅是发布页）：流量监听 + 解密；支持视频、直播录制（分段 MP4）、直播回放、图片，已适配微信 4.0 | 活跃（v2.8），Windows |
| 4 | [lecepin/WeChatVideoDownloader](https://github.com/lecepin/WeChatVideoDownloader) | 4.7k | 经典 whistle 代理方案（Electron） | ⚠️ 2024-05 已归档停更 |
| 5 | [nobiyou/wx_channel](https://github.com/nobiyou/wx_channel) | 2.6k | Go + SunnyNet 代理注入下载按钮，加密自动解密，Web 控制台（:2025）支持队列/批量/导出 | 活跃（v5.7.9），仅 Windows，MIT |
| 6 | [kanadeblisst00/WechatVideoSniffer2.0](https://github.com/kanadeblisst00/WechatVideoSniffer2.0) | 870 | 旧版开源：aardio + Sunny.dll MITM 嗅探；2.0 闭源转向「从微信内提取数据」+ 积分服务，依赖作者服务器 | 活跃但闭源化 |
| 7 | [xuncv/WeChatDownloader](https://github.com/xuncv/WeChatDownloader) | 572 | Electron 视频号下载器 | ⚠️ 2022 年后停更 |
| 8 | [fly-sem/WeChatVideoDownloader-Pro](https://github.com/fly-sem/WeChatVideoDownloader-Pro) | 103 | 视频号下载 Pro 版 | 低活跃 |
| 9 | [Milk-Dream/WeChatVideoDownload-Fiddler](https://github.com/Milk-Dream/WeChatVideoDownload-Fiddler) | 88 | Fiddler 抓包手动方案 | 小众 |
| 10 | [will-17173/electron-weixin-channels-downloader](https://github.com/will-17173/electron-weixin-channels-downloader) | 66 | Electron 下载器 | 低活跃 |

### 视频号生态关键件

- [Evil0ctal/WeChat-Channels-Video-File-Decryption](https://github.com/Evil0ctal/WeChat-Channels-Video-File-Decryption)（362⭐）— 视频号加密视频的通用解密工具 + API 服务，用微信官方 WASM 模块生成密钥，多个项目拿它当解密后端。
- [jiamuAi/jiamu-wechat-channels-downloader-skill](https://github.com/jiamuAi/jiamu-wechat-channels-downloader-skill)（10⭐，MIT）— **现成的 AI Agent Skill**：TikHub API 搜索定位视频 → 下载解密（首次自动装上述解密服务）→ DashScope ASR 转写 → 按停顿/口语标记智能分段，输出 Markdown 文案。Node.js（.mjs 脚本），依赖 TikHub / DashScope 两个 API Key + FFmpeg。构建同类 skill 时最值得参考的结构。

### 视频号技术路线总结

视频号没有任何公开 HTTP 接口，所有方案殊途同归：

1. **本地 MITM 代理 + 向 PC 微信注入页面 + 解密**（主流，绝大多数仅 Windows）
2. **闭源客户端监听**（changfengbox 系）
3. **第三方付费 API**（TikHub，skill 类项目在用）

视频流本身加密，**解密是绕不开的一环**（微信官方 WASM / WechatSphDecrypt）。

## 二、微信公众号内容获取 — Top 10

| # | 仓库 | Stars | 技术原理 | 状态 |
|---|------|-------|---------|------|
| 1 | [wechat-article/wechat-article-exporter](https://github.com/wechat-article/wechat-article-exporter) | 12.9k | 利用公众平台「编辑文章时搜索其他公众号文章」接口；需自备公众号扫码登录；导出 html（100% 还原排版）/md/docx/excel + 评论、阅读量 | ⚠️ **2026-07-30 停止维护归档**——微信官方关闭上游核心接口 |
| 2 | [cooderl/wewe-rss](https://github.com/cooderl/wewe-rss) | 9.7k | 微信读书账号扫码 → 公众号全文 RSS（atom/rss/json），Docker 部署；有「小黑屋」封控机制 | ⚠️ **2026-05-11 已归档** |
| 3 | [qiye45/wechatDownload](https://github.com/qiye45/wechatDownload) | 9.3k | 把文章链接发到微信内打开以抓取 key（无需装证书），批量下载 html/mhtml/md/pdf/docx/csv + 评论/合集/阅读量；**v4.4 起内置 MCP/Skill 调用**（仓库含 `skills/wechat-article-downloader`） | 活跃（v4.7，适配微信 4.0），闭源发布，Win/macOS |
| 4 | [rachelos/we-mp-rss](https://github.com/rachelos/we-mp-rss) | 4.5k | wewe-rss 的活跃后继：扫码授权 + 多采集模式（默认 app 列表 + web 正文校正，微信读书为可选模式），导出 md/docx/pdf/json，REST API + Webhook | 活跃（994 commits），Python FastAPI + Vue3 |
| 5 | [wnma3mz/wechat_articles_spider](https://github.com/wnma3mz/wechat_articles_spider) | 3.5k | 经典 Python 库（`pip install wechatarticles`）：手动 Fiddler 抓包取 cookie/token/appmsg_token，可爬全量文章 URL、阅读量、评论 | ⚠️ 2023 年后停更，参数易过期 |
| 6 | [tmwgsicp/wechat-download-api](https://github.com/tmwgsicp/wechat-download-api) | 1.1k | 公众平台管理员扫码（凭证约 4 天），可取任意公众号；整号导出 7 种格式（MD/HTML/Word/PDF/EPUB/Excel/JSON）+ 全文 RSS；**`/mcp` 挂载 6 个工具**（search_accounts、read_article 等）；curl_cffi TLS 指纹 + SOCKS5 代理池 + 三层限频反风控 | 活跃，AGPL-3.0 |
| 7 | [1061700625/WeChat_Article](https://github.com/1061700625/WeChat_Article) | 1.1k | Selenium 自动登录公众平台取 token/cookie，爬取下载 txt/HTML（图片本地化）/PDF，支持时间/关键词筛选 | 可用，限流需换号 |
| 8 | [jackwener/wechat-article-to-markdown](https://github.com/jackwener/wechat-article-to-markdown) | 1.0k | 单篇文章 URL 抓取转 Markdown | 低频维护 |
| 9 | [pudongping/mp-vx-insight](https://github.com/pudongping/mp-vx-insight) | 586 | 浏览器扩展：一键取公众号封面图、全部文章列表、正文采集 | 可用 |
| 10 | [Bwkyd/wexin-read-mcp](https://github.com/Bwkyd/wexin-read-mcp) | 450 | **MCP server**：`read_weixin_article(url)` → 返回标题/作者/时间的 Markdown 正文；v0.3 改用自研 Rust 单二进制 `url-md` 一步过反爬，无需凭证、无需浏览器 | 活跃，MIT |

按 star 更高但已彻底失效的（搜狗微信通道已死）：chyroc/WechatSogou（6.4k）、bowenpay/wechat-spider（3.4k）、feeddd/feeds（2.1k）。

### 公众号技术路线总结

1. **公众平台接口**（自备公众号扫码：exporter、wechat-download-api、WeChat_Article）
2. **微信读书接口**（wewe-rss 系）
3. **PC 微信抓 key**（qiye45/wechatDownload）
4. **单篇直抓过反爬**（wexin-read-mcp，免凭证）

## 三、对构建 Skill 的启示

- **公众号侧最容易落地**：已有两个现成 MCP（`tmwgsicp/wechat-download-api` 的 `/mcp` 和 `Bwkyd/wexin-read-mcp`），qiye45 也直接附带了 `skills/wechat-article-downloader` 目录——写 skill 时优先封装这三个，而不是从零写爬虫。单篇阅读用 wexin-read-mcp 最轻（免凭证）；整号订阅/批量导出用 we-mp-rss 或 wechat-download-api。
- **视频号没有免客户端方案**：要么本地跑「代理嗅探 + WASM 解密」三件套（可复用 nobiyou/wx_channel 和 Evil0ctal 解密库），要么走 TikHub 付费 API（jiamuAi 的 skill 就是这么做的，结构上最值得参考）。
- **2026 年风向**：微信在持续收紧——wewe-rss（2026-05）和 wechat-article-exporter（2026-07）接连因上游接口被官方关闭而归档；选底层方案时应避开公众平台「搜索文章」这类已被点名关闭的接口，微信读书接口也有收紧迹象。
