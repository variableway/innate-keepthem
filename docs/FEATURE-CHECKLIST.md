# 功能清单与验证矩阵（Feature Checklist & Verification Matrix）

> 2026-08-16 基于当前代码（PR #10 合并后）整理。每个功能列出**需要验证的内容**（操作步骤 + 预期结果）。
>
> 图例：**[A]** = 已有自动化覆盖（CI/单测）；**[M]** = 需手工验证；**[A+M]** = 两者兼有。
> 本文档用途：发布前回归清单 / 新成员验证环境 / QA 用例来源。

---

## 1. vYtDL CLI（tools/vytdl-cli）

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 1.1 | 单视频下载 | `./vYtDL download --no-tui -o ./downloads -q 1080 "URL"`：文件生成于指定目录，清晰度 ≤1080；退出码 0 | [M] |
| 1.2 | 播放列表下载与断点续传 | 带 `--playlist` 下载列表，中断后重跑：已下条目跳过，未下条目继续（检查 download_record.json 增量） | [M] |
| 1.3 | 字幕默认策略 | 下载 YouTube 视频：默认下载 en+zh 字幕/自动字幕，字幕文件与视频同目录 | [M] |
| 1.4 | yt-dlp 预置解析顺序 | ① PATH 有 yt-dlp 时直接用；② 无 PATH 时 `--install-yt-dlp` 装到 `~/Library/Caches/vYtDL`；③ `config.json` 指定 `yt_dlp_bin` 时优先使用；④ 镜像 `VYTDL_YTDLP_MIRROR` 生效（慢网络可下载成功） | [M] |
| 1.5 | 编译与单测 | `go build ./...` + `go test ./...`（config/downloader/record/vtt/ytdlpbin 全绿） | [A] |
| 1.6 | 与桌面端同源 | `python3 scripts/build-desktop.py cli` 产出的 sidecar 与独立构建版本行为一致（同 URL 同参数产出相同） | [M] |
| 1.7 | TUI 模式 | `./vYtDL download "URL"`（无 --no-tui）：TUI 渲染、进度刷新、退出干净（无残留终端状态） | [M] |
| 1.8 | analyze 命令 | `./vYtDL analyze "URL"`：产出 VTT/字幕分析 JSON，桌面端 sidecar 路径调用同参数一致 | [M] |

## 2. vYtDL Desktop（apps/vytdl-desktop）

### 2.1 下载表单

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 2.1.1 | 单视频模式 | 输入 URL -> 自动解析（封面/标题/作者/时长显示）-> 提交 -> 入队 | [M] |
| 2.1.2 | 批量模式 | 多行 URL：逐条入队，批量进度条（submitted/total/failed）正确 | [M] |
| 2.1.3 | **Format Picker（新）** | 解析后点"高级格式选择"：视频轨（有分辨率）/音频轨（无分辨率）两组列表、大小显示；选中后提交，日志中 `-f <format_id>` 生效，产物为所选格式 | [M] |
| 2.1.4 | 清晰度预设 | best/2160/1080/720/480 各选一次：`-f` 参数与产物清晰度匹配 | [M] |
| 2.1.5 | 容器格式 | mp4/webm/mkv：`--merge-output-format` 生效；**选 webm + 嵌入缩略图时自动去缩略图**（坑知识 #2） | [M] |
| 2.1.6 | 字幕选择 | 勾/去勾语言：`--sub-langs` 与实际字幕文件匹配；自动字幕开启时日志含 `--sleep-subtitles 1`（坑知识 #3） | [M] |
| 2.1.7 | 时间范围 | 填 start/end：日志含 `--download-sections *s-e` + `--compat-options no-direct-merge` + muxed 安全选择器（坑知识 #1）；产物时长 ≈ 裁剪范围，进度条不卡死 | [M] |
| 2.1.8 | **高级选项折叠区（新）** | 嵌入缩略图/元数据/章节、SponsorBlock、限速开关逐项验证：对应参数出现在命令日志；ffprobe 检查产物元数据/章节确实嵌入 | [M] |
| 2.1.9 | URL 历史 | 下载成功后 URL 入历史（最多 50 条去重），点击可回填 | [M] |

