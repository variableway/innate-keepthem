# 两个仓库分析：agent-reach & last30days-skill

## 仓库概览

| 仓库 | 定位 | 核心能力 | 技术栈 | 成熟度 |
|------|------|----------|--------|--------|
| **agent-reach** | AI Agent 的互联网能力路由器 | 15+ 平台的内容获取、转录、搜索 | Python 3.10+, CLI | ⭐ 高（GitHub 高星） |
| **last30days-skill** | 多源社交研究引擎 | 跨平台信息聚合、评分、合成、去重 | Python 3.12+, Skill | ⭐ 高（GitHub Trending #1） |

---

## 一、agent-reach 深度分析

### 1.1 架构设计

agent-reach 采用 **Channel 抽象架构**，每个平台是一个独立的 Channel：

```python
# 核心抽象 —— 可直接借鉴
class Channel(ABC):
    name: str                    # 平台标识，如 "twitter"
    description: str             # 平台描述
    backends: List[str]          # 有序候选后端列表
    tier: int                    # 0=零配置，1=需登录，2=复杂设置
    active_backend: Optional[str] # 当前激活的后端

    @abstractmethod
    def can_handle(self, url: str) -> bool  # URL 是否属于此平台
    def check(self, config=None) -> Tuple[str, str]  # 健康检查 → (ok/warn/off/error, message)
    def ordered_backends(self, config) -> List[str]  # 支持用户强制指定后端
```

**设计亮点：**
- 每个 Channel 自带多后端路由（如 Twitter：twitter-cli → OpenCLI → bird CLI）
- 健康检查真正执行命令，不是简单的 `shutil.which()`（检测 venv 断链等）
- 支持用户强制覆盖后端：`<channel>_backend` 配置键
- 回退机制：先找 `ok` 状态，再找 `warn`，不会把 `warn`（装了但未登录）挡在 `ok` 后面

### 1.2 支持的平台（与 ContentForge 场景直接相关）

| 平台 | 能力 | 后端 | 与 ContentForge 场景关联 |
|------|------|------|--------------------------|
| **Twitter/X** | 读推文、搜索、时间线、用户 | twitter-cli / OpenCLI / bird | 场景1：Twitter → 小红书 |
| **小红书** | 读笔记、搜索、评论、用户 | OpenCLI / xiaohongshu-mcp / xhs-cli | 场景1：内容源 + 发布目标 |
| **YouTube** | 字幕提取、元数据、搜索 | yt-dlp（复用！） | 场景2：YouTube → 视频处理 |
| **Bilibili** | 搜索、视频详情、字幕 | bili-cli / OpenCLI | 场景2：B站内容获取 |
| **Reddit** | 搜索、帖子、评论 | OpenCLI / rdt-cli | 采集域扩展 |
| **通用网页** | 任意 URL → Markdown | Jina Reader（免费 API） | 场景1：网页抓取 |
| **RSS** | 订阅源解析 | feedparser | 采集域扩展 |
| **V2EX** | 热帖、节点、用户 | 公开 API | 采集域扩展 |
| **GitHub** | 代码搜索、仓库 | gh CLI | 采集域扩展 |
| **小宇宙播客** | 音频转录 | Whisper (Groq免费) | 场景2：音频转文本 |
| **LinkedIn** | 资料、搜索 | linkedin-mcp / Jina Reader | 采集域扩展 |
| **Facebook** | 搜索、Feed、群组 | OpenCLI | 采集域扩展 |
| **Instagram** | 搜索、帖子、用户 | OpenCLI | 采集域扩展 |
| **Web Search** | 语义搜索 | Exa (mcporter) | 采集域扩展 |

### 1.3 转录流水线（核心资产）

`transcribe.py` 实现了完整的音频转文本流水线：

```
URL/本地文件 → yt-dlp 提取音频 (-x, m4a) → ffmpeg 压缩(单声道/16kHz/32kbps) → 
  如果 >25MB: ffmpeg 分片(10分钟/片) → Whisper API (Groq免费 → OpenAI降级) → 合并文本
```

