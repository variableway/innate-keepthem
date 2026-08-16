# Vizplainer 模式分析 & ContentForge 整合方案

> 来源: https://www.vizplainer.com/  
> 分析日期: 2026-07-24

---

## 一、Vizplainer 是什么

Vizplainer 是一个 **AI Explainer Video Generator** —— 自动生成"解说型视频"的工具。

### 1.1 核心模式

| 环节 | 说明 | Vizplainer 实现 |
|------|------|----------------|
| **输入** | 财报/新闻/数据报告 | Alphabet Q3 2025 Earnings Report |
| **信息挖掘** | AI 深度阅读 + 社区情感聚合 | Reddit, Hacker News, X 评论追踪 |
| **结构化叙事** | 提炼 3 个关键要点 + 总结 | "Three specific things..." |
| **观点对比** | 多方视角呈现 | Bull vs Bear 观点对比 |
| **输出** | 视频解说（脚本 + 字幕 + 配音） | 自动生成视频 |

### 1.2 内容结构拆解（以 Alphabet 分析为例）

```
开场 Hook
  └── "The Google 'death spiral' narrative is officially dead."
      └── 震撼数据: "first-ever $100 billion quarter"

要点 1: AI Infrastructure
  ├── 核心数据: Gemini 7B tokens/minute
  ├── 社区观点: HN 讨论 "experimental AI → enterprise utility"
  └── 结论: "enterprise migration to GCP is actually happening"

要点 2: Spending Controversy
  ├── 核心数据: $91-93B CapEx guidance
  ├── 社区观点: Reddit r/investing 多空分歧
  └── 结论: "capital-efficient monster, 34% operating margin"

要点 3: Regulatory Fine
  ├── 核心数据: $3.5B EU antitrust fine
  ├── 社区观点: "cost of doing business"
  └── 结论: "can absorb multi-billion hit, Net Income +33%"

总结 Takeaway
  ├── Search 未死: double-digit growth
  ├── Gemini: 650M MAU
  └── 结论: "insurmountable moat"

互动结尾
  └── "Is $93B sustainable, or is this a bubble?"
```

### 1.3 独特价值

1. **社区情感聚合** — 不只报告数据，还聚合 Reddit/HN/X 的社区讨论
2. **多空视角平衡** — 每个要点都呈现正反双方观点
3. **数据驱动的叙事** — 每个观点都有具体数字支撑
4. **视频原生输出** — 不是文章，是可直接消费的视频内容

---

## 二、与 ContentForge 的契合度分析

### 2.1 能力映射

| Vizplainer 能力 | ContentForge 现有模块 | 匹配度 | 差距 |
|----------------|----------------------|--------|------|
| 内容采集（财报/新闻） | `ingestion/` — WebScraper, AgentReach | ✅ | 需增加财报专用解析 |
| 社区情感聚合 | **未实现** | ❌ | 需要新增 Reddit/HN/X API 采集 |
| AI 深度分析 | `processing/ai_engine.py` | ✅ | 已有 AIEngine，需增加分析 Prompt |
| 结构化叙事 | `processing/summarizer.py` | ⚠️ | 摘要≠叙事，需新增 Narrative Builder |
| 观点对比 | **未实现** | ❌ | 需新增 Perspective Comparator |
| 视频生成 | `processing/video_generator.py` | ❌ | 完全缺失 |
| 字幕生成 | `processing/transcriber.py` | ⚠️ | 有转录，无字幕生成 |
| 发布到社交平台 | `publishing/` | ✅ | 小红书/JSON/Markdown 已支持 |

### 2.2 整合价值

Vizplainer 模式可以极大增强 ContentForge 的以下场景：

| 场景 | 说明 |
|------|------|
| **财报速览** | 下载财报 PDF → AI 分析 → 生成 3 分钟解说视频 |
| **热点追踪** | 抓取 Twitter/X 热点 → 社区情感分析 → 生成观点对比视频 |
| **竞品分析** | 采集竞品动态 → 多方视角对比 → 生成分析视频 |
| **Research 转内容** | 阅读论文/报告 → 提炼要点 → 生成科普视频 |

---

## 三、ContentForge 整合方案

