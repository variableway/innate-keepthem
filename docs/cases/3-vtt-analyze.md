# Case 3: VTT 字幕分析 — 纯文本提取

## 概述

使用 vYtDL CLI 的 `analyze` 命令从已下载的 `.vtt` 字幕文件中提取纯文本对白。

- **命令**：`vYtDL analyze --mode text <file.vtt>`
- **别名**：`an`, `ana`
- **支持格式**：中文手动字幕 + YouTube 自动生成字幕

---

## 前置条件

- vYtDL CLI 已构建（`go build -o vYtDL .`）
- 已有 `.vtt` 字幕文件（通过 `download` 命令获取）

---

## 使用示例

### 基本用法

```bash
cd vYtDL

./vYtDL analyze --mode text \
  "downloads_case/downloads_case/AI的正确打开方式：不学概念，学动作.zh.vtt"
```

输出：
```
最近我一直在想一个问题 为什么很多人学 AI 越学越焦虑 而且他们的水平其实...
```

### 写入文件

```bash
./vYtDL analyze --mode text \
  --output transcript.txt \
  video.zh.vtt
```

### 管道输入

```bash
./vYtDL analyze < video.vtt
cat video.zh.vtt | ./vYtDL analyze
```

### 英文 YouTube 自动字幕

```bash
./vYtDL analyze --mode text \
  "Game Theory #25：  Trump Visits China.en.vtt"
```

YouTube 自动字幕包含 `<c>` 词级时间标签和 10ms 快照 cue，解析器自动清洗和去重。

---

## 解析器行为

### 类型 A：简单字幕（中文手动字幕）

```
输入：WEBVTT + 时间戳 + 纯文本 cue
处理：直接拼接所有 cue 文本
输出：连续纯文本
```

### 类型 B：YouTube 自动生成字幕

```
输入：WEBVTT + 带 <c> 标签的 cue + 10ms snapshot cue
处理：
  1. 去除 <c> 和 </c> 标签
  2. 去除词级时间戳 <00:00:00.000>
  3. 删除 10ms 快照 cue（与相邻 cue 文本重复的）
输出：去重后的连续纯文本
```

---

## 数据流水线

```
.vtt 文件 → vtt.Parse()
                ↓
         Transcript{Cues}
                ↓
         ┌──────┴──────┐
     PlainText()   SegmentByDuration(d)
         ↓                ↓
      纯文本          分段数组
         ↓                ↓
     stdout/file      供后续 LLM 分析
```

---

## 实际案例

### 中文视频对白

```bash
$ ./vYtDL analyze AI的正确打开方式.zh.vtt | wc -c
17404

$ ./vYtDL analyze AI的正确打开方式.zh.vtt | head -c 200
最近我一直在想一个问题 为什么很多人学 AI 越学越焦虑...
```

### 英文自动字幕

```bash
$ ./vYtDL analyze "Game Theory #25：  Trump Visits China.en.vtt" | head -c 200
So Trump is in China. This happened about um 30 minutes ago...
```

---

## 后续功能（规划中）

| 模式 | 命令 | 说明 |
|------|------|------|
| `text` | `--mode text` | ✅ 当前可用 |
| `summary` | `--mode summary` | 🔜 分段 LLM 摘要 |
| `keypoints` | `--mode keypoints` | 🔜 LLM 要点提取 + 时间戳 |

详见 `tasks/vtt-analysis-spec.md` 和 `tasks/vtt-analysis.md`。
