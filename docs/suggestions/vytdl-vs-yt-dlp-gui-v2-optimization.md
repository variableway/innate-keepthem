# vYtDL Desktop 优化建议：对齐 yt-dlp-gui-v2 用户能力

> 2026-08-16 更新：P0-P3 框架经代码复核全部成立；两处技术细节已勘误（见 P2-5、P2-7）。两仓库合并版统一借鉴清单见 **[borrow-from-yt-dlp-guis.md](./borrow-from-yt-dlp-guis.md)**。

> **日期**: 2026-08-04  
> **对比对象**: [yt-dlp-gui-v2](https://github.com/kannagi0303/yt-dlp-gui-v2)（Rust + egui） vs 当前 `vYtDL-desktop`（Tauri + Next.js）  
> **目标**: 按优先级列出需优化内容，并标明对应 UI 改动

---

## 1. 一句话结论

**yt-dlp-gui-v2 是完整的「yt-dlp 专业前端」；当前 vYtDL-desktop 是「带队列的简化下载器」。**

对用户最大的差别不是技术栈，而是：**能不能真正配置 yt-dlp**（Cookie / 精确格式 / 片段下载 / 网络与加速 / 失败恢复）。

| 维度 | 谁更强 |
|------|--------|
| yt-dlp 能力覆盖 / Cookie / 格式选择 / 韧性 | **yt-dlp-gui-v2** |
| 队列、持久化、并发、多端部署（Desktop + Web） | **当前 vYtDL** |
| VTT 分析、AI 摘要、Workspace | **当前 vYtDL**（差异化） |

---

## 2. 对用户最大的 yt-dlp 差别（已写入优先级）

| 排名 | 差别 | 用户体感 |
|------|------|----------|
| 1 | Cookie / 登录鉴权 | 年龄限制、会员、地区限制视频直接失败 |
| 2 | 精确 Format Picker | 只能选「1080p」，不能选具体编码/大小/音轨 |
| 3 | 章节 / 时间范围 | 想下某一段，UI 没有入口（后端其实已支持 `start_time`/`end_time`） |
| 4 | 代理 / aria2 / 限速 | 慢、被墙、碎片并发调不了 |
| 5 | 错误分类 + 自动回退 | 失败只显示日志，不知道要 Cookie 还是换格式 |

---

## 3. 现状速览

### 3.1 当前 vYtDL Desktop 已有

- Single / Batch / Smart 三种下载模式
- 质量预设（best / 2160…360）+ 容器格式（mp4/webm/mkv/mov）
- 字幕语言 + 自动字幕开关
- 后端队列（`max_concurrent`）+ SQLite 持久化 + 启动恢复
- 下载列表：进度、日志、重试、删除、打开文件夹、提取音频
- Settings：yt-dlp 路径、输出目录、语言、默认质量、并发、AI
- Library / Player / Analyze / Workspace（产品向能力）

### 3.2 后端已有、UI 未暴露

- `start_time` / `end_time` → 已传 `--download-sections`
- `VideoInfo.formats[]` → 已拉取，未用于选择
- `cancel_download` → store 有，列表未接按钮
- `paused` 状态类型存在，无暂停 UI

### 3.3 yt-dlp-gui-v2 用户可配能力（摘要）

- Format Picker（video / audio / subtitle / section，含章节与自定义时间范围）
- Cookie：关 / 浏览器 / 文件 + Cookie Manager + 登录救援
- Network：代理、跳过证书校验
- Download：aria2、并发碎片、限速、直播从开头下
- Post-processing：缩略图/字幕/章节的下载或嵌入、转码
- Prepare：依赖检测与安装（yt-dlp / FFmpeg / Deno / aria2）
- 队列：停止、打开文件、复制路径、按项改名与输出目录

---

## 4. 优先级清单

### P0 — 必须先做（下载能不能成功）

> 直接决定「下得下来」；每项对应第 2 节的最大用户差别。

| # | 优化项 | 为何优先 | UI 要改什么 |
|---|--------|----------|-------------|
| 1 | **Cookie 支持**（`--cookies-from-browser` / `--cookies`） | 最大用户差距 #1 | **Settings 新增「Network & Access」**：Cookie 关 / 浏览器 / 文件；浏览器选择 + cookies.txt 路径；下载失败时在表单旁显示「需要 Cookie」提示条 |
| 2 | **Format Picker（按 format_id）** | 最大用户差距 #2；`formats` 已拉到未展示 | **Single 模式预览区**：质量下拉改为「快速预设 + 高级选择」；点「选择格式」打开 Modal，表格列：分辨率 / fps / codec / 大小 / 音轨；确认后写入 `format_id` |
| 3 | **时间范围 / 章节 UI** | 最大用户差距 #3；后端已有字段 | **下载表单 Advanced 折叠区**：开始/结束时间；若 metadata 有 chapters，多选章节生成 `--download-sections` |
| 4 | **代理配置** | 最大用户差距 #4 | **Settings → Network**：启用代理 + URL；证书跳过开关；全局传给 yt-dlp |
| 5 | **下载列表取消按钮** | 后端已有，UI 未接 | **download-list 行操作**：下载中显示「停止」；取消态可重试 |
| 6 | **错误分类 + 可操作提示** | 最大用户差距 #5 | 失败态展示原因标签（需登录 / 格式不可用 / 网络）；按钮：「配置 Cookie」「换格式重试」「仅重试」 |

### P1 — 体验与控制力（像专业下载器）

| # | 优化项 | 说明 | UI 要改什么 |
|---|--------|------|-------------|
| 1 | **下载韧性：格式自动回退** | 借鉴 v2 `RetryWithFormatFallback` | Settings 开关「格式不可用时自动回退」；列表失败时可看「已自动降级」日志徽章 |
| 2 | **aria2 外挂加速** | 大文件 / 多碎片更快 | Settings → Download Engine：启用 aria2 + 路径检测；未安装时引导安装 |
| 3 | **并发碎片 / 限速** | `--concurrent-fragments`、`-r` | Settings → Download Advanced：碎片数滑条、限速输入（如 `2M`） |
| 4 | **缩略图 / 章节 下载或嵌入** | v2 post-processing | Settings → Post-processing：缩略图下载/嵌入、章节嵌入；表单可覆盖 |
| 5 | **打开文件 / 复制路径** | 现在只有打开文件夹 | download-list + Library：增加「打开文件」「复制路径」 |
| 6 | **表单读 Settings 默认值** | 默认质量/格式/字幕不同步 | 表单挂载时从 `settingsStore` 初始化；Settings 保存后提示「新下载将使用新默认值」 |
| 7 | **输出目录选择器可用** | Settings 文件夹按钮目前无效 | Settings / 表单：真正的目录选择（Tauri dialog）；表单可「本次覆盖输出目录」 |

### P2 — 工作流与队列（批量场景）

| # | 优化项 | 说明 | UI 要改什么 |
|---|--------|------|-------------|
| 1 | **Playlist 智能确认** | 视频页带 playlist 参数时询问 | Smart/Single 提交前 Dialog：仅视频 / 整列表；可记住偏好 |
| 2 | **高风险列表警告 + 批量上限** | 防止误下几百集 | Settings：批量上限；超过时确认 Dialog |
| 3 | **剪贴板监听 / 自动添加** | v2 clipboard monitor | Settings 开关；可选提示「检测到链接」 |
| 4 | **队列项内编辑文件名** | 下载前改名 | 列表 pending 行可内联编辑文件名 |
| 5 | **暂停 / 恢复下载** | ⚠️ 勘误（2026-08-16）：暂停并非 v2 功能（v2 只有取消）；真实参照是 **yt-dlp-gui（v1）** 的 `process.rs`（Unix SIGSTOP/SIGCONT，Windows 线程挂起） | 列表：暂停/继续；状态徽章 `paused` |
| 6 | **Library Play 接线** | Play 按钮无 handler | 点 Play 跳转 `/player/[id]`；无本地文件时禁用并提示 |
| 7 | **进度解析改 `--progress-template`** | 更稳的速度/ETA | ⚠️ 勘误（2026-08-16 代码核实）：v2 实际用 **CSV 模板（首字段 format_id）** 而非 JSON，正是 format_id 让进度可按 video/audio 分槽路由；照抄 JSON 会丢掉这套逻辑。详见 [borrow-from-yt-dlp-guis.md](./borrow-from-yt-dlp-guis.md) |

### P3 — 完善与差异化（后置）

| # | 优化项 | 说明 | UI 要改什么 |
|---|--------|------|-------------|
| 1 | **首次 Prepare / 依赖安装** | 检测 yt-dlp、FFmpeg、Deno、aria2 | 新引导页或 Settings → Tools：状态灯 + 一键安装 |
| 2 | **yt-dlp config 文件** | `--config-locations` | Settings：配置文件路径浏览 |
| 3 | **下载后转码流水线** | v2 Processing tab | Settings 开关 + 可选「转换」页 / 任务日志表 |
| 4 | **音频模式 / 内置播放增强** | v2 Audio mode | 表单模式「仅音频」；Library 音频卡片直达播放器 |
| 5 | **Cookie Manager / 登录救援** | 完整 Cookie 文件管理 + 浏览器登录导出 | Settings 子弹「Cookie Manager」；失败流「获取 Cookie」向导 |
| 6 | **SponsorBlock / 直播从开头下** | 进阶 yt-dlp 能力 | Advanced 折叠：SponsorBlock 开关；直播选项 |
| 7 | **Settings 分区重构** | 功能混在一页 | 分栏：General / Network / Download / Post-process / Tools / AI |

---

## 5. UI 改动总览（按页面）

```
首页 Download Form
├── [P0] Format Picker Modal（替换/补充质量下拉）
├── [P0] Advanced：时间范围 + 章节
├── [P0] 失败提示条 → Cookie / 换格式
├── [P1] 本次输出目录覆盖
└── [P2] Playlist 确认 Dialog

Download List
├── [P0] 停止/取消
├── [P0] 错误标签 + 操作按钮
├── [P1] 打开文件 / 复制路径
└── [P2] 暂停、内联改名

Settings
├── [P0] Network & Access（Cookie + 代理）
├── [P1] Download Advanced（aria2 / 碎片 / 限速 / 后处理）
├── [P1] 目录选择器修好
└── [P3] Tools / Prepare / 分区导航

Library / Player
├── [P1] 打开文件等动作对齐
└── [P2] Play 跳转修复
```

---

## 6. 建议落地顺序（最短路径）

1. **P0 取消按钮** — 成本最低，立刻可用  
2. **P0 Cookie + 失败提示** — 解决「下不了」  
3. **P0 Format Picker** — 解决「下不对」  
4. **P0 时间范围 UI** — 后端已有，只接表单  
5. **P0 代理** — 网络环境刚需  
6. 再进 P1：韧性 / aria2 / 后处理  

**若只做一件事：先做 Cookie + Format Picker**——这是和 v2 对用户差别最大、也最能立刻拉开体验的两点。

---

## 7. 相关代码与文档

| 路径 | 说明 |
|------|------|
| `apps/vytdl-desktop/src/components/download-form.tsx` | 下载表单 |
| `apps/vytdl-desktop/src/components/download-list.tsx` | 下载列表 |
| `apps/vytdl-desktop/src/app/settings/page.tsx` | 设置页 |
| `apps/vytdl-desktop/src-tauri/src/downloader.rs` | yt-dlp 参数组装 |
| `apps/vytdl-desktop/src-tauri/src/queue.rs` | 队列管理 |
| `yt-dlp-gui-v2/src/app/download_resilience.rs` | 错误分类与恢复决策参考 |
| `yt-dlp-gui-v2/src/app/download_worker.rs` | 下载工作线程参考 |
| `docs/archive/contentforge/plan/ytdownload-refactor.md` | 早期调研与架构对比 |

---

## 8. 刻意不做 / 后置说明

- **不整体换成 egui**：技术栈与 ContentForge / Web 部署不一致  
- **不优先做内置音乐播放器（symphonia）**：非下载主路径，属 P3  
- **保留 vYtDL 差异化**：Analyze、AI 摘要、Workspace、Docker Web 继续作为产品优势

---

## 9. 相关：平台覆盖

平台白名单与 yt-dlp 可支持站点清单见：[supported-platforms.md](./supported-platforms.md)。
