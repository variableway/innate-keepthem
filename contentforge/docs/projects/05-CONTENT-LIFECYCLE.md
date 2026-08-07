# ContentForge — 内容生命周期

> 文档版本: v1.0  
> 更新日期: 2026-08-03  
> 核心实体: ContentUnit

---

## 一、生命周期总览

ContentUnit 是 ContentForge 中**贯穿全生命周期的核心数据实体**。它从被采集的那一刻起，经历处理、编辑、最终到达发布就绪状态。

```
采集 (Ingestion)          处理 (Processing)          编辑 (Editing)           发布 (Publishing)
     │                         │                         │                        │
     ▼                         ▼                         ▼                        ▼
┌─────────┐              ┌─────────┐              ┌─────────┐              ┌─────────┐
│ URL输入  │              │ AI摘要   │              │ 人工修改 │              │ 导出    │
│ 文件导入 │     →       │ AI翻译   │     →       │ 格式调整 │     →       │ 多平台  │
│ 插件采集 │              │ AI分析   │              │ 标签管理 │              │ 发布    │
└────┬────┘              └────┬────┘              └────┬────┘              └────┬────┘
     │                         │                         │                        │
  ingested                 processed                 ready                 published
```

---

## 二、状态机

```
                              ┌─────────────────────────────────────┐
                              │                                     │
┌─────────┐   ┌──────────┐   ▼  ┌──────────┐   ┌────────┐   ┌──────────┐
│         │   │          │       │          │   │        │   │          │
│ ingested│──→│processing│──────→│processed │──→│editing │──→│  ready   │
│         │   │          │       │          │   │        │   │          │
└────┬────┘   └────┬─────┘       └────┬─────┘   └───┬────┘   └────┬─────┘
     │             │                  │             │             │
     │             │                  │             │             │
     │             └──────────────────┘             │             │
     │                                              │             │
     │         ┌────────────────────────────────────┘             │
     │         │                                                  │
     └────────→│  failed  │←──────────────────────────────────────┘
               │          │
               └──────────┘
```

### 状态定义

| 状态 | 值 | 说明 |
|------|-----|------|
| `INGESTED` | `ingested` | 已采集，原始内容已存储 |
| `PROCESSING` | `processing` | 正在进行 AI 处理 |
| `PROCESSED` | `processed` | AI 处理完成（摘要/翻译/分析） |
| `EDITING` | `editing` | 用户正在编辑 |
| `READY` | `ready` | 编辑完成，待发布 |
| `PUBLISHED` | `published` | 已发布/导出 |
| `FAILED` | `failed` | 处理失败 |

### 状态转换规则

| 从 | 到 | 触发条件 |
|----|-----|---------|
| `ingested` | `processing` | 用户发起 AI 处理 |
| `processing` | `processed` | AI 处理成功完成 |
| `processing` | `failed` | AI 处理失败 |
| `processed` | `editing` | 用户开始编辑 |
| `editing` | `ready` | 用户确认编辑完成 |
| `ready` | `published` | 用户执行发布/导出 |
| `failed` | `processing` | 用户重试 |
| 任意 | `failed` | 异常错误 |

---

## 三、生命周期阶段详解

### 阶段 1: 采集（Ingestion）

**目标**: 从各种来源获取原始内容

```
输入: URL / 文件 / 浏览器扩展
  │
  ├──→ Plugin Manager 路由到对应 Plugin
  │       │
  │       ├──→ YouTube Plugin → yt-dlp → 视频+字幕
  │       ├──→ Twitter Plugin → agent-reach → 推文内容
  │       ├──→ RSS Plugin → feedparser → 文章列表
  │       └──→ Web Plugin → Jina Reader → 网页正文
  │
  └──→ 构建 ContentUnit
         │
         ├──→ 基础信息: id, source, type, title, url
         ├──→ 原始内容: extracted_text / transcript
         └──→ 元数据: author, published_at, engagement
  │
  └──→ 保存到 SQLite (status: ingested)
```

**采集后数据**:

