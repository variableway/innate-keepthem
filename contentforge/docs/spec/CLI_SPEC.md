# ContentForge CLI 模块 SPEC

> 版本: 0.1.0  
> 模块路径: `cli/`  
> 语言: Go 1.24+  
> 框架: Cobra v1.9.1

---

## 1. 模块定位

CLI 是 ContentForge 的命令行入口，提供面向终端用户的交互接口。它不负责核心内容处理逻辑，而是通过 `PythonBridge` 将调用委托给 Python Core Engine 执行。

### 1.1 设计原则

- **薄壳层**: CLI 仅做参数解析、输入验证、输出格式化
- **统一出口**: 所有核心功能通过 `PythonBridge` 调用 Python 模块
- **批量友好**: 支持单 URL、批量文件、stdin 三种输入模式
- **进度可视**: stderr 输出进度信息，stdout 输出结构化结果

---

## 2. 命令结构

```
contentforge [global-flags] <command> [command-flags] [args]
```

### 2.1 命令总览

| 命令 | 用途 | 输入 | 输出 |
|------|------|------|------|
| `scrape` | 从 URL 采集内容 | URL / 批量文件 | JSON |
| `process` | 对已有内容执行 AI 处理 | ContentUnit JSON | JSON |
| `publish` | 导出/发布处理后的内容 | ContentUnit JSON | Markdown/HTML/JSON/小红书 |
| `pipeline` | 管理并执行流水线 | Pipeline ID / URL | JSON |
| `--help`, `-h` | 帮助信息 | - | 文本 |
| `--version`, `-v` | 版本信息 | - | 文本 |

### 2.2 全局标志

| 标志 | 默认值 | 说明 |
|------|--------|------|
| `--config` | `~/.config/contentforge/config.json` | 配置文件路径 |

---

## 3. 子命令详解

### 3.1 `scrape` — 内容采集

```bash
contentforge scrape <url> [flags]
```

**参数:**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `url` | string | 是（若无 `--batch`） | 目标 URL |

**标志:**

| 标志 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `--backend` | - | `"auto"` | 采集后端: `auto` / `jina` / `ytdlp` |
| `--batch` | `-b` | `""` | 批量 URL 文件路径（每行一个 URL） |
| `--output` | `-o` | `""` | 输出目录（为空时输出到 stdout） |
| `--format` | - | `"json"` | 输出格式: `json` |
| `--proxy` | - | `""` | 代理地址 |

**批量文件格式:**

```text
# 注释行以 # 开头
https://twitter.com/user/status/123
https://youtube.com/watch?v=abc
https://example.com/article
```

**执行流程:**

```
1. 解析输入 → 单 URL / 批量文件
2. 初始化 PythonBridge
3. 循环处理每个 URL:
   a. 根据 --backend 选择采集器
   b. 调用 Python 模块获取内容
   c. 收集结果（含错误信息）
4. 输出结果 JSON
```

**Python 调用映射:**

| `--backend` | Python 模块 | 类 | 方法 |
|-------------|-------------|-----|------|
| `auto` | `contentforge.ingestion.agent_reach` | `AgentReachIngestor` | `fetch` |
| `jina` | `contentforge.ingestion.web_scraper` | `WebScraper` | `fetch` |
| `ytdlp` | `contentforge.ingestion.transcriber` | `Transcriber` | `transcribe` |

**错误处理:**

- 单个 URL 失败不会中断批量处理
- 失败结果包含 `error` 字段，正常结果包含内容数据
- stderr 输出每个 URL 的处理状态（✓ / ✗）

---

### 3.2 `process` — AI 处理

```bash
contentforge process <content-file> [flags]
```

**参数:**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `content-file` | string | 是 | ContentUnit JSON 文件路径，或 `-` 表示 stdin |

**标志:**

| 标志 | 默认值 | 说明 |
|------|--------|------|
| `--summarize` | `false` | 生成结构化摘要 |
| `--translate` | `""` | 翻译为目标语言（如 `zh`, `en`, `ja`） |
| `--rewrite` | `""` | 改写风格（如 `professional`, `casual`, `humorous`） |
| `--xiaohongshu` | `false` | 转换为小红书风格文案 |
| `--analyze` | `false` | 内容分析（主题、情感） |
| `--full-analysis` | `false` | 执行完整分析流程（摘要+翻译+分析） |
| `--output` | `""` | 输出文件路径 |
| `--ai-provider` | `"openai"` | AI Provider 名称 |

