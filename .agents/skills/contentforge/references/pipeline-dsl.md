# Pipeline DSL 规范

## Pipeline 定义格式

Pipeline 使用 JSON 定义，支持以下字段：

```json
{
  "id": "twitter_to_xiaohongshu",
  "name": "Twitter → 小红书文案",
  "description": "抓取 Twitter 内容并转换为小红书风格文案",
  "steps": [
    {
      "id": "ingest",
      "type": "ingest",
      "config": { "backend": "agent-reach", "platform": "twitter" },
      "input_mapping": { "url": "input.url" },
      "output_mapping": { "content_unit": "steps.ingest.output" },
      "max_retries": 3,
      "backoff": "exponential",
      "delay_ms": 1000,
      "timeout_ms": 30000
    },
    {
      "id": "summarize",
      "type": "summarize",
      "config": { "style": "structured", "max_length": 500 },
      "input_mapping": { "content_unit": "steps.ingest.output" },
      "output_mapping": { "summary": "steps.summarize.output.summary" },
      "condition": "steps.ingest.output.word_count > 100"
    },
    {
      "id": "xiaohongshu",
      "type": "xiaohongshu",
      "config": { "tone": "friendly", "emoji_density": "medium" },
      "input_mapping": { "content_unit": "steps.ingest.output", "summary": "steps.summarize.output.summary" },
      "output_mapping": { "xiaohongshu_text": "steps.xiaohongshu.output" }
    }
  ],
  "trigger": "manual",
  "input_config": { "source": "url", "filters": { "min_engagement": 10 } },
  "output_config": { "format": "xiaohongshu", "destination": "file" }
}
```

## Step 类型

| 类型 | 说明 | 输入 | 输出 |
|------|------|------|------|
| `ingest` | 内容采集 | `url` | `ContentUnit` |
| `summarize` | 生成摘要 | `content_unit` | `summary` (string) |
| `analyze` | 内容分析 | `content_unit` | `analysis` (dict) |
| `translate` | 翻译 | `content_unit`, `target_lang` | `translated_text` (string) |
| `rewrite` | 风格改写 | `content_unit`, `style` | `rewritten_text` (string) |
| `xiaohongshu` | 小红书转换 | `content_unit`, `summary` | `xiaohongshu_text` (string) |
| `filter` | 内容过滤 | `content_unit`, `condition` | `content_unit` or null |
| `custom` | 自定义 Python 函数 | 任意 | 任意 |

## Step 配置

### ingest

```json
{
  "backend": "agent-reach",  // agent-reach | jina | ytdlp | rss
  "platform": "twitter"      // twitter | youtube | web | rss
}
```

### summarize

```json
{
  "style": "structured",     // structured | concise | detailed | bullets | executive
  "max_length": 500,
  "language": "zh"
}
```

### xiaohongshu

```json
{
  "tone": "friendly",        // friendly | professional | casual | humorous
  "emoji_density": "medium", // none | low | medium | high
  "max_length": 1000,
  "include_tags": true,
  "include_cta": true        // 互动引导
}
```

### translate

```json
{
  "target_lang": "zh",       // zh | en | ja | ko | es | fr | de | ru
  "preserve_format": true
}
```

### analyze

```json
{
  "depth": "full",           // quick | standard | full
  "include_sentiment": true,
  "include_topics": true,
  "include_keywords": true
}
```

### filter

```json
{
  "condition": "engagement.likes > 100",
  "action": "pass"           // pass | skip | fail
}
```

### custom

```json
{
  "module": "my_module",
  "function": "my_function",
  "args": { "key": "value" }
}
```

## 输入/输出映射

使用点符号引用上下文中的值：

| 语法 | 含义 |
|------|------|
| `input.url` | 流水线输入的 URL |
| `input.text` | 流水线输入的文本 |
| `steps.<step_id>.output` | 某步骤的输出 |
| `steps.<step_id>.output.summary` | 某步骤输出的 summary 字段 |
| `config.<key>` | 流水线配置中的值 |

## 条件表达式

