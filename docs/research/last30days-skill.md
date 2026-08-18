# last30days-skill 原理分析

> 分析对象：`last30days-skill`（v3.21.0，GitHub Trending #1 的 Agent Skills 项目）
> 代码位置：`last30days-skill/`（git submodule，上游 `mvanhorn/last30days-skill`）
> 本文只讲**原理**（设计思想与工作机制），不讨论与 ContentForge 的集成方案（见 `docs/archive/analysis-agent-reach-last30days.md`）。

---

## 1. 定位：一个"研究型" Agent Skill

last30days 不是普通的工具库或 CLI，而是一个 **Agent Skills 生态下的研究引擎**。核心主张：

> "Google aggregates editors. /last30days searches people."
> （谷歌聚合的是编辑，last30days 搜索的是人。）

它解决的核心问题是：**任何单一 AI 都无法同时触达所有平台**（Google 搜不到 Reddit 评论和 X 帖子，ChatGPT 有 Reddit 合作但搜不到 X/TikTok，Gemini 有 YouTube 但没有 Reddit）。last30days 的做法是：用自己的 key 和浏览器会话，让一个 AI Agent **并行桥接十几个互不相通的平台**，按"真实用户互动量"评分，再合成一份简报。

三个关键定位特征：

| 维度 | 说明 |
|------|------|
| 产品形态 | 斜杠命令 `/last30days <topic>`，不是 CLI 也不是库 |
| 分发方式 | 遵循 [Agent Skills](https://agentskills.io) 开放格式，可安装到 Claude Code、Codex、Cursor、GitHub Copilot、Gemini CLI、Grok 等 50+ harness |
| 核心资产 | `SKILL.md`（1400+ 行运行时契约）+ `scripts/last30days.py`（Python 引擎） |

---

## 2. 双层架构：SKILL.md 契约 + Python 引擎

整个项目的灵魂是**双层架构**，二者有明确分工和契约：

```
SKILL.md (运行时指令契约，v3.21.0)
   │  ─ 告诉模型：如何理解用户意图、跑哪些步骤、传哪些 flag
   │  ─ 告诉模型：输出必须长什么样（BADGE + 11 条 LAWs）
   ▼
AI Agent（宿主模型，如 Claude/Codex/Gemini）
   │  ─ 解析 SKILL.md → 规划 → 生成 --plan JSON → 调用引擎
   ▼
scripts/last30days.py（Python 引擎）
   │  ─ 多源并行检索 → 评分排序 → 跨源聚类 → AI 重排
   ▼
结构化输出（badge 行 + 排名证据簇 + emoji-tree footer）
```

### 2.1 SKILL.md：面向模型的"法律"

SKILL.md 是模型每次调用 skill 时**必须通读**的规范文件。它包含：

- **输出契约**（放在文件开头，保证每次运行都进入上下文）：BADGE + 11 条 LAWs（见 §6）
- **步骤流水线**（Step 0 → Step 2.5）：首次向导、查询预检、实体解析、计划生成、引擎执行、WebSearch 补充
- **引擎调用契约**：每个步骤给出精确的 Bash 命令模板（含 `SKILL_DIR` 替换、`mktemp` 临时文件模式、超时设置）
- **反漂移护栏**：针对历史上真实发生的模型"跑偏"事故，每一条都写了"事故复盘 + 结构化修复"

### 2.2 引擎：可独立运行的 Python 程序

引擎是普通 Python 3.12+ CLI，可独立运行（`python3 last30days.py "topic" --emit=compact`），但**设计上只作为脚本化/定时/调试路径**。SLASH 命令路径下，模型必须先规划、再调用引擎，引擎输出模型再合成。契约要点：

- 引擎用 `--plan` 接收模型的查询计划，**跳过内部规划器**（`LAW 7: YOU ARE THE PLANNER`）
- 引擎输出特定形状（badge 行、排名证据簇、emoji-tree footer），模型必须**逐字传递**，不得改写
- 引擎健康状态属于 stderr 诊断，**不得**泄露进用户可见的合成正文（`LAW 9`）

### 2.3 多 harness 意识

所有功能设计都要求"跨 harness 可用"：

- 首次向导按宿主分两条支路：**有弹窗的宿主**（Claude Code）用 AskUserQuestion 引导，**无弹窗的宿主**（Codex/Cursor/Gemini CLI）用纯文本流程
- 引文格式按宿主分两种渲染：**隐藏链接宿主**（Claude Code，`CLAUDECODE` 环境变量）用 `[name](url)` 内联链接；**可见 URL 宿主**（Codex 等）用纯文本标签，避免 URL 汤（`LAW 8`）
- `SKILL_DIR` 直接取自模型刚读到的 SKILL.md 所在目录，不枚举各 harness 的安装路径

---

## 3. 研究流水线（从提问到简报）

一次普通的 `/last30days <topic>` 运行经历以下步骤：

```
用户提问
  │
  ├─ Step 0   首次运行向导（安装工具、提取 cookie、收集授权）
  ├─ Step 0.45 查询质量预检（识别 5 类"关键词陷阱"话题）
  ├─ Step 0.5 实体解析（X handle / GitHub user / repo / Trustpilot / subreddits / hashtags）
  ├─ Step 0.75 生成查询计划（模型自己当 planner，产出 --plan JSON）
  ├─ Step 1   引擎执行（多源并行检索 → 评分 → 聚类 → 重排）
  ├─ Step 2   WebSearch 补充（宿主模型自己的 web 搜索能力，作为补充证据）
  ├─ Step 2.5 把补充结果追加进原始存档文件（持久化引用）
  └─ 合成     Judge Agent 把证据合成结构化简报
```

### 3.1 Step 0：首次运行向导

- 通过 `grep "SETUP_COMPLETE=true" ~/.config/last30days/.env` 判断是否首启
- 向导做**纯机械工作**：安装 yt-dlp（YouTube）、Digg CLI、提取浏览器 cookie（X/Twitter 等）、GitHub 设备授权、ScrapeCreators 免费额度注册
- **同意权在人、引导在模型**：子进程不能弹窗，所以向导文案嵌入在模型的问题里，模型负责询问，子进程只做执行
- 密钥管理：API key 经 setup 写入 `.env`（权限 0o600），GitHub device code 用"两步命令"分拆（`setup --github-start` 立即返回 code，`setup --github-poll` 等待授权）

### 3.2 Step 0.45：查询质量预检（关键词陷阱）

**核心思想：有些话题对社交平台检索来说是"注定失败"的，引擎跑 5 分钟只会产生垃圾，预检省的是这一轮。** 五类陷阱：

| 类别 | 模式 | 处理 |
|------|------|------|
| Class 1 人口学购物查询 | `gift for 42 year old man` | 社交平台没人这么说话。问一句 hobbies/关系/预算，或改写成 `gifts for men in their 40s` + 限定 gift 社区 |
| Class 2 数字/年龄陷阱 | 话题含 `42`/`40`/`100` | 数字会命中无关内容（Jackie Robinson #42、Hitchhiker's 42）→ 从检索查询中剥离数字（GPT-4、Area 51 这类不可剥离的除外） |
| Class 3 过于字面的概念短语 | `how to use Docker` | 社交帖子说 "my Docker setup" 不说 "how to use Docker" → 改写成讨论式短语 |
| Class 4 泛化单一名词 | `bread`/`coffee` | 无锚点、语料无限 → 要求用户给出具体切面 |
| Class 5 非英文话题 | 含希伯来/阿拉伯/CJK 字符 | 强制 `--web-backend brave`（唯一有真实语言覆盖的来源），Reddit/HN/GitHub 预期零命中 |

预检输出一行可见标记（`Pre-Flight: topic matches Class N ...`），若需澄清则**停一步等用户**——这就是"one-turn gate"规则。

### 3.3 Step 0.5：实体解析

模型用 WebSearch 解析话题的**可定向实体**，作为引擎 flag 传入：

- **X 主账号** `--x-handle`（人/品牌/产品本人的账号）+ **关联账号** `--x-related`（创始人/合作者/评论媒体，权重 0.3）
- **GitHub 用户** `--github-user`（人会写代码就必须解析，否则关键词匹配全 GitHub 而非 `user:{handle}` 定向——这是文档记录的 Peter Steinberger 事故）
- **GitHub 仓库** `--github-repo`（产品/开源项目话题）
- **Trustpilot 域名** `--trustpilot-domain`（公司/品牌；传了 flag 会自动激活 Trustpilot 来源）
- **subreddits / TikTok hashtags / IG creators**（Step 0.55 预研）

规则：**不是解到第一个 flag 就停**，适用于该话题类别的每个 flag 都是强制的。例如"会写代码的人"话题最少要 `--x-handle` + `--github-user` + `--subreddits`。

### 3.4 Step 0.75：查询计划（模型即规划器）

**LAW 7 的落地**：规划能力属于宿主模型，不需要任何 API key。

模型生成 JSON 查询计划（`--plan`）：
- `intent`（breaking_news / product / comparison / how_to / opinion / prediction / factual / concept）
- 1~4 个 `subqueries`，每个含 `search_query`（关键词重、贴近平台标题）+ `ranking_query`（自然语言问题）+ `sources` + `weight`（主查询 1.0，次要 0.6~0.8，外围 0.3~0.5）
- `freshness_mode` 与 `cluster_mode` 由 intent 推导（breaking_news → strict_recent + story；comparison → balanced_recent + debate 等）
- **消歧规则**：易撞名的话题（Loom=织布机、Tella=球员）必须在**每个子查询**里锚定具体实体（`kevin rose digg founder`），否则检索返回的是同名他人（2026-06-17 的 Kevin Rose 事故：55 条结果 0 条关于本人）

计划通过 `mktemp + heredoc` 写入临时文件传给引擎，规避 shell 引号陷阱（反引号、撇号）。

### 3.5 Step 1：引擎执行

前台运行，5 分钟超时。引擎自动检测可用 API key、并行跑各来源搜索。输出 8+ 个数据段（Reddit、X、YouTube、TikTok、Instagram、HN、Polymarket、Web），**模型必须读完整**——漏读段落就会产出不完整统计。

### 3.6 Step 2：WebSearch 补充

宿主模型自己的 Web 搜索工具作为**补充**证据（编辑向文章、博客对比），不是替代引擎。补充结果追加进存档的原始文件（Step 2.5），成为持久化引用；若宿主无搜索工具，则给引擎加 `--auto-resolve` 让它用配置的 web 后端（Brave/Exa/Serper）或 keyless 兜底。

### 3.7 Judge Agent：合成

模型作为"法官"按 `LAW 9` 合成：**以簇为单位**总结（每个簇 = 一个故事），多源簇置信度最高；嵌入至少 2 条逐字社区评论（`## Top Community Comments`）；Polymarket 概率作为"真金白银"信号融入叙述；引用格式按宿主二选一。合成前先"内化研究"——锚定实际检索内容，不得用先验知识顶替（`ANTI-PATTERN`：检索返回 ClawdBot 就不能合成成 Claude Code skills）。

---

## 4. 引擎核心机制

引擎代码位于 `skills/last30days/scripts/lib/`，约 70+ 个模块。核心机制如下。

### 4.1 多源并行检索 + 多后端回退

```
线程池（ThreadPoolExecutor）并行
  ├─ Reddit：OpenAI Responses API web_search（域限定 reddit.com）→ 回退 Reddit 公开 JSON
  ├─ X：bundled Bird（免费，env 传 AUTH_TOKEN/CT0）→ xAI API（grok-4-1-fast）→ 跳过
  ├─ YouTube：yt-dlp + 字幕转录 → 转录高亮
  ├─ HN / Polymarket / GitHub / Techmeme / arXiv：公开 API 或 RSS
  ├─ TikTok / Instagram / LinkedIn / Threads / Pinterest：ScrapeCreators 或 RSS
  └─ Web：Brave / Exa / Serper / Parallel / keyless 兜底
```

**每个来源都是"有主次的后端链"**：主后端挂了自动降级，绝不整体失败。X 的降级链 `Bird → xAI → skip` 是最典型例子。

### 4.2 真实 engagement 数据（Enrichment）

检索只拿到"条目列表"，**真实互动数据靠事后补抓**：

- Reddit：命中线程后请求免费 JSON API（`/r/{sub}/comments/{id}/.json`）拿真实 upvotes、评论数、upvote ratio、top 10 评论
- GitHub：`(live: NNK stars)` 标注的星数来自事后 API 复查，覆盖原始来源的陈旧数字

这正是"按人们真实互动量排序，而非 SEO 相关性"的根基——**所有评分都建立在真实平台数据上，不是 AI 估算**。

### 4.3 归一化 → 去重 → 融合

- **归一化**：统一格式与时区
- **日期过滤**：硬过滤到请求的日期窗（"last 30 days" 是契约，不是软约束）
- **去重**（`dedupe.py`）：URL 归一化（去 `www./old./m.` 前缀、去 `utm_*` 跟踪参数）+ 文本相似度（`prepared_similarity`）
- **融合**（`fusion.py`）：加权 **Reciprocal Rank Fusion**（RRF，平滑常数 K=60，Cormack et al. 2009）——按每个子查询 × 来源流的排名做跨流融合，子查询权重参与加权。窗外的陈旧证据**严格排在任何窗内证据之下**（一个 9 个月前的视频可以出现，但绝不能排第 1，否则就违反了"last 30 days"自身契约）

### 4.4 实体接地（Entity Grounding）与相关性评分

- **相关性**（`relevance.py`）：查询分词重叠 + 本地词频分
- **实体接地**：候选条目必须提及 Primary entity（话题去掉意图修饰词后的品牌/专名核心）。**接地键是 Primary entity 的头部 token（第一个词）**，而非整个短语——尾词通常是搜索描述词，强求会错误降级真正相关的条目
- 未接地的条目承受**决定性降级** `ENTITY_MISS_PENALTY = 25.0`（典型分数分布在 30–70，25 分足以把离题项压到相关项之下；惩罚故意"保守"，宁可漏罚不可误杀，见 CONCEPTS.md 的 failure-mode 分析）
- 相关回退兜底项若既无实体接地又无稳定原始主题锚点，则从合成证据中隐藏

### 4.5 聚类与多样性代表（`cluster.py`）

- 仅对可聚类 intent（breaking_news / opinion / comparison / prediction）聚类，否则每候选独立成簇
- **贪心聚类**：围绕高排名的"领袖"聚合，相似度阈值 breaking_news 用 0.42（相关文章共享词更少）、其余 0.48
- **MMR 多样性代表**（λ=0.75）：每簇最多挑 3 个代表条目，在"高分"与"与已选代表不重复"之间平衡——防一簇全是同一事件的雷同报道
- 簇带不确定性标签：`single-source`（只有单平台证据）/ `thin-evidence`（所有条目 <55 分），明确告诉合成者置信度

### 4.6 重排（LLM rerank + 惩罚项）（`rerank.py`）

- 有 LLM key 时用模型按 `ranking_query` 给候选打相关性分
- **作者上限**：单作者最多 3 条（防单一声音主导池子）；话题本人（resolved handle）上限放宽到 8（`_MAX_ITEMS_PER_FIRST_PARTY_AUTHOR`）——既要防淹没，也要保住"用户问的正是这个人"
- **第一方作者信用** `FIRST_PARTY_AUTHOR_CREDIT = 5.0`：故意给很小的加分——目标是让第一方帖子**存活进可见带**，而不是靠作者身份自动获胜
- **第一方地板**：某条第一方帖的 entity-miss 标记可被清除（其说明文本换成 "first-party post"，所有下游相关性门禁把它当已接地）

### 4.7 数据模型（`schema.py`）

```
QueryPlan  →  SubQuery[]（label / search_query / ranking_query / sources / weight）
SourceItem →  item_id / source / title / body / url / author / engagement{} / snippet / metadata
Candidate  →  local_relevance / freshness / engagement / source_quality / rrf_score / rerank_score / final_score / fun_score / cluster_id
Cluster    →  title / candidate_ids / representative_ids / sources / score / uncertainty
Report     →  items_by_source / query_plan / errors_by_source / ranked_candidates / clusters
```

持久化（SQLite `store.py`）：`topics` / `runs` / `findings` 三表，支持"趋势监控"（watchlist 定时重跑找新发现）。

---

## 5. Discovery 模式：无主题的趋势发现

`/last30days trending` 或 `what's exploding in X?` 触发 Discovery：**先找"值得研究的主题"，再做研究**。这是与普通模式最大的分叉。

### 5.1 三腿宿主评判协议（LAW 11）

```
Leg 1  --discover --nominate-only
       引擎扫流（r/all、HN 首页、Digg AI 1000、X 热推）→ 写"提名束"文件
       ↓
Judge（宿主模型，无引擎调用）
       读提名束 → 对每个提名判定：name（2-6 词可搜索名）/ junk（垃圾形状）/ worthiness（0-100）
       ↓
Leg 2  --discover --judgments <file>
       每个存活主题跑一次完整研究流水线（Enrichment pass，并行，墙钟预算 ~450s）
       ↓
Angles（宿主模型）
       为每个主题写 podcast 钩子 + X 文章钩子（各 ≤200 字符）
       ↓
Leg 3  --discover --finalize --angles <file>
       渲染成趋势简报（离线，逐字传递）
```

三个命令必须用**同一个 `--save-dir`**（交接文件在其中），交接文件 1 小时 TTL。契约失败（过期/缺 bundle/束 id 不匹配）以 exit 2 报错并指名修复方式——只重跑该腿，不重跑昂贵的前腿。

### 5.2 关键概念

| 概念 | 含义 |
|------|------|
| **Nomination（提名）** | 引擎扫流聚类出的候选主题：名字 + Junk 形状标记 + 内容价值分；名字兼任后续检索查询和研究交接，所以**先命名再研究** |
| **Confidence floor（信心下限）** | 每个主题的**绝对证据门槛**：先过互动垃圾门，再要么独立跨源佐证、要么强单源尖峰。Junk 形状主题走更严口径（关单源旁路、只数种子源佐证）。门槛是绝对的——相对门槛会随池子一起烂掉 |
| **Nothing-solid（无实据）** | 零主题过门槛时的一等结果，不是错误：报告"窗口内没有够强的信号"，并点名最接近的子门槛候选（偏好非 junk 形状的）让用户知道信号在哪里断了 |
| **Junk shape** | 帮助帖/初学者提问/个人随想等"仅凭互动量无法与新闻区分"的帖子形状。宿主判 junk 是一票否决（排除出 Enrichment）；启发式标记只关单源旁路 |
| **Topic queue（主题队列）** | 每个已浮出主题按研究存储记录，后续运行标注 "surfaced Nth time"，用户可标记 **Covered**。身份注释只追加不合并——假匹配只多一行噪音，绝不吞掉隐藏故事。Covered 状态永不被重新浮出覆盖 |

### 5.3 全局 vs 领域

- **全局 trending**：bare `--discover`，扫每个流的 hot list，无关键词门
- **领域 trending**：`--discover "<domain>"`，扫流时按领域关键词门控

---

## 6. 输出契约与"反漂移"设计

这是 last30days 最独特、最值得研究的部分。**它的核心问题不是代码 bug，而是模型行为漂移**——同一模型、相似的 SKILL.md 内容，beta 时 10/10 全部达标，公开发布时 0/8 全部跑偏（把 `/last30days` 当成通用研究关键词即兴发挥、发明标题、发明 section header、泄漏 Sources 块）。修复方式不是"再强调一次"，而是**结构性锚点**。

### 6.1 BADGE：强制第一行

```
🌐 last30days v3.21.0 · synced 2026-08-18
```

引擎自己把它打在 `--emit=compact` 输出的第一行，模型必须**逐字传递**。它是标题类违规的结构锚点——模型想写自创标题时，badge 就是标题。

### 6.2 11 条 LAWs（要点）

| LAW | 内容 | 目的 |
|-----|------|------|
| 1 | **禁 `Sources:` 尾块** | 引擎 emoji-tree footer 是唯一可见引用；WebSearch 工具自带的 "must include Sources" 提示在这里被显式覆盖 |
| 2 | **禁发明标题**（比较查询除外） | 正文首行固定为 `What I learned:` 散文标签 |
| 3 | **加粗引导段** | KEY PATTERNS 与段中引导用 `**bold**`，且覆盖用户的全局"无加粗"偏好 |
| 4 | **禁 `##` section header**（比较查询除外） | 防止漂移成博客叙事格式 |
| 5 | **引擎 footer 逐字传递** | emoji-tree 统计块不得改动 |
| 6 | **禁编造数据** | 所有数字必须来自证据 |
| 7 | **YOU ARE THE PLANNER** | 命名实体话题必须 `--plan`；引擎的确定性规划只是 headless 路径 |
| 8 | **按宿主引文** | 隐藏链接宿主内联链接；可见 URL 宿主纯标签；禁裸 URL 串、禁 URL 汤、禁断链 |
| 9 | **编织社区声音** | 至少 2 条逐字、署名评论混入叙述；禁"叙事工具本身"（不说"引擎没搜到"） |
| 10 | **第一方帖是一等证据** | 人物话题上本人帖子必须引用；`interaction:→@handle` 标签是关系信号 |
| 11 | **YOU ARE THE JUDGE** | Discovery 必须走三命令协议；引擎确定性启发式是 headless 路径 |

### 6.3 反漂移方法论（三个结构锚点）

1. **关键规则上移**：输出契约、LAWs、引用规则全部放在 SKILL.md **开头**（而不是原来 1094 行/1224 行的位置）。事故复盘反复证明：规则只要低于模型的分块读取窗口，就一定会被跳过。
2. **引擎代替模型输出形状**：badge 行、证据簇、footer 由引擎发出、模型逐字传递——把"格式正确"从模型行为变成流水线产物。
3. **每条 LAW 附真实事故复盘**：每条规则后面都写了"哪天、哪个主题、模型怎么跑偏的、为什么这次修复能堵住"。这既是给模型的上下文，也是给维护者的回归依据。

命名失败模式被显式写入：`LAW 2/4` 违规、`LAW 1` 泄漏、`LAW 7` 的 "provider 误解陷阱"（模型把引擎的 "no provider" 读成"我没有能力"而非"你该自己规划了"）、Discovery 的 "one-shot note 误解陷阱"——都在文件里点名提醒。

---

## 7. 韧性设计

| 层 | 策略 |
|----|------|
| HTTP | 3 次重试 + 指数退避（1s→2s→3s） |
| 模型 | 访问错误自动降级到下一档（gpt-5.2→5.1→5→4.1→4o→4o-mini） |
| 来源 | 每源多后端链，静默降级（Bird→xAI→skip） |
| 单条富集 | per-item try/catch，失败保留未富集条目 |
| 流水线 | 错误存入 `reddit_error`/`x_error` 展示给用户，不整体失败 |
| Keyless 路径 | 无任何 API key 也能用：Reddit 公开 JSON + RSS + 本地评分（无 LLM rerank 时实体接地等词法质量护栏最重要） |
| Discovery | Enrichment pass 失败/超预算 → 该主题降级为"仅提名证据"，**绝不让整个 run 失败** |
| 运行时 | Python 3.12+ 版本门 + `uv` 自动安装托管 CPython 兜底；5 分钟 Bash 超时 |

还有 `doctor` 健康检查子命令：诊断坏掉/缺失的来源，输出 (ok/warn/off/error, message)。

---

## 8. 质量保障

- **测试**：`tests/` 约 89 个 pytest 文件 + fixture 录制（`--record-fixtures` 抓 scrubbed 的 HTTP/CLI 响应做确定性回归），覆盖率门槛只升不降
- **搜索质量评估**（`evaluate_search_quality.py`）：基线修订 vs 候选修订跑固定 5 个评审话题，确定性指标 Jaccard 重叠 / retention / 每源覆盖，可选 Gemini 裁判算 Precision@5 / nDCG@5
- **契约测试**：插件清单版本 lockstep、changelog 工作流、首次向导契约、环境文档契约等都有专门测试文件锁定
- **发布纪律**：towncrier 构建 changelog，`prepare_release.py` 批量 bump 所有 lockstep 表面，feature PR 禁改 CHANGELOG/版本

---

## 9. 设计哲学总结

1. **产品 = Skill 契约，不是代码**：`SKILL.md` 是面向模型的产品说明书，引擎只是实现；新功能以"模型会不会用它"为完成标准（引擎 flag 没有 SKILL.md 集成 = 未完成）。
2. **人机分工清晰**：机械活（抓取、cookie、工具安装）交给子进程；判断活（规划、评判、命名、角度）明确归属宿主模型，并用 LAW 7/11 反复声明"你就是那台机器"。
3. **真实数据优先**：所有评分基于真实平台互动数据，宁可少判不可错杀（实体接地的保守性、first-party 地板、宽容上限）。
4. **诚实胜过好看**：Nothing-solid 是一等结果；Junk shape 的严格口径；窗内证据永远压过窗外。
5. **防漂移是工程**：把"模型行为"当被防御的敌人，用结构锚点（badge、引擎产出形状、规则上移、事故复盘）而非口头强调来治理。
6. **韧性是默认值**：每层都有降级路径、预算和诚实失败，绝不让单点故障或超时毁掉整个交付物。

---

## 10. 对本仓库的借鉴价值

| 借鉴点 | 可落地的场景 |
|--------|-------------|
| SKILL.md 双层契约 + 防漂移锚点 | 本仓库 `.agents/skills/` 下的技能（contentforge 等）可参照其"输出契约 + 事故复盘"写法治理模型行为漂移 |
| 多后端回退链 | vYtDL 的 yt-dlp 包装、ContentForge 的采集域可设计"主后端 → 备用 → 诚实跳过"链 |
| 真实数据富集 | ContentForge 处理后端做评分时可"先检索、后补抓真实互动量"，而非相信检索时的估算 |
| 查询计划（模型即 planner） | ContentForge 的 AI 处理流水线可让模型先产出结构化 plan（intent/subqueries/weights）再执行 |
| 实体接地 + 决定性惩罚 | 任何"多源内容相关性过滤"模块的通用做法：head-token 接地 + 大额惩罚，宁可漏罚不可误杀 |
| Discovery 三腿协议 + checkpoint | 内容选题/趋势发现类功能：nominate → judge → enrich → finalize，用 bundle id + TTL 做断点续跑 |
| Confidence floor / Nothing-solid | 任何"选趋势/选话题"功能都要有绝对证据门槛和诚实的空结果，拒绝相对门槛 |
| 韧性预算 | 并行 Enrichment 的墙钟预算 + 失败降级（绝不整体失败）的模式可移植到任何并行处理管线 |