**默认行为:**

若未指定任何处理标志，默认执行 `--summarize`。

**处理顺序:**

1. summarize（若启用）
2. translate（若指定目标语言）
3. rewrite（若指定风格）
4. xiaohongshu（若启用）
5. analyze（若启用）

**Python 调用映射:**

| 处理类型 | Python 模块 | 类 | 方法 |
|----------|-------------|-----|------|
| 摘要 | `contentforge.processing.summarizer` | `Summarizer` | `summarize_text` |
| 翻译 | `contentforge.processing.translator` | `Translator` | `translate_text` |
| 改写 | `contentforge.processing.ai_engine` | `AIEngine` | `rewrite` |
| 小红书 | `contentforge.processing.xiaohongshu_converter` | `XiaohongshuConverter` | `convert_text_to_dict` |
| 分析 | `contentforge.processing.analyzer` | `Analyzer` | `analyze_text` |

---

### 3.3 `publish` — 内容发布

```bash
contentforge publish <content-file> [flags]
```

**参数:**

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `content-file` | string | 是 | ContentUnit JSON 文件路径 |

**标志:**

| 标志 | 默认值 | 说明 |
|------|--------|------|
| `--format` | `"markdown"` | 输出格式: `markdown` / `text` / `html` / `json` / `xiaohongshu` |
| `--output` | `""` | 输出路径 |
| `--batch` | `false` | 批量模式（输入为目录） |
| `--template` | `""` | 模板文件路径 |
| `--profile` | `""` | 发布 Profile ID |

**批量模式:**

- 输入必须是目录
- 处理目录下所有 `.json` 文件
- `--output` 必须指定输出目录
- 每个文件独立渲染，输出为同名的 `.md` / `.html` / `.txt` / `.json`

**渲染器映射:**

| 格式 | 渲染函数 | 说明 |
|------|----------|------|
| `markdown` | `renderMarkdown()` | 标准 Markdown，含标题、摘要、要点、正文、来源 |
| `text` | `renderText()` | 纯文本，含标题和摘要 |
| `html` | `renderHTML()` | 简单 HTML 包装（`<pre>` 包裹 Markdown） |
| `json` | `json.MarshalIndent()` | 原始 JSON 输出 |
| `xiaohongshu` | `renderXiaohongshu()` | 小红书风格，含标题、正文、标签、互动引导 |

**Markdown 输出结构:**

```markdown
# {title}

> {description}

## 摘要

{summary}

## 要点

- {key_point_1}
- {key_point_2}

## 主题

- {topic_1}

## 正文

{extracted_text}

## 翻译

{translated_text}

---

*来源: [platform](url) | 作者: author*
```

---

### 3.4 `pipeline` — 流水线管理

```bash
contentforge pipeline <subcommand> [flags]
```

**子命令:**

| 子命令 | 用途 | 参数 |
|--------|------|------|
| `list` | 列出所有可用流水线 | 无 |
| `run` | 执行流水线 | `<pipeline-id>` |
| `create` | 从 JSON 文件创建自定义流水线 | `<pipeline-json-file>` |
| `status` | 查看流水线运行状态 | `<run-id>` |

**`pipeline run` 标志:**

| 标志 | 默认值 | 说明 |
|------|--------|------|
| `--url` | `""` | 输入 URL |
| `--input` | `""` | 输入文件（ContentUnit JSON） |
| `--output` | `""` | 输出目录 |

**执行流程:**

```
1. 验证输入（--url 或 --input 必须指定一个）
2. 调用 Python PipelineRunner.run(pipeline_id, input)
3. 输出执行结果 JSON
4. 若指定 --output，保存结果到文件
```

---

## 4. PythonBridge 模块

### 4.1 模块定位

`internal/python_bridge.go` 是 Go 与 Python Core 之间的通信桥梁。通过启动 Python 子进程，以内联脚本方式动态调用 Python 模块。

### 4.2 核心类型

```go
type PythonBridge struct {
    venvPath     string        // 虚拟环境路径
    pythonBinary string        // Python 可执行文件路径
    timeout      time.Duration // 默认超时: 120s
    env          []string      // 额外环境变量
}
```

### 4.3 构造函数

```go
func NewPythonBridge() (*PythonBridge, error)
```

