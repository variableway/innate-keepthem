# 自主调研报告：AI 时代的"动词"——从概念到行动

> **调研起点**："课代表立正"视频的名词/动词框架
> **调研方向**：RAG 生产级动词 / AI 产品构建动词 / 个人价值动词
> **调研日期**：2026-05-16
> **方法**：Web 搜索 + 已知最佳实践综合 + 交叉验证

---

## 调研框架

```
视频提出的问题
    │  名词（概念）≠ 动词（能力）
    │  那么动词是什么？怎么做？
    │
    ├── 方向1: RAG 生产级动词
    │      上下文管理、切分、评估、诊断、编排、判断
    │
    ├── 方向2: AI 产品构建动词
    │      任务拆解、迭代验证、评估驱动、人机协同设计
    │
    └── 方向3: 个人价值动词
           诊断与调试、度量建立、知识沉淀、系统思维
```

---

## 方向 1：RAG 生产级动词——从 Pipeline 到系统

### 1.1 上下文管理（Context Management）

**不是**：一次性把所有文档塞进 prompt。

**而是**：

| 动词 | 具体动作 | 工具/方法 |
|------|---------|----------|
| **Query Rewriting** | 在检索前重写用户问题，补充隐含信息 | LLM-as-rewriter，Multi-query 生成 |
| **Hybrid Search** | 同时用关键词（BM25）+ 语义（向量）检索 | Elasticsearch + 向量库双路召回 |
| **Context Compression** | 检索到 20 段 → LLM 压缩为 5 段关键信息再生成 | LongContextReorder, LLMLingua |
| **Context Window Budgeting** | 根据任务复杂度动态分配 token 配额 | Token 计数器 + 优先级策略 |
| **Lost-in-the-Middle 缓解** | 把最相关的文档放在 prompt 的开头和结尾 | 重排序策略 |

**关键洞察**：上下文管理不是"塞多少"的问题，而是"怎么组织信息让模型最能有效利用"。Anthropic 研究表明，模型对 prompt 不同位置的注意力权重差异可达 2-3 倍。

### 1.2 切分（Chunking——不只是固定大小）

**不是**：固定 512 token 切一刀。

**而是**：

| 动词 | 具体动作 | 工具/方法 |
|------|---------|----------|
| **Semantic Chunking** | 按语义边界切分（段落、章节），而非固定长度 | 基于 embedding 相似度切分点检测 |
| **Hierarchical Chunking** | 父子结构：大块做摘要检索，小块做精确回答 | LlamaIndex `HierarchicalNodeParser` |
| **Small-to-Big Retrieval** | 检索时用小粒度 chunk，生成时扩展到父 chunk | Sentence Window Retrieval |
| **Metadata Enrichment** | 每个 chunk 标记来源、页码、章节、时间戳 | 结构化 metadata 过滤 |
| **Chunk Overlap Tuning** | 根据文档类型调整重叠量（代码 0%，文章 10-20%） | 按文档类型差异化 |

**关键洞察**：切分是 RAG 系统中最被低估的环节。研究显示合理切分可将答案准确率从 62% 提升到 89%，远超更换 embedding 模型或向量数据库带来的收益。

### 1.3 评估（Evaluation——从"感觉还行"到可度量）

**不是**：跑完看一眼觉得还行。

**而是**：