### 2.2 队列与执行

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 2.2.1 | 并发队列 | 设置并发 1-10：同时活跃下载数不超过设定值；完成后 pending 自动补位 | [M] |
| 2.2.2 | 取消 | 取消下载中任务：进程树被杀（`ps` 无孤儿 yt-dlp/ffmpeg），输出目录 `.part/.ytdl` 残留被清理 | [M] |
| 2.2.3 | **暂停/恢复（新）** | 下载中点暂停：进程状态变 T（stopped）、进度停住；恢复后继续且文件完整（`kill -l` 无需重下）；**Windows 上按钮返回友好错误提示** | [M] |
| 2.2.4 | **韧性自动重试（新）** | ① 构造格式失败（`-f 999`）：日志出现 `[韧性重试] 回退到安全格式选择器`，最终成功；② 429/需登录视频：**不自动重试**，直接失败并显示分类徽章 | [M] |
| 2.2.5 | **错误分类（新）** | 各失败场景的徽章与提示：需登录（AuthRequired）/限流（RateLimited）/格式不可用/网络瞬断/工具缺失；hint 文案可操作 | [M] |
| 2.2.6 | 韧性引擎单测 | `cargo test --lib resilience`：7 个分类/决策测试全绿（含 403+Sign in 判鉴权） | [A] |
| 2.2.7 | **精确输出路径（新）** | 下载含后处理任务（转容器/改名）：SQLite 记录与"打开文件夹"定位到**真实落盘文件**（含 yt-dlp 内部重命名后） | [M] |
| 2.2.8 | **双槽进度（新）** | 下载高分辨率视频：进度日志出现 `VYTDL_PROG` CSV 行；前端 video_percent/audio_percent 双值；合并后 100% | [M] |
| 2.2.9 | 重启恢复 | 下载中强退应用再启动：任务状态正确（不显示进行中）、历史完整 | [M] |

### 2.3 设置

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 2.3.1 | 基础设置 | yt-dlp 路径/输出目录/默认质量/格式/字幕语言/并发/界面语言：保存后重开保持 | [M] |
| 2.3.2 | **Cookie 四模式（新）** | ① 无：不加参数；② 文本：粘贴 Netscape 文本后下载需登录视频成功（app_data 生成 cookies 文件）；③ 文件：选择 cookies.txt 生效；④ 浏览器：`--cookies-from-browser chrome` 生效（需浏览器未锁 cookie 库）；未配置源时给明确错误 | [M] |
| 2.3.3 | **代理（新）** | 配置代理：命令日志含 `--proxy` + `--no-check-certificates`；经代理可下载墙外视频 | [M] |
| 2.3.4 | **引擎参数（新）** | 限速（`-r 2M` 实测速度受控）、并发分片（`--concurrent-fragments`）、文件名模板（产物文件名按模板）、PO Token/extractor-args（YouTube 字幕 403 场景恢复） | [M] |
| 2.3.5 | **config-location（新）** | 不填：强制 `--ignore-config`（家目录配置不干扰）；填写：`--config-locations` 生效 | [M] |

### 2.4 其他桌面功能

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 2.4.1 | VTT 分析 | 分析页跑字幕转 Markdown：报告入库、列表分页、语言过滤 | [M] |
| 2.4.2 | 音频提取 | 完成项提取音频：ffmpeg 产出 m4a/mp3 | [M] |
| 2.4.3 | 多语言 | 中/英/日切换：全部界面文案切换（新增"网络与高级"区当前为双语文面量，已知项） | [M] |
| 2.4.4 | CLI sidecar | 打包版无 PATH yt-dlp/CLI 时：`find_vytdl_cli` 命中应用旁 sidecar，analyze 功能可用 | [M] |
| 2.4.5 | yt-dlp 资源预置 | `python3 scripts/download-yt-dlp-binaries.py`：3 平台下载解压（镜像可用）；cargo check 通过 | [M] |