Python 解释器查找顺序:
1. `${VIRTUAL_ENV}/bin/python3`
2. `${VIRTUAL_ENV}/bin/python`
3. 系统 `python3`
4. 系统 `python`

### 4.4 核心方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `Call` | `Call(module, class string, args map[string]interface{}) ([]byte, error)` | 通用调用，返回原始 JSON 字节 |
| `CallWithOutput` | `CallWithOutput(module, class string, args map[string]interface{}, out interface{}) error` | 调用并自动反序列化到目标结构 |
| `SetTimeout` | `SetTimeout(d time.Duration)` | 设置超时 |
| `SetEnv` | `SetEnv(key, value string)` | 设置环境变量 |
| `HealthCheck` | `HealthCheck() error` | 检测 Python 环境和关键模块 |
| `GetPythonVersion` | `GetPythonVersion() (string, error)` | 获取 Python 版本 |

### 4.5 调用约定

参数中的特殊字段:

| 字段 | 类型 | 说明 |
|------|------|------|
| `_method` | string | 实例化后调用的方法名 |
| `_init_args` | map | 构造器参数（默认空） |

**示例:**

```go
// 调用 Summarizer.summarize_text(text="...")
pb.CallWithOutput(
    "contentforge.processing.summarizer",
    "Summarizer",
    map[string]interface{}{
        "_method": "summarize_text",
        "text":    "要摘要的内容",
    },
    &result,
)
```

### 4.6 快捷方法

| 方法 | 说明 |
|------|------|
| `CallSummarize(text)` | 调用摘要模块 |
| `CallXiaohongshu(text)` | 调用小红书转换模块 |
| `CallIngestion(platform, url)` | 调用采集模块 |
| `ExecuteMethod(module, method, args)` | 智能推断类名和方法名 |

### 4.7 内联脚本模板

PythonBridge 动态生成并执行以下脚本模板:

```python
import sys, json, os
sys.path.insert(0, "<python_path>")

from <module> import <class>

args = json.load(sys.stdin)

method_name = args.pop('_method', None)
init_args = args.pop('_init_args', {})

instance = <class>(**init_args)

if method_name:
    method = getattr(instance, method_name)
    result = method(**args)
else:
    result = instance

# 自动序列化
if hasattr(result, 'to_dict'):
    output = result.to_dict()
elif isinstance(result, list) and result and hasattr(result[0], 'to_dict'):
    output = [r.to_dict() for r in result]
else:
    output = result

print(json.dumps(output, ensure_ascii=False, default=str))
```

---

## 5. 辅助函数

### 5.1 `getStr`

从 `map[string]interface{}` 中安全获取字符串值:

```go
func getStr(m map[string]interface{}, key string) string
```

### 5.2 路径解析

| 函数 | 说明 |
|------|------|
| `findProjectRoot()` | 向上查找包含 `contentforge/` 的目录 |
| `contentforgePythonPath()` | 返回 `contentforge/core/python` 绝对路径 |
| `DefaultVenvPath()` | 返回默认虚拟环境路径（环境变量 → 项目内 `.venv-cf`） |

---

## 6. 错误处理策略

| 场景 | 策略 |
|------|------|
| PythonBridge 初始化失败 | 返回错误，CLI 退出码非 0 |
| 单个 URL 采集失败 | 记录错误，继续处理剩余 URL |
| AI 处理失败 | 记录错误字段，继续其他处理步骤 |
| 渲染失败 | 返回错误，不生成输出文件 |
| 超时 | 杀死子进程，返回 timeout 错误 |

---

## 7. 依赖

```go
// go.mod
module github.com/patrick/contentforge

go 1.24

require (
    github.com/spf13/cobra v1.9.1
    gopkg.in/yaml.v3 v3.0.1
)
```

---

## 8. 扩展指南

### 8.1 添加新命令

1. 在 `cmd/` 下创建新文件（如 `cmd/translate.go`）
2. 定义 `cobra.Command` 变量和 `runXxx` 函数
3. 在 `init()` 中注册命令到 `rootCmd`
4. 通过 `PythonBridge` 调用 Python 核心模块

### 8.2 添加新采集后端

1. 在 `runScrape()` 的 switch 语句中添加新 case
2. 指定对应的 Python 模块、类和方法
3. 添加对应的 CLI 标志

### 8.3 添加新发布格式

1. 在 `renderContent()` 的 switch 中添加新 case
2. 实现对应的 `renderXxx()` 函数
3. 更新 `--format` 标志的 help 文本
