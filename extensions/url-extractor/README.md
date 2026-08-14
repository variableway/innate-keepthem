# YouTube URL Extractor

一个 Chrome 扩展 + Python 脚本的组合工具，用于从 YouTube 页面提取视频 URL 并批量下载。

## 功能特点

- 从 YouTube 频道页面、播放列表页面提取所有视频 URL
- 支持过滤功能：
  - 限制前 N 个视频
  - 按标题包含关键词筛选
  - 按标题排除关键词
- 可选择性地导出视频 URL
- 配套 Python 脚本支持批量下载

## 目录结构

```
url-extractor/
├── manifest.json        # Chrome 扩展配置
├── popup.html           # 扩展弹窗界面
├── popup.css            # 界面样式
├── popup.js             # 弹窗逻辑
├── content.js           # 内容脚本（提取 URL）
├── batch_download.py    # Python 批量下载脚本
├── icons/               # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── generate_icons.py  # 图标生成脚本
└── README.md
```

## 安装说明

### 1. 安装 Chrome 扩展

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的 **开发者模式** (Developer mode)
3. 点击 **加载已解压的扩展程序** (Load unpacked)
4. 选择 `url-extractor` 目录
5. 扩展图标会出现在浏览器工具栏中

### 2. 生成图标（如果需要）

如果图标文件不存在，运行以下命令生成：

```bash
cd url-extractor/icons
python generate_icons.py
```

### 3. 准备 vYtDL

确保 vYtDL 已构建并可用：

```bash
cd ../../vYtDL
go build -o vYtDL .
```

## 使用说明

### 步骤 1：提取视频 URL

1. 在 Chrome 中访问 YouTube 频道页面，例如：
   - `https://www.youtube.com/@PredictiveHistory/videos`
   - `https://www.youtube.com/playlist?list=PLAYLIST_ID`

2. 点击浏览器工具栏中的扩展图标

3. 在弹出的窗口中设置过滤条件：
   - **前 N 个视频**: 限制提取数量
   - **标题包含**: 只提取标题包含此关键词的视频
   - **标题排除**: 排除标题包含此关键词的视频

4. 点击 **获取视频列表** 按钮

5. 在列表中选择要下载的视频（点击视频项或使用全选/取消全选）

6. 点击 **导出选中 URL** 或 **导出全部 URL**

7. 保存 txt 文件（例如 `youtube_urls.txt`）

### 步骤 2：批量下载视频

使用 Python 脚本批量下载：

```bash
# 基本用法
python batch_download.py youtube_urls.txt ./downloads

# 指定质量
python batch_download.py youtube_urls.txt ./downloads --quality 1080

# 指定格式
python batch_download.py youtube_urls.txt ./downloads --format webm

# 下载播放列表
python batch_download.py youtube_urls.txt ./downloads --playlist

# 组合参数
python batch_download.py youtube_urls.txt ./downloads -q 720 -f mp4
```

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `url_file` | URL 文件路径 | (必需) |
| `output_dir` | 输出目录 | `./downloads` |
| `-q, --quality` | 视频质量 (720, 1080, 2160) | best |
| `-f, --format` | 输出格式 (mp4, webm, mkv) | mp4 |
| `-p, --playlist` | 将 URL 作为播放列表处理 | false |
| `--log-format` | 日志格式 (json, csv) | json |

## URL 文件格式

URL 文件是纯文本格式，每行一个 URL：

```text
https://www.youtube.com/watch?v=VIDEO_ID_1
https://www.youtube.com/watch?v=VIDEO_ID_2
https://www.youtube.com/watch?v=VIDEO_ID_3
# 以 # 开头的行是注释，会被忽略
https://www.youtube.com/watch?v=VIDEO_ID_4
```

## 依赖

- Chrome 浏览器（支持 Manifest V3）
- Python 3.6+（用于批量下载脚本）
- vYtDL（配套的下载工具）
- yt-dlp（vYtDL 的依赖）

## 常见问题

### Q: 扩展无法获取视频列表？

1. 确保当前页面是 YouTube 页面
2. 刷新页面后重试
3. 检查浏览器控制台是否有错误信息

### Q: 批量下载失败？

1. 确保 vYtDL 已正确构建
2. 确保 yt-dlp 已安装并在 PATH 中
3. 检查 vYtDL/config.json 中的 yt-dlp 路径配置

### Q: 如何下载播放列表？

1. 使用扩展从播放列表页面提取 URL
2. 运行下载脚本时添加 `--playlist` 参数

## 许可证

MIT