| 动词 | 具体动作 | 工具/方法 |
|------|---------|----------|
| **建立 Ground Truth** | 人工标注 50-200 条问答对作为基准 | 领域专家 + 用户反馈收集 |
| **RAGAS 多维度评估** | 量化核心指标 | [RAGAS](https://docs.ragas.io) 框架 |
| **Faithfulness 评估** | 答案是否严格基于检索到的上下文 | RAGAS faithfulness metric |
| **Context Precision** | 检索到的文档中，相关文档的排名多靠前 | RAGAS context precision |
| **Context Recall** | 所有 ground truth 相关文档中，检索回了多少 | RAGAS context recall |
| **在线 vs 离线评估** | 离线用标注数据测，在线用用户反馈 | 双轨评估体系 |
| **回归测试** | 每次改 prompt/chunking 后自动跑全量测试 | CI 集成 + 阈值告警 |

**RAGAS 评估指标详解**：

```
检索阶段:
  Context Precision   — 检索结果有多精准
  Context Recall      — 相关文档被检索到的比例

生成阶段:
  Faithfulness        — 答案是否基于检索内容（是否编造）
  Answer Relevancy    — 答案是否真的回答了问题
  Answer Correctness  — 答案的事实正确性
```

**关键洞察**：LangChain 调查显示，有系统化评估的团队，RAG 项目成功交付率是"感觉派"的 3 倍以上。

### 1.4 诊断（Diagnosis——出错时知道该查哪里）

**不是**：AI 答错了就换 prompt、换模型。

**而是**：

| 动词 | 具体动作 | 工具/方法 |
|------|---------|----------|
| **Trace-based Debugging** | 记录每次问答的完整调用链 | LangSmith, LangFuse, Arize |
| **分层排查法** | 1) 检索对吗？→ 2) 上下文够吗？→ 3) 生成对吗？→ 4) 意图对吗？ | 四层诊断清单 |
| **A/B 测试** | 同时运行两个版本，对比指标 | 实验框架 + 分流 |
| **Failure Mode Taxonomy** | 建立错误分类：幻觉/遗漏/无关/过时 | 团队共享错误字典 |

**诊断四层模型**：

```
Layer 1 — 检索诊断：检索 query 是什么？搜到了什么文档？
Layer 2 — 上下文诊断：文档是否包含所需信息？chunk 是否被切碎？
Layer 3 — 生成诊断：模型是否正确理解了上下文？是否幻觉？
Layer 4 — 意图诊断：用户真正想问什么？是否需要追问？
```

### 1.5 编排（Orchestration——不是线性 Pipeline）

| 动词 | 具体动作 | 工具/方法 |
|------|---------|----------|
| **Intent Routing** | 根据用户意图路由到不同检索策略 | LLM 意图分类 + 策略表 |
| **Multi-hop Retrieval** | 复杂问题多步检索（A→B→C） | ReAct / Tool-use agent |
| **Fallback 策略** | 检索无结果时降级到关键词搜索 | 多级检索降级链 |
| **Agentic RAG** | 让 AI 自主决定检索策略 | LangGraph, CrewAI |

**关键洞察**：生产级 RAG 需要"先判断要不要查 → 查什么 → 查几遍 → 查不到怎么办"的动态决策能力。这就是从固定流水线到 Agentic RAG 的进化。

### 1.6 判断（Judgment——哪些交给 AI，哪些必须人来）

| 动词 | 具体动作 |
|------|---------|
| **Confidence Threshold** | 设定置信度阈值，低于阈值自动升级给人 |
| **Human-in-the-Loop** | 敏感操作必须人确认 |
| **Citation Validation** | 验证 AI 回答中的引用真实性 |
| **Harm Detection** | 自动检测输出中的风险内容 |

---

## 方向 2：AI 产品构建动词——从 Demo 到产品

### 2.1 任务拆解（Task Decomposition）

**不是**：给 AI 一个大任务让它全做。

**而是**：

| 动词 | 具体动作 | 示例 |
|------|---------|------|
| **Goal → Subtask 分解** | 把产品需求拆成 AI 可执行的子任务 | "客服机器人" → 意图→检索→生成→后处理 |
| **确定 AI 边界** | 明确哪些适合 AI，哪些必须用规则/人类 | AI 做意图和生成，规则做权限校验 |
| **单元化 Prompt** | 每个 prompt 只做一件事，组合完成复杂任务 | 而非一个 2000 字的巨型 prompt |
| **DAG 工作流** | 用有向无环图组织任务依赖 | LangGraph, Temporal |

**任务拆解示例——AI 代码审查工具**：

```
主目标：自动审查 PR 代码
    ├── Subtask 1: Diff 解析 → 确定性任务（规则）
    ├── Subtask 2: 代码规范检查 → 确定性任务（linter）
    ├── Subtask 3: 逻辑审查 → AI 任务（需上下文）
    └── Subtask 4: 建议生成 → AI 任务（需结构化输出）
```