**关键参数：**
- 压缩到 32kbps 单声道，绝大多数内容在 25MB 以内（Groq Whisper 限制）
- 分片 10 分钟，边界切割极少丢失语义
- 自动回退：Groq 失败 → OpenAI
- SSRF 防护：拒绝内网/localhost URL
- 依赖：yt-dlp, ffmpeg, requests

### 1.4 配置与安装系统

```bash
agent-reach install --env=auto          # 一键安装，自动检测环境
agent-reach doctor --json               # 健康检查，输出 JSON 供程序解析
agent-reach configure twitter-cookies "..."  # 配置 Cookie
agent-reach configure groq-key gsk_xxx  # 配置 API Key
agent-reach transcribe "URL"            # 转录
```

**配置管理：**
- 配置目录：`~/.agent-reach/config.yaml`
- Cookie 自动提取：从 Chrome/Firefox/Safari 读取（macOS Keychain 集成）
- 代理支持：`HTTP(S)_PROXY` 自动导出
- 环境检测：自动区分桌面/服务器（SSH、Docker、DISPLAY）

### 1.5 与 ContentForge 的集成价值

| 维度 | 价值 | 方式 |
|------|------|------|
| **采集域** | ⭐⭐⭐⭐⭐ 极高 | 直接调用 `agent-reach` CLI 作为子进程，获取所有平台内容 |
| **处理域** | ⭐⭐⭐ 中等 | 转录流水线可直接复用；Jina Reader 网页提取可用 |
| **编辑域** | ⭐⭐ 较低 | 不涉及视频编辑 |
| **发布域** | ⭐⭐⭐ 中等 | 小红书内容格式化（`format_xhs_result`）可借鉴 |
| **架构** | ⭐⭐⭐⭐⭐ 极高 | Channel 多后端架构、健康检查机制可直接移植到 ContentForge |

**直接可用的能力：**
1. `twitter tweet URL` → 获取推文文本
2. `opencli xiaohongshu search "query" -f yaml` → 获取小红书笔记
3. `yt-dlp --dump-json URL` → 获取视频元数据和字幕（ContentForge 已有）
4. `agent-reach transcribe URL` → 音频转文本（ContentForge 场景2需要）
5. `curl -s https://r.jina.ai/URL` → 任意网页 → Markdown（场景1需要）
6. `feedparser` → RSS 订阅（采集域扩展）

---

## 二、last30days-skill 深度分析

### 2.1 架构设计

last30days 是一个**研究引擎**，不是工具库。核心架构：

```
SKILL.md (1400+ 行指令契约) → AI Agent 解析并执行 → 调用 Python 引擎
                                    ↓
                              scripts/last30days.py (引擎)
                                    ↓
                    多源并行搜索 → 评分排序 → 跨源聚类 → AI 合成 → 输出报告
```

**引擎核心流程：**
1. **实体解析**（Step 0.5）：自动发现 X handle、GitHub 用户、subreddit、TikTok hashtag
2. **多源并行搜索**：Reddit、X、YouTube、TikTok、HN、Polymarket、GitHub、Web 同时搜索
3. **内容评分**：按 engagement（upvotes, likes, views, comments）排序
4. **实体接地**（Entity Grounding）：确保内容与主题相关，关键词匹配头部 token
5. **跨源聚类**：同一事件在不同平台的报道合并为一个证据簇
6. **AI 合成**：将证据转化为结构化报告（"What I learned:" + KEY PATTERNS）
7. **输出**：Markdown/HTML/JSON，支持保存到文件

### 2.2 核心算法与数据模型

**评分算法：**
- 多维度评分：engagement（互动量）、relevance（相关性）、freshness（新鲜度）
- 幽默/病毒度评分（fun judge）：v3 新增，识别高传播力的评论
- 按作者限制：单作者最多 3 条，防止单一声音主导
- 实体脱敏：通用词歧义处理（如 "Apple" 不会匹配 "Will Apple release a car?"）