```python
ContentUnit(
    id="cu_abc123",
    source=SourceInfo(
        platform="youtube",
        url="https://youtube.com/watch?v=...",
        author="Channel Name",
        engagement={"likes": 1000, "views": 50000}
    ),
    type=ContentType.VIDEO,
    title="Video Title",
    description="Video description",
    extracted_text="",          # 待字幕提取
    transcript="",              # 待字幕提取
    status=ContentStatus.INGESTED,
    file_path="/downloads/video.mp4",
    created_at=datetime.now(),
)
```

### 阶段 2: 处理（Processing）

**目标**: 使用 AI 对内容进行分析、摘要、翻译等处理

```
输入: ContentUnit (status: ingested)
  │
  ├──→ 选择处理方式
  │       │
  │       ├──→ 摘要: Summarizer → summary + key_points
  │       ├──→ 翻译: Translator → translated_text
  │       ├──→ 分析: Analyzer → sentiment + topics + analysis
  │       ├──→ 改写: AIEngine → rewritten_text
  │       └──→ 转录: Transcriber → transcript (视频/音频)
  │
  └──→ 更新 ContentUnit
         │
         ├──→ summary: "结构化摘要..."
         ├──→ key_points: ["要点1", "要点2", ...]
         ├──→ sentiment: "positive"
         ├──→ topics: ["AI", "Technology"]
         └──→ analysis: {"entities": [...], "themes": [...]}
  │
  └──→ 保存到 SQLite (status: processed)
```

**处理后数据**:

```python
ContentUnit(
    id="cu_abc123",
    # ... 基础信息不变 ...
    extracted_text="Full transcript text...",
    transcript="Full transcript text...",
    summary="This video discusses...",
    key_points=[
        "Key point 1: ...",
        "Key point 2: ...",
    ],
    sentiment="positive",
    topics=["AI", "Machine Learning", "Technology"],
    analysis={
        "entities": ["OpenAI", "GPT-4"],
        "themes": ["Innovation", "Future"],
        "readability_score": 8.5,
    },
    status=ContentStatus.PROCESSED,
)
```

### 阶段 3: 编辑（Editing）

**目标**: 用户对 AI 处理结果进行人工审校和调整

```
输入: ContentUnit (status: processed)
  │
  ├──→ 用户编辑操作
  │       │
  │       ├──→ 修改摘要
  │       ├──→ 调整关键要点
  │       ├──→ 修正翻译
  │       ├──→ 添加/删除标签
  │       └──→ 调整格式
  │
  └──→ 保存到 SQLite (status: editing → ready)
```

**编辑后数据**:

```python
ContentUnit(
    id="cu_abc123",
    # ... 处理结果 ...
    summary="User-edited summary...",  # 人工修改
    tags=["AI", "Tutorial", "Beginner"],  # 用户添加标签
    status=ContentStatus.READY,
)
```

### 阶段 4: 发布（Publishing）

**目标**: 将内容导出为各种格式或发布到目标平台

```
输入: ContentUnit (status: ready)
  │
  ├──→ 选择输出格式
  │       │
  │       ├──→ Markdown → .md 文件
  │       ├──→ HTML → .html 文件
  │       ├──→ 小红书 → 剪贴板 / 文件
  │       ├──→ Slides → .pptx 文件
  │       ├──→ JSON → 结构化数据
  │       └──→ 纯文本 → .txt 文件
  │
  └──→ 保存/复制/发布
  │
  └──→ 更新 ContentUnit (status: published)
```

---

## 四、流水线执行生命周期

Pipeline 将多个处理步骤编排为自动化工作流。

```
Pipeline 执行流程:

pending ──→ running ──→ completed
                │
                ├──→ failed (某步失败)
                │       │
                │       └──→ 重试 / 跳过 / 终止
                │
                └──→ cancelled (用户取消)

PipelineRun 状态机:

┌─────────┐    ┌────────┐    ┌───────────┐    ┌──────────┐
│ pending │───→│ running│───→│completed  │───→│archived  │
└─────────┘    └────┬───┘    └───────────┘    └──────────┘
                    │
                    ├──→ failed
                    │
                    └──→ cancelled
```