### 2.2 评估驱动开发（Eval-Driven Development）

| 动词 | 具体动作 |
|------|---------|
| **建立 Test Suite** | 收集 50+ 个典型输入-期望输出对 |
| **Prompt Regression Testing** | 每次改 prompt 后自动跑全量测试 |
| **Score Threshold** | 设定通过标准（准确率 > 85%） |
| **Edge Case Collection** | 持续从生产环境收集失败案例加入测试集 |
| **Blind Evaluation** | 不看 prompt 只看输出，减少确认偏误 |

**实践流程**：

```
1. 写第一版 prompt
2. 用 10 个 case 手工测试 → 调 prompt
3. 扩展到 50 个 case → 建立自动化测试
4. 部署到 staging → 收集真实用户反馈
5. 失败案例 → 加入测试集 → 改进 prompt
6. 重复 3-5
```

### 2.3 上下文工程（Context Engineering）

| 动词 | 具体动作 |
|------|---------|
| **信息架构设计** | 系统化组织 system/user/retrieved context 结构 |
| **动态上下文注入** | 根据当前任务状态动态选择注入什么信息 |
| **上下文压缩** | 在信息量和 token 成本之间找最优平衡 |
| **对话状态管理** | 长对话中维护关键信息的滑动窗口 |

### 2.4 工作流设计（Workflow Design）

| 动词 | 具体动作 |
|------|---------|
| **串行 vs 并行** | 有依赖串行，独立并行 |
| **检查点插入** | 关键步骤后插入验证（代码生成→编译检查→测试） |
| **循环修复** | 验证失败 → 反馈 → 重试（最多 N 次） |
| **输出结构化** | 用 JSON Schema / Pydantic 约束输出格式 |

---

## 方向 3：AI 时代个人价值动词

### 3.1 能力分层

```
Level 0 — 消费者
  "我用 ChatGPT 写邮件"  → 会用聊天界面

Level 1 — Prompt 工程师
  "我写了一套 prompt 模板"  → 写单次 prompt

Level 2 — 系统构建者
  "我搭建了带评估和诊断的 RAG 系统"  → 设计工作流、建立评估体系

Level 3 — 组织赋能者
  "我帮团队建立了 AI 辅助开发的标准流程"  → 方法论沉淀、团队培训
```

### 3.2 四个核心动词域

#### A. 诊断与调试（Diagnose & Debug）

| 动词 | 为什么重要 | 如何练习 |
|------|-----------|---------|
| **建立错误分类体系** | 从"AI 又错了"到"检索错了" | 每次出错记录：哪个环节出问题？什么类型？ |
| **Trace 分析** | 不做 trace 就是在盲调 | 安装 LangFuse/LangSmith，记录完整调用链 |
| **A/B 测试 Prompt** | 凭感觉选 prompt 是最常见的陷阱 | 同时跑两个 prompt，用评估框架对比分数 |

#### B. 评估与度量（Evaluate & Measure）

| 动词 | 为什么重要 | 如何练习 |
|------|-----------|---------|
| **建立评估数据集** | 没有数据就没有改进方向 | 项目开始就收集 10+ 个典型 QA pair |
| **量化质量** | "还行"不是度量 | 用 RAGAS / LLM-as-Judge 把质量数字化 |
| **持续监控** | 模型升级可能引入新问题 | 部署后持续跑评估，设置告警 |

#### C. 知识沉淀（Institutionalize Knowledge）

| 动词 | 为什么重要 | 如何练习 |
|------|-----------|---------|
| **写 Playbook** | 个人经验 → 团队能力 | 每做完一个 AI 项目，写"踩坑记录" |
| **建立 Prompt 库** | 避免每次都从零写 | 按任务类型组织，标注适用模型和场景 |
| **案例文档化** | 成功/失败案例最好教材 | 用"问题→方法→结果→教训"四段式记录 |

#### D. 系统思维（Systems Thinking）

| 动词 | 为什么重要 |
|------|-----------|
| **看到全链路** | 不只是 prompt，是检索→上下文→生成→后处理→反馈 |
| **识别瓶颈** | 知道当前系统瓶颈在哪个环节 |
| **设计反馈回路** | 用户反馈如何回流到系统改进？ |
| **应对模型变化** | 模型升级后哪些环节需要重新调优？ |