**数据模型（Report）：**
```python
class Report:
    topic: str
    items_by_source: Dict[str, List[Item]]  # 按来源分组的内容
    query_plan: QueryPlan                    # 查询计划
    errors_by_source: Dict[str, str]        # 错误信息
    # 聚类后的证据簇
    # 社区评论（Top Community Comments）
    # Best Takes（最有趣/尖锐的评论）
```

**持久化（SQLite）：**
```python
# store.py —— 可以借鉴到 ContentForge 的 ContentUnit 存储
topics 表: id, topic, created_at
runs 表: id, topic_id, source_mode, status, findings_new, findings_updated, error_message
findings 表: id, run_id, topic_id, source, url, title, content, score, engagement, created_at
```

### 2.3 与 ContentForge 的集成价值

| 维度 | 价值 | 方式 |
|------|------|------|
| **采集域** | ⭐⭐⭐ 中等 | 引擎本身不直接暴露采集 API，但多源搜索的思想可借鉴 |
| **处理域** | ⭐⭐⭐⭐⭐ 极高 | 内容评分、跨源聚类、去重、AI 合成是核心资产 |
| **编辑域** | ⭐⭐ 较低 | 不涉及视频编辑 |
| **发布域** | ⭐⭐⭐ 中等 | HTML 简报生成、报告格式化可借鉴 |
| **架构** | ⭐⭐⭐⭐ 高 | Pipeline 流程设计、数据模型设计可借鉴 |

**可直接借鉴的算法/模式：**
1. **实体解析**：给定一个主题，自动发现相关账号、社区、hashtag
2. **内容评分**：按 engagement 排序，非 SEO 排序
3. **跨源聚类合并**：同一内容在不同平台去重
4. **AI 合成模板**："What I learned:" + KEY PATTERNS 的报告结构
5. **HTML 简报生成**：自包含、暗色模式、打印友好的 HTML 报告
6. **趋势监控**：SQLite 存储 + watchlist 定时监控新发现

---

## 三、集成方案设计

### 3.1 推荐集成策略

**对于 ContentForge 项目，推荐以下三层集成策略：**

```
┌─────────────────────────────────────────────────────────────┐
│                  ContentForge 应用层                          │
│   (CLI / Desktop / Web — 保持现有架构)                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: 直接依赖集成（子进程调用）                           │
│  ─────────────────────────────────────────                   │
│  • pip install agent-reach                                   │
│  • 调用 agent-reach CLI 进行内容采集和转录                    │
│  • 复用其配置管理（Cookie、API Key）                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 架构移植（代码借鉴）                                 │
│  ─────────────────────────────────────────                   │
│  • Channel 多后端架构 → ContentForge Ingestion Domain         │
│  • 健康检查机制 → ContentForge 平台可用性检测                 │
│  • 转录流水线 → ContentForge Processing Domain 的 Extractor   │
│  • 内容评分/聚类 → ContentForge Processing Domain 的 Analyzer  │
│  • 配置管理 → ContentForge Config Manager                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 理念借鉴（设计模式）                                 │
│  ─────────────────────────────────────────                   │
│  • 多后端回退（主后端+备选）→ 解决平台 API 不稳定              │
│  • 零配置/渐进配置 → 降低用户上手门槛                         │
│  • 实体解析前置 → 提高搜索精准度                              │
│  • 社区声音融入 → 内容创作的独特视角                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 具体集成点

#### A. 采集域（直接复用 agent-reach）

```python
# ContentForge 的采集器可以封装 agent-reach CLI
class AgentReachIngestor:
    """调用 agent-reach 获取各平台内容"""

    def fetch_twitter(self, url: str) -> ContentUnit:
        # 调用 twitter-cli 获取推文
        result = subprocess.run(["twitter", "tweet", url], capture_output=True, text=True)
        return self._parse_twitter_output(result.stdout)

    def fetch_xiaohongshu(self, url: str) -> ContentUnit:
        # 调用 opencli 获取小红书笔记
        result = subprocess.run(["opencli", "xiaohongshu", "note", url, "-f", "yaml"], ...)
        return self._parse_xhs_output(result.stdout)

    def fetch_webpage(self, url: str) -> ContentUnit:
        # 调用 Jina Reader 获取网页内容
        result = requests.get(f"https://r.jina.ai/{url}")
        return ContentUnit(raw_text=result.text, type="article")

    def transcribe_video(self, url: str) -> str:
        # 复用 agent-reach 的转录能力
        result = subprocess.run(["agent-reach", "transcribe", url], ...)
        return result.stdout
