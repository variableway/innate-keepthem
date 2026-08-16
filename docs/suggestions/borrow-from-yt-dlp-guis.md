# 从 yt-dlp-gui / yt-dlp-gui-v2 可借鉴的功能清单

> 2026-08-16 对两个参考仓库（均为本仓库 submodule）的全量代码审读结论。与 [vytdl-vs-yt-dlp-gui-v2-optimization.md](./vytdl-vs-yt-dlp-gui-v2-optimization.md)（2026-08-04 的 v2 对比，其 P0-P3 框架经代码核实仍然成立）互补：本文给出**两个仓库合并后的统一借鉴清单**。
>
> 两个仓库恰好互补：
> - **yt-dlp-gui**（imsyy，Tauri 2 + Vue）：强在**浏览器集成、进程控制、工具箱、产品化细节**
> - **yt-dlp-gui-v2**（kannagi0303，egui + Rust ~8.9 万行）：强在**下载韧性引擎、Cookie 体系、yt-dlp 专业参数、转码流水线**

---

## 一、统一 TOP 10（两库合并，按 用户价值 / 移植成本 排序）

| # | 功能 | 来源 | 成本 | 一句话价值 |
|---|---|---|---|---|
| 1 | **错误分类 + 恢复决策引擎** | v2 | 低（~900 行纯函数带测试） | 失败不再是黑盒：11 类错误分类 + 5 种分级恢复（缩略图失败去缩略图重试、格式失败回退选择器、后处理失败保主文件、429/登录不盲重试） |
| 2 | **精确输出路径捕获** | v1+v2 | 极低（2 行参数 + 读文件） | `--print-to-file after_move:filepath` / `--print after_move:` 拿到后处理改名后的真实路径，SQLite 记录不再靠拼接猜测；Windows GBK 乱码免疫 |
| 3 | **Cookie 全家桶**（四模式 + 按站点自动 + 登录救援） | v1+v2 | 低-中 | 最大用户差距：无/文本/文件/浏览器四模式（v1），`sites.yaml` 按站点自动选 cookie（v2），CDP 临时浏览器导出 cookies（v2，二期） |
| 4 | **进度协议升级**（progress-template CSV + format_id 槽路由） | v2 | 低 | 速度/字节/ETA 原生数值，video/audio/subtitle 三条进度独立；替代现正则解析（英文格式依赖） |
| 5 | **Format Picker + 下载前配置区** | v1+v2 | 中 | `-J` 元数据 -> 纯视频/纯音频分离排序 + 文件大小预估 -> `-f format_id` 精确下载；v1 的多标签"待下载工作区"交互最佳 |
| 6 | **网络与专业参数包** | v2 | 低 | 代理+跳证书+aria2（含代理透传）+限速+并发碎片+PO Token/extractor-args+`--config-location` 带所有权检测+默认 `--ignore-config`，全部十几行一段 |
| 7 | **真实暂停/恢复**（进程挂起） | v1 | 低(Unix)/中(Win) | `kill -STOP/-CONT`（Unix）或线程挂起（Win），不杀进程不丢数据；v2 反而没有此功能 |
| 8 | **浏览器扩展 + 深链接 + Cookie 随行** | v1 | 中 | MV3 扩展右键发送 -> `vytdl://download?url=&cookies=`（base64 Netscape cookie）-> 桌面端唤起；解决桌面拿不到浏览器登录态的根本问题 |
| 9 | **嵌入后处理全家桶** | v1+v2 | 低 | `--embed-thumbnail/metadata/chapters/subs` 四开关 + SponsorBlock + 时间裁剪 + `--recode-video` + 自定义 `--postprocessor-args`；v2 还有 Off/Download/Embed 三态模型 |
| 10 | **韧性细节包**（进程树取消+崩溃保护、`.part` 清理、任务重启恢复） | v1+v2 | 低 | taskkill /T 防孤儿 yt-dlp；panic hook 全局子进程表；取消连 `.part` 删除；重启后标中断+文件存在性剔除 |

## 二、次优先（价值明确、按需排期）