### 3.1 新增 Pipeline: `vizplainer`

```yaml
# pipeline/presets.py 新增
PipelinePreset(
    id="vizplainer",
    name="Vizplainer 视频生成",
    description="采集内容 → 社区情感 → AI 分析 → 叙事构建 → 视频生成",
    steps=[
        # Step 1: 内容采集
        {
            "handler": "IngestionHandler",
            "config": {"mode": "deep_read", "extract_tables": True}
        },
        # Step 2: 社区情感采集（新增）
        {
            "handler": "CommunitySentimentHandler",
            "config": {
                "sources": ["reddit", "hackernews", "x"],
                "query_template": "{company_name} {topic}",
                "max_posts_per_source": 50
            }
        },
        # Step 3: AI 深度分析
        {
            "handler": "AnalysisHandler",
            "config": {"mode": "deep", "output_format": "structured_json"}
        },
        # Step 4: 叙事构建（新增）
        {
            "handler": "NarrativeBuilderHandler",
            "config": {
                "style": "vizplainer",  # 3-point + takeaway 结构
                "tone": "professional_but_conversational",
                "include_perspectives": True  # 多空视角
            }
        },
        # Step 5: 视频生成（新增）
        {
            "handler": "VideoGenerationHandler",
            "config": {
                "format": "vertical_1080p",  # 9:16 短视频
                "duration_target": "3m",
                "style": "subtitle_overlay",  # 字幕叠加风格
                "voice": "auto_select"
            }
        },
        # Step 6: 发布
        {
            "handler": "PublishHandler",
            "config": {"formats": ["mp4", "xhs", "twitter"]}  # 视频 + 文案
        }
    ]
)
```

### 3.2 新增核心模块

#### 3.2.1 Community Sentiment Collector

```python
# contentforge/ingestion/community_sentiment.py（新增）

class CommunitySentimentCollector:
    """社区情感采集器 — 聚合 Reddit, Hacker News, X(Twitter) 的讨论情感"""
    
    SOURCES = {
        "reddit": RedditAPI(),
        "hackernews": HNAlgoliaAPI(),
        "x": XAPI(),  # 或第三方服务
    }
    
    def collect(self, query: str, sources: List[str], max_posts: int = 50) -> SentimentReport:
        """
        采集并分析社区情感
        
        Returns:
            SentimentReport {
                overall_sentiment: "positive" | "mixed" | "negative",
                key_threads: List[ThreadSummary],  # 热门讨论串
                bull_points: List[str],  # 看多观点
                bear_points: List[str],  # 看空观点
                notable_quotes: List[Quote],  # 经典引用
                engagement_metrics: Dict,  # 互动数据
            }
        """
```

#### 3.2.2 Narrative Builder

```python
# contentforge/processing/narrative_builder.py（新增）

class NarrativeBuilder:
    """叙事构建器 — 将分析结果转化为结构化解说脚本"""
    
    TEMPLATES = {
        "vizplainer": VizplainerTemplate(),  # 3-point + takeaway
        "executive_summary": ExecutiveSummaryTemplate(),  # 执行摘要
        "deep_dive": DeepDiveTemplate(),  # 深度分析
    }
    
    def build(self, analysis: AnalysisResult, template: str = "vizplainer") -> NarrativeScript:
        """
        构建叙事脚本
        
        Returns:
            NarrativeScript {
                hook: str,  # 开场 Hook
                key_points: List[KeyPoint],  # 核心要点（3个）
                perspectives: List[Perspective],  # 多方观点
                takeaway: str,  # 总结
                call_to_action: str,  # 互动结尾
                scenes: List[Scene],  # 分镜脚本（时间轴）
            }
        """
```

#### 3.2.3 Video Generator

```python
# contentforge/processing/video_generator.py（新增）

class VideoGenerator:
    """视频生成器 — 将叙事脚本转化为视频"""
    
    def generate(self, script: NarrativeScript, config: VideoConfig) -> VideoOutput:
        """
        生成视频
        
        实现方案（可选）:
        A. 集成 Manim（数学动画）— 适合数据可视化
        B. 集成 Remotion（React 视频）— 适合字幕叠加风格
        C. 集成 moviepy（Python 视频编辑）— 轻量级方案
        D. 调用外部 API（如 HeyGen, D-ID, Synthesia）— SaaS 方案
        
        推荐: 方案 C (moviepy) + 方案 D (SaaS) 作为备选
        """
```

