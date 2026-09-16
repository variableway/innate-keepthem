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
| 6 | [tmwgsicp/wechat-download-api](https://github.com/tmwgsicp/wechat-download-api) | 1.1k | 公众平台管理员扫码（凭证约 4 天），可取任意公众号；整号导出 7 种格式（MD/HTML/Word/PDF/EPUB/Excel/JSON）+ 全文 RSS；**`/mcp` 挂载 6 个工具**（search_accounts、read_article 等）；curl_cffi TLS 指纹 + SOCKS5 代理池 + 三层限频反风控 | ⚠️ **2026-07-30 起核心功能瘫痪**：微信关闭公众平台"获取文章列表"接口（issue #21/#22，ret=200013 freq control），作者在 #23 提出微信读书 Web 端替代路径但社区实测 errCode -2041 仍被风控；单篇获取/搜索暂可用，整号订阅/批量导出待新方案，AGPL-3.0 |
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

## 附：懒猫微服「微信公众号 MCP」（LazyCat MCP Provider）

> 2026-09-09 补充调研。

- **是什么**：懒猫微服应用商店的第三方应用 `cloud.lazycat.app.wechat-official-mcp`（开发者 nierenjun，v0.2.0，约 69MB，需 LzcOS ≥1.5.2，仅桌面端）。通过 MCP 接口向懒猫微服内置 AI Agent（小龙猫）提供公众号文章检索、按号浏览、全文搜索、Markdown 正文读取、AI 总结能力。
- **开源状态**：❌ **闭源**。应用商店「来源」栏为空，GitHub 无 nierenjun 账号/仓库，未发现任何源码发布。
- **技术路线**：微信读书扫码登录（不要求公众号管理员权限）→ 粘贴一篇公众号文章链接订阅该号 → 优先导入微信读书可见文章；历史回溯靠微信读书已知文章 + 公开搜索索引 + 文内链接扩展，必要时弹验证页人工完成后断点续传；公众号后台接口仅兜底。全部运行在懒猫微服内，不连本地电脑微信、不用付费 API。
- **懒猫外等效替代**：闭源无法自托管——同路线可自建 we-mp-rss（微信读书模式 + 公众平台兜底，MIT）或 wechat-download-api（公众平台扫码，自带 `/mcp` 六工具，AGPL）；两者本地已 clone 至 `references/`。

## 附 2：GitHub 上的公众号 MCP 服务器盘点（2026-09-09）

> 结论先行：**GitHub 上叫「公众号 MCP」的项目绝大多数是运营向**（管理自己的公众号、群发/草稿/素材，走官方 OpenAPI，需 AppID/AppSecret），**不是内容采集向**。真正的采集向 MCP 只有 tmwgsicp/wechat-download-api 和 Bwkyd/wexin-read-mcp 两个。

### 运营向（走官方 OpenAPI，与采集无关）

| 仓库 | Stars | 说明 |
|------|-------|------|
| [xwang152-jack/wechat-official-account-mcp](https://github.com/xwang152-jack/wechat-official-account-mcp) | 62 | 最全的运营 MCP：21 个工具覆盖用户/标签/菜单/素材/草稿/发布/消息/统计；MIT，npx 即用，活跃（v2.2.0） |
| [BobGod/wechat-publisher-mcp](https://github.com/BobGod/wechat-publisher-mcp) | 55 | 发布向 2 工具（Markdown→微信 HTML 发布 + 数据查询）；MIT，成熟度低（模板未改完） |
| [kakaxi3019/wechat_oa_mcp](https://github.com/kakaxi3019/wechat_oa_mcp) | 27 | 发布向 5 工具；⚠️ 托管模式 AppSecret 经作者服务器（106.15.125.133）中转，有信任风险；另有本地部署版 wechat_oa_api_mcp（11⭐） |
| [tc6-01/weixin-mcp](https://github.com/tc6-01/weixin-mcp) | 9 | kakaxi 版的 Go 重写（宣称启动快 20-30 倍），仅 1 commit |
| 其余 | ≤5 | HsiangNianian/wechat-publisher-mcp（远程发布）、vluma、xihe-lab 等同质化小项目；xyezir/falcon-wemp-mcp 是空仓库 |

特殊：[zero-times/wechat-official-studio-mcp](https://github.com/zero-times/wechat-official-studio-mcp)（1⭐）用**已登录的公众平台网页会话**读自己账号的文章+存草稿，算半个"读取"，但只针对自己运营的号。

### 微信读书向（不是公众号采集）

| 仓库 | Stars | 说明 |
|------|-------|------|
| [freestylefly/mcp-server-weread](https://github.com/freestylefly/mcp-server-weread) | 575 | 只管**书架/笔记/划线/书评**（4 工具），README 里的"公众号"是作者自己的号；Cookie 认证（F12 手动复制或 CookieCloud 自动同步）；不能获取公众号文章 |

### 采集向（真正的"获取公众号内容"MCP）

| 仓库 | Stars | 说明 |
|------|-------|------|
| [tmwgsicp/wechat-download-api](https://github.com/tmwgsicp/wechat-download-api) | 1.1k | 唯一的开源整号采集 MCP（公众平台扫码，`/mcp` 六工具），见上文 Top 10 #6 |
| [Bwkyd/wexin-read-mcp](https://github.com/Bwkyd/wexin-read-mcp) | 450 | 唯一的开源单篇阅读 MCP（URL→Markdown，免凭证），见上文 Top 10 #10 |

**含义**：LazyCat 那个闭源应用（微信读书优先 + 公众平台兜底）在开源界没有等价物——把 we-mp-rss 的微信读书采集路线包一层 MCP 是目前开源社区缺失的一环，也正是自建 skill 的机会点。

## 附 3：⚠️ 2026-07-30 微信接口封禁事件（2026-09-09 查证）

2026-07-30 前后微信官方**关闭了公众平台"获取公众号文章列表"的内部接口**，同源方案连环受创：

- **wechat-article-exporter**（12.9k⭐）：2026-07-30 公告停止维护并归档，"上游核心接口已被官方关闭，无法通过修改代码绕过"
- **tmwgsicp/wechat-download-api**（1.1k⭐）：同日 issue #21「轮询器失效」、#22「获取文章列表失败」（ret=200013 freq control），作者确认接口被关；#23 提出微信读书 Web 端替代（`MP_WXS_` bookId + `addToShelf` + `WEREAD_COOKIE`），社区实测 errCode **-2041** 仍被风控。当前单篇获取/搜索暂可用，**整号订阅/批量导出基本瘫痪**
- **rachelos/we-mp-rss**（4.5k⭐）：8-9 月也有「文章无法同步」（#463）、「还能不能获取文章」（#456）报告，但作者仍在积极对抗——9-04 合并 #462「公众号采集改为列表接口增量补抓多篇，cover 接口兜底」，是目前唯一持续更新采集方案的头部项目

**选型提醒**：2026-07 之后所有公众号采集方案上线前必须小规模实测；"公众平台扫码"路线（借自己订阅号后台会话调内部搜索接口）已死，微信读书路线在被风控与对抗中摇摆，单篇直抓（wexin-read-mcp）暂不受影响。

## 三、对构建 Skill 的启示

- **公众号侧最容易落地**：已有两个现成 MCP（`tmwgsicp/wechat-download-api` 的 `/mcp` 和 `Bwkyd/wexin-read-mcp`），qiye45 也直接附带了 `skills/wechat-article-downloader` 目录——写 skill 时优先封装这三个，而不是从零写爬虫。单篇阅读用 wexin-read-mcp 最轻（免凭证）；整号订阅/批量导出用 we-mp-rss 或 wechat-download-api。
- **视频号没有免客户端方案**：要么本地跑「代理嗅探 + WASM 解密」三件套（可复用 nobiyou/wx_channel 和 Evil0ctal 解密库），要么走 TikHub 付费 API（jiamuAi 的 skill 就是这么做的，结构上最值得参考）。
- **2026 年风向**：微信在持续收紧——wewe-rss（2026-05）和 wechat-article-exporter（2026-07）接连因上游接口被官方关闭而归档；选底层方案时应避开公众平台「搜索文章」这类已被点名关闭的接口，微信读书接口也有收紧迹象。