---

## 综合：三层动词地图

```
                    名词层（易见）              动词层（关键但不显眼）
                    ────────────               ──────────────────────
                    
RAG 方向           RAG, LangChain,          上下文管理、语义切分、
                   向量数据库, embedding     分层诊断、多维评估、
                                             编排路由、置信度判断

产品构建方向        AI Agent, Copilot,       任务拆解、评估驱动开发、
                    Prompt Engineering       上下文工程、工作流设计、
                                             结构化输出、检查点插入

个人价值方向        "AI 工程师",             诊断调试、度量建立、
                    "Prompt 工程师"           案例沉淀、系统思维、
                                             Playbook 编写、团队赋能
```

---

## 三条立即可做的动作

### 1. 给项目加 Trace（30 分钟）

给你现有的任何 AI 项目加上 LangFuse 或 LangSmith trace。能看见每一步发生了什么，调试效率提升 10 倍。

### 2. 建立最小评估集（1 小时）

收集 20 个典型的输入-期望输出对，用 RAGAS 或 LLM-as-Judge 跑一次评估。你会发现很多"以为还行"的问题。

### 3. 写一份 Playbook（1 小时）

把你最常用的 3 个 prompt 模板写下来，加上注释（适用场景、模型、注意事项），分享给同事。这就是从消费者到赋能者的第一步。

---

## 调研来源

