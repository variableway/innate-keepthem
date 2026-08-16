# URL Extractor（extensions/url-extractor）

Manifest V3 Chrome 扩展「YouTube URL Extractor」：在 YouTube 频道/视频/播放列表页提取全部视频 URL，支持标题包含/排除过滤、数量上限、勾选导出 TXT（每行一个 URL），供 yt-dlp / vYtDL 批量下载使用。UI 文案为中文。

## 技术栈与结构

MV3、零框架零构建、纯原生 JS：

```
extensions/url-extractor/
├── manifest.json      # permissions: activeTab, scripting, downloads；匹配 youtube.com/www
├── content.js         # 8 组选择器抓链接、videoId 去重、规整为 watch?v=<id>
├── popup.js           # 提取/过滤/全选/导出（chrome.downloads 失败时回退 <a download>）
├── popup.html / popup.css
└── icons/             # 16/48/128 PNG + generate_icons.py（可重新生成）
```

## 对外接口

消息协议：popup -> content 发 `{action: 'extractVideos'}`，回 `{videos: [{id,url,title}]}`。输出文件：`youtube_urls_selected.txt` / `youtube_urls_all.txt`。

## 使用

`chrome://extensions` -> 加载已解压的扩展程序 -> 选择本目录。无打包/发布流程，不参与 workspace 构建（无 package.json）。

## 与其他模块的关系

完全独立、零代码依赖；与 vYtDL CLI 是工作流配套（导出的 URL 列表喂给 `vYtDL download` 或 `batch_download.py`）。

## 完成度

提取/过滤/选择/导出全流程完整可用。已知局限（详见 docs/STATUS.md）：Shorts 链接被 `content.js:31` 过滤（`/watch?v=` 判断）；`youtu.be`/`m.youtube.com` 页面不注入 content script（manifest 未匹配）；无 service worker/持久化/国际化。