### 3.3 前端 UI 扩展

#### 新增页面: `app/workflows/vizplainer/page.tsx`

```
Vizplainer 工作流页面:
┌─────────────────────────────────────────┐
│  📊 Vizplainer 视频生成                  │
├─────────────────────────────────────────┤
│  输入 URL / 上传文件                      │
│  [https://...] [📁 上传 PDF]             │
├─────────────────────────────────────────┤
│  配置选项                                │
│  ☑ 采集社区情感 (Reddit/HN/X)           │
│  ☑ 包含多空观点对比                      │
│  ☑ 生成视频                             │
│  视频风格: [字幕叠加 ▼] [3分钟 ▼]       │
├─────────────────────────────────────────┤
│  [🚀 开始生成]                          │
├─────────────────────────────────────────┤
│  生成进度                                │
│  [████████░░░░░░] 步骤 3/6: 叙事构建    │
├─────────────────────────────────────────┤
│  预览 & 发布                             │
│  [▶ 预览视频] [📋 复制脚本] [📤 发布]  │
└─────────────────────────────────────────┘
```

---

## 四、实施优先级

| 优先级 | 模块 | 工作量 | 依赖 |
|--------|------|--------|------|
| P0 | Narrative Builder（叙事构建） | 2-3 天 | AIEngine |
| P0 | Vizplainer Pipeline 预设 | 1 天 | Narrative Builder |
| P1 | Community Sentiment（Reddit/HN） | 3-5 天 | 需 API key |
| P1 | 前端 Vizplainer 工作流页面 | 2-3 天 | Pipeline API |
| P2 | Video Generator（moviepy 基础版） | 5-7 天 | 叙事脚本 |
| P2 | 字幕自动生成 | 2-3 天 | Video Generator |
| P3 | X/Twitter 情感采集 | 2-3 天 | 需 API 权限 |
| P3 | 高级视频风格（Manim/Remotion） | 7-10 天 | 视频基础设施 |

---

## 五、与现有 SPEC 的关联

| 本文档模块 | 对应 SPEC 文件 | 关联章节 |
|-----------|---------------|---------|
| Pipeline 预设 | `PYTHON_CORE_SPEC.md` | 5. 流水线模块 |
| AI 深度分析 | `PYTHON_CORE_SPEC.md` | 4. AI 模块 — AIEngine |
| Community Sentiment | `PYTHON_CORE_SPEC.md` | 3. 采集模块（扩展） |
| Video Generator | `PYTHON_CORE_SPEC.md` | 新增章节（待补充） |
| Narrative Builder | `PYTHON_CORE_SPEC.md` | 4. 处理模块（扩展） |
| 前端工作流页面 | `FRONTEND_SPEC.md` | 8. 页面组件（扩展） |
| Pipeline 执行 | `RUST_BACKEND_SPEC.md` | 6. 核心服务 — Pipeline Framework |

---

## 六、参考实现

### 6.1 类似开源项目

| 项目 | 链接 | 参考价值 |
|------|------|---------|
| **NewsWithJokes** | AI 新闻解说 | 叙事风格参考 |
| **Manim** | https://github.com/3b1b/manim | 数学/数据动画 |
| **Remotion** | https://www.remotion.dev/ | React 视频生成 |
| **moviepy** | https://github.com/Zulko/moviepy | Python 视频编辑 |

### 6.2 Vizplainer 技术栈推测

基于内容特征分析，Vizplainer 可能使用：

- **文本生成**: GPT-4 / Claude（叙事脚本）
- **社区采集**: Reddit API + HN Algolia API + X API
- **语音合成**: ElevenLabs / OpenAI TTS
- **视频合成**: 可能是 Remotion / 自定义 FFmpeg 管线
- **字幕**: Whisper（转录）+ 自定义字幕渲染

---

*本文档作为 ContentForge 扩展 Vizplainer 模式的可行性分析和实施蓝图。*