### PipelineStep 执行

```
每个 Step 的执行:

pending ──→ running ──→ success
                │
                ├──→ failed
                │       │
                │       └──→ 根据配置重试
                │               │
                │               ├──→ max_retries 内 → 重试
                │               └──→ 超过 → 标记 failed
                │
                └──→ skipped (condition 不满足)
```

---

## 五、资产与会话的关联

ContentUnit（资产）可以与 Chat 会话关联，实现"基于内容对话"。

```
Chat Session
├── id: "session_001"
├── title: "YouTube 视频分析"
├── agent_id: "content_analyst"
├── linked_asset_ids: ["cu_abc123", "cu_def456"]  ← 关联的资产
│
├── Message 1 (user)
│   ├── content: "分析这2个视频的核心观点"
│   └── selected_asset_ids: ["cu_abc123", "cu_def456"]
│
└── Message 2 (assistant)
    ├── content: "根据这两个视频的内容..."
    └── tool_calls: [
        {"name": "query_content_units", "args": {"ids": ["cu_abc123", "cu_def456"]}}
    ]
```

**关联方式**:

1. **手动关联**: 用户在 Chat 中选择资产
2. **自动关联**: Pipeline 执行时自动关联输入资产
3. **URL 识别**: Chat 中输入 URL，自动采集并关联

---

## 六、数据持久化

### 6.1 SQLite 存储

```sql
-- 资产表
CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ingested',
    -- ... 完整字段见 01-ARCHITECTURE-OVERVIEW.md
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 流水线执行记录
CREATE TABLE pipeline_runs (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    steps TEXT,           -- JSON: 每步的执行结果
    input_unit_ids TEXT,  -- JSON: 输入资产 ID 列表
    output_unit_ids TEXT, -- JSON: 输出资产 ID 列表
    logs TEXT,            -- JSON: 执行日志
    error TEXT
);
```

### 6.2 文件存储

```
~/.contentforge/
├── downloads/              # 下载的视频/音频文件
│   ├── video_abc123.mp4
│   └── audio_def456.mp3
├── thumbnails/             # 视频缩略图
│   └── thumb_abc123.jpg
├── exports/                # 导出文件
│   ├── note_abc123.md
│   └── slides_def456.pptx
├── skills/                 # Skill 文件
│   └── xiaohongshu_publish.md
└── config.yaml             # 配置文件
```

---

## 七、生命周期钩子（未来）

```python
# 预留扩展点
class LifecycleHooks:
    """ContentUnit 生命周期钩子"""
    
    async def on_ingested(self, unit: ContentUnit):
        """采集完成后触发"""
        # 可以触发自动处理、发送通知等
        pass
    
    async def on_processed(self, unit: ContentUnit):
        """处理完成后触发"""
        # 可以触发自动发布、生成报告等
        pass
    
    async def on_failed(self, unit: ContentUnit, error: str):
        """处理失败时触发"""
        # 可以发送错误通知、记录日志等
        pass
    
    async def on_published(self, unit: ContentUnit):
        """发布完成后触发"""
        # 可以归档、清理临时文件等
        pass
```

---

## 八、相关文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 项目愿景 | [00-PROJECT-VISION.md](00-PROJECT-VISION.md) | 愿景、核心概念 |
| 架构总览 | [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) | 系统架构、数据库 Schema |
| 模块状态 | [02-MODULE-STATUS.md](02-MODULE-STATUS.md) | 各模块功能状态 |
| Plugin 系统 | [03-PLUGIN-SYSTEM.md](03-PLUGIN-SYSTEM.md) | 采集插件 |
| Skill 系统 | [04-SKILL-SYSTEM.md](04-SKILL-SYSTEM.md) | AI 工作流 |
| 路线图 | [06-ROADMAP.md](06-ROADMAP.md) | 开发计划 |