```

**优势：**
- 无需自己维护 Twitter/X、小红书、B站 的 API 适配
- 自动获得后端回退（Twitter 改 GraphQL 时不需要修改代码）
- 健康检查自动可用（`agent-reach doctor`）
- 配置管理自动可用（Cookie、API Key、代理）

**劣势：**
- 依赖 Python 运行时（需要安装 Python 3.10+）
- 子进程调用有一定开销
- 需要处理 CLI 的输出格式变化

#### B. 处理域（借鉴 last30days + agent-reach）

```python
# 内容评分（借鉴 last30days）
class EngagementScorer:
    def score(self, items: List[ContentUnit]) -> List[ScoredItem]:
        # 按互动量评分：upvotes, likes, comments, shares
        # 按新鲜度加权：越新越高
        # 按相关性过滤：Entity Grounding
        pass

# 跨源聚类（借鉴 last30days）
class CrossSourceClusterer:
    def cluster(self, items: List[ContentUnit]) -> List[Cluster]:
        # 实体匹配：同一事件在不同平台
        # 标题相似度 + 时间窗口
        pass

# 内容合成（借鉴 last30days 的 "What I learned" 模板）
class ContentSynthesizer:
    def synthesize(self, clusters: List[Cluster]) -> str:
        # 调用 AI Engine 生成摘要
        # 融入社区评论（verbatim quotes）
        # 输出结构化 Markdown
        pass
```

#### C. 配置管理（借鉴 agent-reach）

```yaml
# ~/.contentforge/config.yaml （借鉴 agent-reach 的配置结构）
ai:
  provider: openai  # openai / claude / ollama
  openai_api_key: sk-xxx
  claude_api_key: sk-xxx

ingestion:
  twitter_backend: twitter-cli  # 可强制指定
  xiaohongshu_backend: opencli
  proxy: http://user:pass@ip:port

processing:
  whisper_provider: groq  # groq / openai / local
  groq_api_key: gsk_xxx

publishing:
  xiaohongshu:
    # 发布配置
  notion:
    api_key: secret_xxx
```

### 3.3 依赖管理方案

```toml
# ContentForge 的 pyproject.toml 或 Cargo.toml 中添加
[project.dependencies]
# 方案1：作为 Python 依赖（推荐 Desktop/Web 后端）
agent-reach = ">=1.5.0"

