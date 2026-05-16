# Spec: VTT 字幕分析与要点提取

## 动机

vYtDL 下载视频时可以获取 `.vtt` 字幕文件，但缺少对字幕内容的分析能力。用户下载视频后，往往需要：
1. 快速了解视频讲了什么（摘要）
2. 提取关键观点和时间点
3. 搜索特定内容在视频的哪个位置
4. 将字幕转为可读的纯文本

## 设计目标

### 核心功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| VTT 解析引擎 | P0 | 解析 YouTube 自动字幕和手动字幕 |
| 纯文本提取 | P0 | 去时间戳、去标签 → 连续文本 |
| 分段摘要 | P1 | 按时间窗口（每 N 分钟）生成段落摘要 |
| 要点提取 | P1 | 用 LLM 从全文中提取 3-10 个关键观点 |
| 时间线索引 | P1 | 每个要点关联原文时间戳 |
| 关键词提取 | P2 | TF-IDF / LLM 提取高频关键词 |
| 多字幕对比 | P2 | 同一视频的中英文字幕对齐对比 |

### 集成方式

```
vYtDL analyze [flags] <input.vtt> [input2.vtt...]

子命令: analyze, 别名: an, ana
```

## VTT 格式分析

通过实际下载的字幕文件，发现两种格式：

### 类型 A: 简单格式（中文手动字幕）

```webvtt
WEBVTT
Kind: captions
Language: zh

00:00:25.333 --> 00:00:26.800
最近我一直在想一个问题

00:00:26.933 --> 00:00:29.800
为什么很多人学 AI 越学越焦虑
```

特征：header + 空行分隔的 cue 块，每块 `时间戳 --> 时间戳\n文本`

### 类型 B: YouTube 自动生成格式（英文字幕）

```webvtt
WEBVTT
Kind: captions
Language: en

00:00:02.399 --> 00:00:07.990 align:start position:0%
 
So<00:00:03.200><c> Trump</c><00:00:04.160><c> is</c>...

00:00:07.990 --> 00:00:08.000 align:start position:0%
So Trump is in China. This happened
```

特征：
- 时间戳行带 `align:start position:0%` 元数据
- `<c>` 标签标记词语级时间（`<c> word</c><timestamp>`）
- 重复输出：先输出带标签的，再输出纯文本
- 首行可能是空白

## 技术方案

### 1. VTT Parser（Go 实现）

作为 CLI 的 `internal/vtt/` 包：

```go
// Cue represents a single subtitle cue.
type Cue struct {
    Start time.Duration
    End   time.Duration
    Text  string  // cleaned text (no tags, no extra whitespace)
}

// Transcript represents a parsed VTT file.
type Transcript struct {
    Language string
    Kind     string
    Cues     []Cue
}

func Parse(r io.Reader) (*Transcript, error)
func (t *Transcript) PlainText() string
func (t *Transcript) SegmentByDuration(d time.Duration) []Segment
```

**解析策略**：
1. 跳过 `WEBVTT` header 和元数据行（`Kind:`, `Language:`）
2. 匹配时间戳行：`HH:MM:SS.mmm --> HH:MM:SS.mmm`
3. 后续行为 cue 文本，直到空行
4. 清洗文本：去掉 `<c>`, `</c>`, `<00:00:00.000>` 标签，合并重复行

### 2. 分析引擎

#### 模式 1: `--mode text`（纯文本）
直接输出所有 cue 的纯文本拼接，适合喂给其他工具。

#### 模式 2: `--mode summary`（分段摘要）
按时间窗口（默认 3 分钟）将字幕分组，对每组用 LLM 生成一句话摘要。

#### 模式 3: `--mode keypoints`（要点提取）
将全文发给 LLM，提取 5 个关键观点，每个附带时间戳。

### 3. LLM 集成

默认使用环境变量 `OPENAI_API_KEY`（兼容 OpenAI / DeepSeek API）。

```
VYTDL_LLM_API_KEY=sk-xxx
VYTDL_LLM_BASE_URL=https://api.deepseek.com  # 可选
VYTDL_LLM_MODEL=deepseek-chat                  # 可选
```

**Prompt 设计**：

- **摘要 prompt**：`你是一个视频内容分析师。以下是视频某时间段的字幕文本。请用一句话概括这部分的核心内容。\n\n[文本]\n\n一句话摘要：`

- **要点提取 prompt**：`从以下视频字幕中提取 {N} 个最重要的观点或信息点。每个观点附带起始时间戳。用中文回答。\n\n格式：\n1. [HH:MM:SS] 观点描述\n\n字幕内容：\n{文本}`

### 4. 无 LLM 降级方案

当 API key 未配置时：
- **summary** → 每段取前 1-2 句作为摘要
- **keypoints** → 基于词频 + 句长提取关键句（TextRank 算法）

## CLI 接口设计

```
vYtDL analyze [flags] <file.vtt> [...]

Flags:
  -m, --mode string        分析模式: text | summary | keypoints (default "summary")
  -c, --count int          要点数量 (default 5)
  -s, --segment duration   分段时长 (default 3m)
  -o, --output string      输出文件路径 (默认 stdout)
      --no-llm             禁用 LLM，使用纯文本算法
      --llm-api-key string LLM API key (或设置 VYTDL_LLM_API_KEY)
      --llm-model string   LLM 模型名 (default "deepseek-chat")
      --lang string        指定 VTT 语言（auto-detect 默认）
```

## 文件结构

```
vYtDL/
├── cmd/
│   └── analyze.go          # Cobra 子命令
├── internal/
│   ├── vtt/
│   │   ├── vtt.go          # VTT 解析器
│   │   ├── vtt_test.go
│   │   └── segment.go      # 分段、清洗、TextRank
│   └── llm/
│       ├── llm.go          # LLM 客户端（OpenAI 兼容 API）
│       └── prompts.go      # Prompt 模板
└── ...
```

## 实施计划

### Phase 1: VTT 解析器
- 实现 `internal/vtt/` 包：Parse, Cue, Transcript
- 单元测试覆盖两种格式（类型 A + 类型 B）
- 处理边界情况：空 cue、重叠时间、`<c>` 标签清洗

### Phase 2: 纯文本模式
- 实现 `cmd/analyze.go` 子命令
- `--mode text` 模式：PlainText 输出
- 集成到 `root.go` 命令树

### Phase 3: LLM 集成
- 实现 `internal/llm/` 包：OpenAI 兼容客户端
- `--mode summary` 模式：分段 + LLM 摘要
- `--mode keypoints` 模式：全文 LLM 提取要点

### Phase 4: 无 LLM 降级
- TextRank 关键句提取
- 词频统计关键词提取
- `--no-llm` flag 强制使用降级方案

### Phase 5: 增强功能
- 多字幕对比（中英对齐）
- JSON 格式输出
- 搜索模式：`--search "关键词"` 返回时间戳