支持简单的 Python 表达式：

```
steps.ingest.output.word_count > 100
steps.ingest.output.engagement.likes > 50
config.target_lang == "zh"
"error" not in steps.ingest.output.status
```

## 重试策略

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `max_retries` | 最大重试次数 | 3 |
| `backoff` | 退避策略 | exponential |
| `delay_ms` | 初始延迟（毫秒） | 1000 |
| `timeout_ms` | 步骤超时（毫秒） | 30000 |

退避策略：
- `fixed`: 固定延迟（delay_ms, delay_ms, delay_ms...）
- `exponential`: 指数退避（delay_ms, 2*delay_ms, 4*delay_ms...）
- `linear`: 线性退避（delay_ms, 2*delay_ms, 3*delay_ms...）

## 完整示例

### Twitter → 小红书

```json
{
  "id": "twitter_to_xiaohongshu",
  "name": "Twitter → 小红书文案",
  "steps": [
    {
      "id": "ingest",
      "type": "ingest",
      "config": { "backend": "agent-reach", "platform": "twitter" },
      "input_mapping": { "url": "input.url" },
      "output_mapping": { "content_unit": "steps.ingest.output" },
      "max_retries": 3,
      "timeout_ms": 30000
    },
    {
      "id": "translate",
      "type": "translate",
      "config": { "target_lang": "zh" },
      "input_mapping": { "content_unit": "steps.ingest.output" },
      "output_mapping": { "translated": "steps.translate.output" },
      "condition": "steps.ingest.output.metadata.language != 'zh'"
    },
    {
      "id": "summarize",
      "type": "summarize",
      "config": { "style": "structured", "max_length": 300 },
      "input_mapping": { "content_unit": "steps.ingest.output" },
      "output_mapping": { "summary": "steps.summarize.output" }
    },
    {
      "id": "xiaohongshu",
      "type": "xiaohongshu",
      "config": { "tone": "friendly", "emoji_density": "medium" },
      "input_mapping": {
        "content_unit": "steps.ingest.output",
        "summary": "steps.summarize.output"
      },
      "output_mapping": { "xiaohongshu_text": "steps.xiaohongshu.output" }
    },
    {
      "id": "analyze",
      "type": "analyze",
      "config": { "depth": "standard" },
      "input_mapping": { "content_unit": "steps.ingest.output" },
      "output_mapping": { "analysis": "steps.analyze.output" }
    }
  ],
  "trigger": "manual",
  "input_config": { "source": "url" },
  "output_config": { "format": "xiaohongshu", "destination": "file" }
}
```

### YouTube → 笔记

```json
{
  "id": "youtube_to_notes",
  "name": "YouTube → 笔记",
  "steps": [
    {
      "id": "transcribe",
      "type": "ingest",
      "config": { "backend": "ytdlp", "extract_subtitles": true },
      "input_mapping": { "url": "input.url" },
      "output_mapping": { "content_unit": "steps.transcribe.output" },
      "timeout_ms": 120000
    },
    {
      "id": "summarize",
      "type": "summarize",
      "config": { "style": "detailed", "max_length": 1000 },
      "input_mapping": { "content_unit": "steps.transcribe.output" },
      "output_mapping": { "summary": "steps.summarize.output" }
    },
    {
      "id": "analyze",
      "type": "analyze",
      "config": { "depth": "full" },
      "input_mapping": { "content_unit": "steps.transcribe.output" },
      "output_mapping": { "analysis": "steps.analyze.output" }
    },
    {
      "id": "export",
      "type": "custom",
      "config": {
        "module": "contentforge.publishing.exporters",
        "function": "export_markdown_notes",
        "args": { "template": "youtube_notes" }
      },
      "input_mapping": {
        "content_unit": "steps.transcribe.output",
        "summary": "steps.summarize.output",
        "analysis": "steps.analyze.output"
      }
    }
  ],
  "trigger": "manual",
  "input_config": { "source": "url" },
  "output_config": { "format": "markdown", "destination": "file" }
}
```