# 方案2：作为子进程工具（推荐 CLI/Go 项目）
# 在 setup 脚本中安装: pip install agent-reach
# Go 代码通过 os/exec 调用 Python CLI
```

**Go 项目调用方案：**
```go
// ContentForge CLI (Go) 调用 agent-reach
func fetchTwitter(url string) (*ContentUnit, error) {
    cmd := exec.Command("python3", "-m", "agent_reach", "fetch", "twitter", url)
    output, err := cmd.Output()
    // 解析 JSON 输出
}
```

### 3.4 场景映射

| ContentForge 场景 | 使用 agent-reach 的部分 | 使用 last30days 思想的部分 |
|-------------------|------------------------|---------------------------|
| **场景1：Twitter → 小红书** | `twitter tweet URL` 获取推文；`curl r.jina.ai/URL` 获取网页；`opencli xiaohongshu` 获取参考笔记 | 实体解析（发现相关话题）；内容评分（选高互动推文）；AI 合成（改写为小红书风格） |
| **场景2：YouTube → 二次视频** | `yt-dlp` 下载视频；`agent-reach transcribe` 转录；`yt-dlp --write-sub` 获取字幕 | 视频内容分析；脚本提取和重组；多视频聚类合并 |
| **场景3：视频编辑** | `ffmpeg` 剪辑（agent-reach 的 transcribe 已集成 ffmpeg） | 无直接关联 |

---

## 四、风险评估与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| **agent-reach 后端工具变动** | 采集功能失效 | 利用其多后端设计，一个后端坏了自动切换到另一个；ContentForge 封装调用层，隔离变化 |
| **Python 运行时依赖** | Go/TS 项目需引入 Python | 在 Docker 镜像中预装；或作为可选功能（Feature Flag） |
| **last30days 是 Skill 不是库** | 不能直接作为 Python 包导入 | 借鉴其算法和流程设计，不直接依赖；将其引擎核心逻辑（评分、聚类）移植为 ContentForge 内部模块 |
| **Cookie/认证过期** | 登录态平台失效 | 复用 agent-reach 的 Cookie 自动提取和配置管理 |
| **平台风控** | 采集被限制 | 复用 agent-reach 的代理支持和速率控制；last30days 的 resilient 设计（超时预算、运行时回退） |
| **版权/合规风险** | 内容抓取的法律问题 | 明确工具仅提供采集能力，内容版权归用户/平台；提供内容使用指南 |

---

## 五、结论与建议

### 5.1 是否采用？

| 仓库 | 建议 | 理由 |
|------|------|------|
| **agent-reach** | ✅ **强烈推荐采用** | 与 ContentForge 场景高度匹配，直接提供 Twitter、小红书、YouTube、网页等核心采集能力；架构设计优秀；活跃维护；开源 MIT |
| **last30days-skill** | ✅ **推荐借鉴，不直接依赖** | 研究引擎设计理念优秀，但定位为 Skill 不是库；不能直接 `pip install` 使用；核心算法（评分、聚类、合成）值得移植到 ContentForge |

### 5.2 执行建议

**Phase 1（立即可做）：**
1. 在 ContentForge 开发环境中安装 `agent-reach`：`pip install agent-reach`
2. 测试各平台采集功能：`agent-reach doctor`，确认哪些平台可用
3. 配置必要凭证：Groq API Key（免费转录）、Twitter Cookie（可选）
4. 编写 ContentForge 的 `AgentReachIngestor` 封装层

**Phase 2（架构移植）：**
1. 将 agent-reach 的 **Channel 抽象** 移植到 ContentForge 的 Ingestion Domain
2. 将 **健康检查机制** 移植到 ContentForge 的平台可用性检测
3. 将 **转录流水线** 集成到 ContentForge 的 Processing Domain
4. 将 last30days 的 **内容评分和聚类** 算法移植到 Processing Domain 的 Analyzer

**Phase 3（深度定制）：**
1. 开发 ContentForge 特有的 Channel（如 Notion 导出、Obsidian 导出）
2. 实现小红书发布适配器（基于 OpenCLI 或 xiaohongshu-mcp）
3. 实现一键流水线（预设工作流：Twitter → Markdown → 小红书文案）

### 5.3 最终判断

**这两个仓库是 ContentForge 转型的加速器，不是替代品。**

- agent-reach 解决了"如何获取各平台内容"的技术难题，ContentForge 可以站在它的肩膀上构建自己的采集域
- last30days 解决了"如何处理和合成多源内容"的方法论问题，ContentForge 可以借鉴它的算法来构建自己的处理域
- ContentForge 的独特价值在于**内容获取→处理→编辑→发布的完整流水线**，这是两个独立仓库都没有的

**建议的开发策略：以 agent-reach 为采集基础设施，以 last30days 为处理方法论参考，构建 ContentForge 自己的应用层、工作流编排和发布能力。**