| 功能 | 来源 | 说明 |
|---|---|---|
| 文件命名模板（6 预设 + 变量点击插入） | v1 | `%(title).200s [%(id)s]` 防超长 + `--windows-filenames` |
| 高风险播放列表分类 + 批量上限 | v2 | 纯函数直接抄：Mix/Radio（RD*）、频道生成（UULP/UUSH）、Liked（LL）、专辑（OLAK5UY_）识别 |
| 流式批量导入（`--flat-playlist --lazy-playlist` 逐行入队） | v2 | 大列表秒级首条可见、可中途停；vYtDL 的并发队列比 v2 串行队列更好承接 |
| 剪贴板监听（800ms 节流 + 基线去重） | v2 | 粘贴即得 |
| 命令行预览/日志页 | v2 | 每次执行的完整 yt-dlp 命令可查可复制，专业用户信任感 |
| 字幕工具台（双语 SRT/VTT 合成、ASS/LRC 导出、播放列表聚合） | v1 | 与 vYtDL 现有 VTT->Markdown 形成 完整字幕能力；纯前端可移植 |
| yt-dlp 插件管理（`--plugin-dirs` + zip 安装） | v1 | ChromeCookieUnlock 等社区插件一键装 |
| 文件时间戳三态（保留/上传日期/下载时间） | v2 | 媒体库整理刚需，与 Library 互补 |
| 任务栏进度条 + 通知分档 | v1 | Tauri `setProgressBar` + notification 插件 |
| 封面/章节/评论/直播弹幕工具箱 | v1 | `--write-comments` 评论抓取（含楼中楼结构）、JSONL 弹幕解析回放；对 contentforge 内容存档方向有价值 |
| 依赖自更新（yt-dlp/ffmpeg 版本检查+sha256+备份回滚） | v2 | vYtDL 已有预置，补"更新"能力 |
| 缓存/临时目录策略清理 | v2 | 磁盘卫生，策略表模式 |
| 转码流水线（意图式：5 意图 x 12 设备 profile，硬件编码降级链） | v2 | 大功能，排 P3；思路是"用户选意图，参数全推导" |
| 应用内更新（updater 插件 + 签名 + latest.json） | v1 | 需 CI 产签名产物配合 |

## 三、必抄的"坑知识"（不改架构也该知道）

1. **章节/时间裁剪必须加 `--compat-options no-direct-merge` + muxed 安全选择器**（`best[protocol!*=dash][vcodec!=none][acodec!=none]/best`），否则进度条卡死在 Destination（v2 `tools.rs:684-743`）
2. **webm 容器要禁封面内嵌**（`--no-embed-thumbnail`，v2 `tools.rs:746-762`）
3. **自动翻译字幕加 `--sleep-subtitles 1` 防限流**（v2 `tools.rs:1220-1224`）
4. **CSV 进度里数字 format_id 不能当百分比解析**（v2 `download_worker.rs:1479-1494` 有注释与测试）
5. **成功判定只用退出码**，`[download] Destination` 行不能当成功依据（v1 经验）
6. **`--ignore-config` 应默认开启**（除非用户显式选 config），杜绝家目录 yt-dlp.conf 意外干扰（v2）
7. `-J` 快速失败参数：`--socket-timeout 15 --retries 3 --extractor-retries 2`（v1 `common.rs:70-83`）
8. 子进程环境统一 `PYTHONUTF8=1 PYTHONIOENCODING=utf-8`，Windows 加 `CREATE_NO_WINDOW`（两库同款）
9. "403 + Sign in" 应判为**鉴权失败**而非网络错误（分类顺序即学问，v2 有测试锁定）

## 四、刻意不做

- **egui 自绘 UI / XAML-taffy 布局**（v2）：与 Next.js 前端无关
- **内置音乐播放器全家桶**（v2，~2.7 万行 symphonia/PCM/LRC）：非下载主路径
- **串行队列**（v2）：vYtDL 的 SQLite + 并发队列更强，勿倒退
- **12-15 种语言**：中英日三语足够，翻译维护成本不划算
- **Deno JS runtime 自动管理**（v1）：先观察 yt-dlp 新版 403 频率再决定
- **关闭最小化到托盘**（v1）：工作台型应用用户预期直接退出

## 五、建议落地顺序

```
第一批（全是低垂果实，1-2 个 PR）：#2 路径捕获 + #4 进度协议 + #6 参数包 + #10 韧性细节 + 三、坑知识全部
第二批（核心体验）：#1 韧性引擎 + #3 Cookie（四模式先行，救援二期）+ #7 暂停/恢复
第三批（交互升级）：#5 Format Picker + 配置区 + #9 后处理全家桶 + #8 浏览器扩展/深链接
```

关键代码位置速查：
- v1：`yt-dlp-gui/src-tauri/src/commands/{download,video,tools,setup}.rs`、`parser.rs`、`process.rs`、`browser-extension/`
- v2：`yt-dlp-gui-v2/src/app/{download_resilience,download_worker,queue_worker_actions,queue_input_actions}.rs`、`src/tools.rs`、`src/config.rs`、`src/domain/`
- vYtDL 落点：`apps/vytdl-desktop/src-tauri/src/{downloader,queue,commands}.rs`、`src/components/{download-form,download-list}.tsx`、`src/app/settings/`