## 3. vYtDL Web（apps/vytdl-web）

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 3.1 | 下载 API | `/api/start-download` 等全套：入队/取消/重试/删除/列表，`{success,data}` 契约 | [M] |
| 3.2 | 元信息 API | video-info/video-formats/playlist-info 返回正确结构 | [M] |
| 3.3 | WebSocket | `/api/ws`：进度/日志/队列事件按文档节流推送 | [M] |
| 3.4 | 队列并发 | 并发 1-10（默认 3）生效 | [M] |
| 3.5 | Docker 部署 | `docker-compose up -d`：容器健康、卷持久化（downloads/db）、静态托管 SPA fallback | [M] |
| 3.6 | 构建 | `pnpm --filter @vytdl/web-server build`（tsc）通过 | [A] |

## 4. URL Extractor（extensions/url-extractor）

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 4.1 | 页面提取 | 在 YouTube 频道/视频/播放列表页提取：数量正确、videoId 去重、规整为 watch?v= | [M] |
| 4.2 | 过滤与导出 | 标题包含/排除过滤、数量上限、勾选导出 TXT（每行一个 URL） | [M] |
| 4.3 | 已知局限 | Shorts 链接被过滤、youtu.be 域不注入（STATUS 已记录，验证不回归） | [M] |

## 5. ContentForge 生态

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 5.1 | Python 包导入 | venv 内 import 全包（含 yaml 依赖模块）无错误 | [M] |
| 5.2 | Go 桥接 | `.venv-cf` 就绪时 `contentforge pipeline list`：返回 5 个真实预设（非硬编码 fallback 列表） | [M] |
| 5.3 | scrape | `contentforge scrape "https://..." --output ./o`：产出 content.json（需 agent-reach 在 PATH） | [M] |
| 5.4 | process | 对产物执行 `--summarize`（需 AI API key）：摘要字段填充 | [M] |
| 5.5 | publish | Go 端渲染 markdown/xiaohongshu 格式正确 | [M] |
| 5.6 | pipeline run | `twitter_to_xiaohongshu` 全链路（采集->翻译->摘要->转换）产出小红书文案 | [M] |
| 5.7 | 已知未完成 | create 的预设无法 run、transcriber 仅提音频、publishing 空壳（STATUS 记录，验证不误报为可用） | [M] |
| 5.8 | 桌面端构建 | contentforge-desktop `next build` 通过（下载页占位）+ cargo check 通过 | [A] |

## 6. 工程基建

| # | 功能 | 需要验证的内容 | 方式 |
|---|---|---|---|
| 6.1 | 统一 CI | push/PR 触发 5 job（Go/Rust×2/Node/Python）全绿；concurrency 生效（同分支旧跑取消） | [A] |
| 6.2 | CLI sidecar 构建 | `task desktop:cli` / `build-desktop.py cli`：按 Rust triple 命名产出；交叉编译 `--target x86_64-pc-windows-msvc` 产出 exe | [M] |
| 6.3 | 锁文件一致性 | `pnpm install --frozen-lockfile` 干净环境成功（CI 已覆盖） | [A] |
| 6.4 | 文档链接 | docs/ 全部内链可达（尤其 specs 迁移后路径） | [M] |

---

## 验证入口速查

```bash
# 自动化（本地复现 CI）
cd tools/vytdl-cli && go build ./... && go test ./... && cd ../..
python3 scripts/build-desktop.py cli && python3 scripts/download-yt-dlp-binaries.py
cargo test --manifest-path apps/vytdl-desktop/src-tauri/Cargo.toml --lib
cargo check --manifest-path apps/vytdl-desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/contentforge-desktop/src-tauri/Cargo.toml
pnpm install --frozen-lockfile && pnpm run build
python3 -m compileall -q packages/contentforge-core/python scripts

# 桥接冒烟
source packages/contentforge-core/scripts/cf-env.sh
tools/contentforge-cli 构建产物 pipeline list
```

> 缺口：桌面端 UI 层目前**零自动化**（无 e2e），2.x 节全部依赖手工；Python 核心无单测（5.x 仅冒烟）。改进项见 STATUS.md 工程面。
