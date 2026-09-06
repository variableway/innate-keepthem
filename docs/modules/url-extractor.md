# URL Extractor（`extensions/url-extractor/`）

## 定位

Chrome Manifest V3 扩展：从 YouTube 频道 / 列表页提取 `watch?v=` 链接，导出给 CLI 或桌面 Batch 下载。

## 技术栈

- Manifest V3
- 原生 HTML / CSS / JS（无打包）

## 入口

| 文件 | 作用 |
|------|------|
| `manifest.json` | 扩展配置 |
| `content.js` | 页面内抓取 |
| `popup.html` / `popup.js` / `popup.css` | 弹层 UI |

## 功能

- 扫描 `#video-title`、网格、播放列表、`watch?v=`，按 video id 去重
- 全选 / 反选、标题包含 / 排除过滤、数量上限
- 导出选中或全部 URL 为文本（downloads 权限）
- Host：`youtube.com` / `youtu.be`

## 使用

1. Chrome → 加载已解压的扩展 → 选择本目录
2. 打开频道或播放列表页 → 打开弹层 → 提取 → 导出 `.txt`
3. 将文件导入 vYtDL Desktop Batch，或喂给 CLI

## 与其他模块

无代码依赖；产出物对接 vYtDL 批量下载路径。