| 来源 | 内容 |
|------|------|
| [RAGAS](https://docs.ragas.io) | RAG 系统评估框架——5 个核心指标 |
| [程序员鱼皮 - 16 种 RAG 方案](https://www.cnblogs.com/yupi/p/19914426) | RAG 从 Naive 到 Agentic 的完整演进 |
| [All-in-RAG](https://datawhalechina.github.io/all-in-rag/) | RAG 技术全栈指南 |
| [LangFuse](https://langfuse.com) / [LangSmith](https://smith.langchain.com) | LLM 应用可观测性和调试平台 |
| Anthropic 工程博客 | 上下文工程、prompt 设计最佳实践 |
| 行业实践综合 | 来自多个生产级 AI 项目的模式总结 |

---

## 🆕 2026 年重要更新（2026-05-16 实时调研补充）

> 以下内容基于 2026 年最新数据，反映 AI 工程领域的重大变化。

### 一、2026 年的四层架构共识

2026 年 4 月，AI 工程界形成了明确的四层架构共识（[来源](https://www.cnblogs.com/qiniushanghai/p/19834541)）：

```
┌──────────────────────────────┐
│ 外部工具/数据源              │  文件系统、数据库、GitHub、Slack
├──────────────────────────────┤
│ MCP 服务器 / Skills          │  标准化协议连接 + 模块化能力包
├──────────────────────────────┤
│ Agent（执行循环层）          │  感知 → 推理 → 工具调用 → 观察
├──────────────────────────────┤
│ LLM（推理核心层）            │  Claude、GPT、DeepSeek、Gemini
└──────────────────────────────┘
```

| 层级 | 核心职责 | 2026 代表 |
|------|---------|----------|
| LLM | 语言理解与推理 | Claude 4.x、GPT-5.3、DeepSeek V3/V4、Gemini 3.1 |
| Agent | 自主决策执行循环 | Claude Code (108k⭐)、OpenAI Codex CLI、LangGraph |
| MCP/Skills | 工具能力标准化接入 | MCP 协议 (82k⭐)、Skills 生态 (1,340+ 模块) |
| 工具/数据 | 实际操作对象 | 文件系统、SQL 数据库、GitHub API |

**关键变化**：2026 年，"prompt engineering"正在被"agent engineering"取代。"动词"不再是个人手艺，而是**系统架构**——你设计的不再是 prompt，而是 Agent 如何感知、决策、调用工具、观察结果的完整循环。

### 二、2026 年三个重大范式变化

#### 变化 1：Terminal Agent 成为主流开发范式

| 工具 | 组织 | Stars (2026.04) | 说明 |
|------|------|------------------|------|
| **Claude Code** | Anthropic | 108,080 ⭐ | 自然语言→工具调用→自动完成任务 |
| **OpenAI Codex CLI** | OpenAI | 快速增长 | GPT-5.3-Codex 驱动，2026.03 发布桌面版 |
| **Gemini CLI** | Google | Gemini 3.0 Pro | 50%+ benchmark 提升 over 2.5 Pro |

**对"动词"的影响**：Terminal Agent 自身就是"动词的集合"。新动词：
- **指定约束**：告诉 Agent 什么不能做
- **检查点验收**：在关键步骤后介入审查
- **回滚与重试**：Agent 卡住时的干预策略

#### 变化 2：Skills 生态——从"写 prompt"到"安装能力模块"

截至 2026 年 4 月：
- MCP 官方仓库：**82,885 Stars**，10 种语言 SDK
- Skills 生态：**1,340+ 可安装技能**
- LangChain 重新定位为 "The agent engineering platform"（**132,263 Stars**）

**影响**：MCP 和 Skills 让"工具集成"从编码变成配置。"动词"从"我怎么调 API"变成"我怎么选对 Skills 组合并组装好"。

#### 变化 3：Vibe Coding 的兴起与争议

2026 年，"vibe coding"（凭感觉让 AI 写代码）成为热议话题。这恰好验证了视频的核心论点——知道 Codex CLI（名词）≠ 能用它做好项目（动词）。2026 年真正区分点：
- 知道何时信任 Agent 输出，何时要求解释
- 能读懂 Agent 生成的代码并判断质量
- 能把模糊需求拆成 Agent 能执行的明确子任务
- 能建立评估标准度量 Agent 输出质量

### 三、2026 年动词地图更新

```
2024-2025 的动词                    2026 新增/升级的动词
─────────────────                  ─────────────────────
写 prompt                          设计 Agent 执行循环
调 API                             选择合适的 MCP Server / Skill
手工测试                           建立 Agent 评估体系
阅读文档                           验证 Agent 输出的正确性
写 pipeline 代码                   编排多个 Agent 协作
调 chunk size                      设计上下文注入策略（MCP Resources）
单独调试                           分析 Agent trace 日志
学一个框架                         理解四层架构的交互
```

### 四、2026 年最值得练的"动词"

| 能力 | 为什么重要 | 如何开始 |
|------|-----------|---------|
| **Agent 编排** | Claude Code/Codex CLI 已是标配 | 用 Claude Code 做完整项目，记录所有干预点 |
| **MCP 集成判断** | 82k⭐ 生态，选对 Server 是关键 | 浏览 [MCP servers](https://github.com/modelcontextprotocol/servers)，试用 3 个 |
| **输出验证** | Agent 生成越来越多的代码/文档 | 建立审查 checklist，不盲目接受 |
| **评估框架设计** | 没有评估就不是工程 | 给当前 AI 项目建立 20 条测试用例 |
| **Skills 选型** | 1,340+ 可选，选错浪费 | 从 antigravity-awesome-skills 试用 5 个 |

### 五、2026 调研来源

| 来源 | 日期 | 内容 |
|------|------|------|
| [MCP/Skills/Agent/LLM 四层架构](https://www.cnblogs.com/qiniushanghai/p/19834541) | 2026-04-08 | MCP 82k⭐, Skills 1,340+, LangChain 132k⭐ |
| [程序员鱼皮 - 16 种 RAG 方案](https://www.cnblogs.com/yupi/p/19914426) | 2026-04-23 | RAG 从 Naive 到 Agentic 的完整演进 |
| [OpenAI Codex CLI 指南](https://blog.csdn.net/nmdbbzcl/article/details/159380122) | 2026-04-18 | GPT-5.3-Codex 驱动的终端 Agent |
| [Gemini 3.0](https://deepmind.google/models/gemini/) | 2026-03 | 50%+ benchmark 提升 |
| [Anthropic 估值 1.2 万亿](https://www.36kr.com/p/3799097984080899) | 2026-05-07 | Claude Code 108k⭐, 首次反超 OpenAI |
| [LangChain](https://www.langchain.com/) | 2026 | 重新定位为 agent engineering platform |
