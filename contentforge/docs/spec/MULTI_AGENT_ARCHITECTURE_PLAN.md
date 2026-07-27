# ContentForge 多智能体架构规划

> 版本: 1.0  
> 日期: 2026-07-24  
> 状态: 规划草案  

---

## 一、现状分析

### 1.1 当前架构（三层 Agent 并存）

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js + Zustand)                                   │
│  ├─ agentStore.ts    → 硬编码 6 个 Agent + 意图路由（前端层）    │
│  ├─ chatStore.ts     → 会话/消息/流式状态管理                    │
│  └─ 当前 Agent 聊天 → 通过 Rust → 仅支持 Kimi CLI               │
├─────────────────────────────────────────────────────────────────┤
│  Rust Backend (Tauri)                                           │
│  ├─ commands/agent.rs → 硬编码 AgentRoleOut（与前端重复定义）    │
│  ├─ agent_cli.rs      → Kimi CLI 二进制检测                      │
│  ├─ agent_runner.rs   → spawn Kimi 子进程 + stream-json 解析   │
│  └─ commands/ai.rs    → agent_chat_send（仅支持 agent_id="kimi"）│
├─────────────────────────────────────────────────────────────────┤
│  Python Core                                                    │
│  ├─ ai/agent.py       → 轻量 AgentRegistry + 意图路由           │
│  ├─ ai/agent_registry.py → SQLite 持久化 + SkillRegistry        │
│  ├─ ai/agent_router.py → LLM 路由 + 协作编排                    │
│  └─ ai/agent_session.py → ReAct 循环执行                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心问题

| # | 问题 | 影响 | 层级 |
|---|------|------|------|
| 1 | **Agent 定义重复** — 前端/ Rust / Python 各有一套硬编码 Agent | 维护困难，三方不一致 | 全栈 |
| 2 | **Agent 聊天仅限 Kimi CLI** — `agent_chat_send` 硬编码 `agent_id != "kimi"` 拒绝 | 无法接入其他 AI | Rust |
| 3 | **Rust 与 Python Agent 系统割裂** — Python 的 AgentRouter/Registry 未被 Rust 调用 | 功能冗余，能力浪费 | 跨层 |
| 4 | **前端意图路由与后端重复** — 前端 `agentStore.routeByIntent()` 和 Python `AgentRouter.route()` 逻辑重复 | 行为不一致 | 前后端 |
| 5 | **无统一 Agent Provider 抽象** — 无法动态接入新 Agent 平台 | 扩展性差 | 架构 |
| 6 | **Skill 系统未贯通** — Python SkillRegistry 已存在，但 Rust/前端均未调用 | 功能悬空 | 跨层 |
| 7 | **Agent 间无法协作** — 各 Agent 独立运行，无上下文共享 | 无法处理复杂任务 | 功能 |

---

## 二、目标架构：统一多智能体平台

### 2.1 架构愿景

```
                         ┌──────────────┐
                         │   用户界面    │
                         └──────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │    Agent Gateway      │  ← 统一入口
                    │  (Rust / Tauri)       │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────┴────┐            ┌────┴────┐            ┌────┴────┐
   │ 内置Agent│            │ 外部Agent│            │ 插件Agent│
   │ Provider│            │ Provider│            │ Provider│
   └────┬────┘            └────┬────┘            └────┬────┘
        │                       │                       │
   ┌────┴───────────────────────┴───────────────────────┴────┐
   │              Agent Orchestrator (Python)               │
   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
   │  │   Router    │  │  Registry   │  │  Session    │   │
   │  │  意图路由    │  │  注册发现    │  │  执行会话    │   │
   │  └─────────────┘  └─────────────┘  └─────────────┘   │
   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
   │  │   Planner   │  │   Memory    │  │  Skill Exec │   │
   │  │  协作规划    │  │  共享记忆    │  │  技能执行    │   │
   │  └─────────────┘  └─────────────┘  └─────────────┘   │
   └────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │    LLM Providers      │
                    │  Kimi / OpenAI / etc  │
                    └───────────────────────┘
```

### 2.2 设计原则

1. **Single Source of Truth** — Agent 定义、状态、记忆以 Python 层为唯一权威来源
2. **Provider 模式** — Agent 后端可插拔（Kimi CLI、OpenAI API、Claude、Ollama、本地模型等）
3. **Rust 为 Gateway** — Tauri 层作为统一的 IPC Gateway，负责认证、限流、事件转发
4. **前端只关心展示** — 前端不执行路由决策，仅展示后端返回的 Agent/消息/事件
5. **渐进式迁移** — 现有功能不中断，新能力逐步叠加

---

## 三、核心模块设计

### 3.1 Agent Provider 抽象层

统一接口，支持任意 Agent 后端：

```rust
// src/agent_providers/mod.rs
pub trait AgentProvider: Send + Sync {
    /// Provider 唯一标识
    fn id(&self) -> &str;
    
    /// Provider 显示名称
    fn name(&self) -> &str;
    
    /// 检测是否可用
    fn is_available(&self) -> bool;
    
    /// 列出该 Provider 支持的所有 Agent
    fn list_agents(&self) -> Vec<AgentConfig>;
    
    /// 发送消息并接收流式响应
    fn chat(
        &self,
        agent_id: &str,
        session_id: &str,
        messages: Vec<ChatMessage>,
        context: ChatContext,
    ) -> Result<mpsc::Receiver<StreamEvent>, AgentError>;
    
    /// 中断当前会话
    fn cancel(&self, session_id: &str) -> Result<(), AgentError>;
}

/// 支持的 Provider 类型
pub enum ProviderType {
    KimiCli,        // Kimi CLI 子进程
    OpenAiApi,      // OpenAI 兼容 API
    ClaudeApi,      // Anthropic Claude API
    Ollama,         // Ollama 本地模型
    PythonBridge,   // Python AgentSession (ReAct)
    Custom,         // 用户自定义 Provider
}
```

#### 3.1.1 内置 Provider 实现

| Provider | 实现位置 | 说明 |
|----------|----------|------|
| `KimiCliProvider` | `src/agent_providers/kimi_cli.rs` | 封装现有 `agent_cli.rs` + `agent_runner.rs` |
| `PythonBridgeProvider` | `src/agent_providers/python_bridge.rs` | 调用 Python `AgentSession` 执行 ReAct |
| `OpenAiProvider` | `src/agent_providers/openai.rs` | HTTP API 调用，支持流式 SSE |
| `OllamaProvider` | `src/agent_providers/ollama.rs` | 本地 Ollama 服务 |

#### 3.1.2 Provider 注册与发现

```rust
// src/agent_providers/registry.rs
pub struct ProviderRegistry {
    providers: HashMap<String, Box<dyn AgentProvider>>,
}

impl ProviderRegistry {
    pub fn discover() -> Self {
        let mut registry = Self::default();
        // 自动检测可用 Provider
        registry.try_register(KimiCliProvider::new());
        registry.try_register(PythonBridgeProvider::new());
        registry.try_register(OpenAiProvider::from_env());
        registry.try_register(OllamaProvider::from_env());
        registry
    }
}
```

---

### 3.2 Agent Gateway（Rust 层重构）

替换现有的硬编码 Agent 系统：

#### 3.2.1 新 Commands 接口

```rust
// commands/agent.rs（重构后）

#[tauri::command]
pub async fn get_agents(
    provider_registry: State<'_, ProviderRegistry>,
) -> Result<ApiResponse<Vec<AgentInfo>>, String> {
    // 从所有 Provider 聚合 Agent 列表
    let mut agents = vec![];
    for provider in provider_registry.list_available() {
        agents.extend(provider.list_agents());
    }
    Ok(ApiResponse::ok(agents))
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    provider_registry: State<'_, ProviderRegistry>,
    session_manager: State<'_, SessionManager>,
    request: ChatSendRequest,
) -> Result<ApiResponse<ChatSendResponse>, String> {
    // 1. 通过 Python Bridge 进行意图路由
    let route = python_bridge::route_intent(&request.message).await?;
    
    // 2. 获取目标 Agent 的 Provider
    let provider = provider_registry
        .get(&route.provider_id)
        .ok_or("Provider not found")?;
    
    // 3. 启动流式会话
    let rx = provider.chat(
        &route.agent_id,
        &request.session_id,
        build_message_history(&request.session_id).await?,
        build_context(&request.selected_asset_ids).await?,
    )?;
    
    // 4. 转发流式事件到前端
    tokio::spawn(forward_stream_events(app, request.session_id, rx));
    
    Ok(ApiResponse::ok(ChatSendResponse { /* ... */ }))
}

#[tauri::command]
pub async fn get_providers(
    registry: State<'_, ProviderRegistry>,
) -> Result<ApiResponse<Vec<ProviderInfo>>, String> {
    Ok(ApiResponse::ok(registry.list_all()))
}
```

#### 3.2.2 Session Manager

```rust
// src/session_manager.rs
pub struct SessionManager {
    /// 活跃会话
    active_sessions: Arc<RwLock<HashMap<String, SessionHandle>>>,
    /// 会话历史持久化
    db: Database,
}

pub struct SessionHandle {
    pub session_id: String,
    pub provider_id: String,
    pub agent_id: String,
    pub cancel_tx: mpsc::Sender<()>,
    pub event_rx: mpsc::Receiver<StreamEvent>,
}

impl SessionManager {
    /// 创建新会话
    pub async fn create_session(
        &self,
        agent_id: &str,
        provider_id: &str,
    ) -> Result<String, SessionError>;
    
    /// 发送消息到会话
    pub async fn send_message(
        &self,
        session_id: &str,
        content: &str,
        asset_context: Vec<AssetContext>,
    ) -> Result<mpsc::Receiver<StreamEvent>, SessionError>;
    
    /// 取消会话
    pub async fn cancel_session(&self, session_id: &str) -> Result<(), SessionError>;
    
    /// 获取会话历史
    pub async fn get_history(&self, session_id: &str) -> Result<Vec<ChatMessage>, SessionError>;
}
```

---

### 3.3 Python Orchestrator 增强

现有 `ai/agent_router.py` 和 `ai/agent_registry.py` 已具备良好基础，需增强：

#### 3.3.1 Agent 能力注册表扩展

```python
# contentforge/ai/agent_registry.py（增强）

class AgentRegistry:
    """Agent 注册中心 — 统一权威来源"""
    
    def register_provider_agent(
        self,
        provider_id: str,        # "kimi", "openai", "python"
        agent_id: str,           # "general", "content_analyst"
        config: AgentDefinition,
    ) -> None:
        """注册来自外部 Provider 的 Agent"""
        
    def get_agent_with_provider(self, agent_id: str) -> Optional[Tuple[str, AgentDefinition]]:
        """返回 (provider_id, agent_definition)"""
        
    def list_by_provider(self, provider_id: str) -> List[AgentDefinition]:
        """按 Provider 列出 Agent"""
```

#### 3.3.2 跨 Agent 协作执行器

```python
# contentforge/ai/collaboration.py（新增）

class CollaborationExecutor:
    """多 Agent 协作执行器"""
    
    def execute_plan(
        self,
        plan: CollaborationPlan,
        shared_context: SharedContext,
        event_callback: Callable[[CollaborationEvent], None],
    ) -> CollaborationResult:
        """
        执行协作计划，支持：
        - 顺序执行（depends_on 链）
        - 并行执行（无依赖的步骤）
        - 上下文注入（前序步骤输出注入后续步骤）
        - 错误回退（某步骤失败时的策略）
        """
        
class SharedContext:
    """跨 Agent 共享上下文"""
    
    def __init__(self):
        self.variables: Dict[str, Any] = {}      # 变量表
        self.memories: List[MemoryEntry] = []     # 记忆片段
        self.assets: List[AssetContext] = []      # 关联资产
        self.session_history: List[Message] = []  # 对话历史
```

#### 3.3.3 意图路由增强

```python
# contentforge/ai/agent_router.py（增强）

class AgentRouter:
    def __init__(self, ...):
        # 现有能力...
        self.provider_registry: ProviderRegistry  # 新增
        
    def route(self, user_message: str, context: Dict) -> RouteResult:
        """
        增强路由逻辑：
        1. 快速模式匹配（关键词/正则）
        2. 显式 Agent 提及（@AgentName）
        3. **Provider 偏好匹配**（根据用户配置的默认 Provider）
        4. LLM 推理路由（复杂意图）
        5. **多 Agent 协作检测**（任务是否需要多个 Agent）
        """
```

---

### 3.4 前端适配

#### 3.4.1 AgentStore 重构

```typescript
// store/agentStore.ts（重构后）

interface AgentStoreState {
  // 不再硬编码 Agent，从后端动态加载
  agents: AgentInfo[];
  providers: ProviderInfo[];
  
  // 当前选中的 Agent 和 Provider
  currentAgentId: string | null;
  currentProviderId: string | null;
  
  // Provider 可用性状态
  providerStatus: Map<string, ProviderStatus>;
  
  // ... 其他状态
}

interface AgentStoreActions {
  // 从后端加载所有 Agent（跨 Provider 聚合）
  loadAgents: () => Promise<void>;
  
  // 加载 Provider 列表
  loadProviders: () => Promise<void>;
  
  // 检测 Provider 可用性
  checkProviderStatus: (providerId: string) => Promise<void>;
  
  // 切换 Agent（自动选择 Provider）
  switchAgent: (agentId: string, reason?: string) => Promise<void>;
  
  // 意图路由（调用后端，不再前端本地路由）
  routeByIntent: (message: string) => Promise<RouteResult>;
  
  // ... 其他 Actions
}
```

#### 3.4.2 Provider 配置 UI

新增 Settings 页面选项：

```typescript
// app/settings/agent-providers/page.tsx（新增）

interface ProviderConfig {
  id: string;
  name: string;
  type: 'kimi_cli' | 'openai_api' | 'claude_api' | 'ollama' | 'custom';
  enabled: boolean;
  config: Record<string, string>;  // API key, base URL, model, etc.
  priority: number;  // 优先级（影响自动选择）
}
```

---

## 四、数据流重构

### 4.1 当前数据流（问题）

```
用户输入 → 前端 routeByIntent() → 前端判断 Agent → chat_send() → Rust 硬编码 Kimi
                                         ↓
                                    Python AgentRouter（未被调用）
```

### 4.2 目标数据流

```
用户输入 → chat_send() → Rust Agent Gateway 
                              ↓
                    Python AgentRouter.route()
                              ↓
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
         单 Agent        多 Agent 协作      直接 Skill
              ↓               ↓               ↓
         Provider.chat()  Collaboration    SkillExecutor
              ↓               ↓               ↓
         流式事件 ←────── 流式事件 ─────→ 流式事件
              ↓               ↓               ↓
         前端展示 ←────── 前端展示 ─────→ 前端展示
```

---

## 五、实施路线图

### Phase 1: Provider 抽象层（2-3 周）

**目标**: 建立 Agent Provider 统一接口，支持多后端

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `src/agent_providers/mod.rs` | 定义 `AgentProvider` trait |
| 1.2 | `src/agent_providers/kimi_cli.rs` | 将现有 `agent_cli.rs` + `agent_runner.rs` 封装为 Provider |
| 1.3 | `src/agent_providers/python_bridge.rs` | 新增 Provider，调用 Python AgentSession |
| 1.4 | `src/agent_providers/openai.rs` | 新增 OpenAI API Provider |
| 1.5 | `src/agent_providers/registry.rs` | Provider 注册与自动发现 |
| 1.6 | `src/session_manager.rs` | 会话生命周期管理 |
| 1.7 | 修改 `commands/ai.rs` | `agent_chat_send` 支持任意 Provider |
| 1.8 | 修改 `commands/agent.rs` | `get_agents` 从 Provider 聚合 |

**验收标准**:
- `get_providers` 返回所有可用 Provider
- `agent_chat_send` 可通过参数指定 Provider
- Kimi CLI 聊天功能不中断

### Phase 2: Python Orchestrator 整合（2 周）

**目标**: 让 Rust Gateway 调用 Python AgentRouter 进行意图路由

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `core/python/contentforge/ai/gateway_bridge.py` | 新增：供 Rust 调用的路由桥接模块 |
| 2.2 | `src/agent_providers/python_bridge.rs` | 实现 `route_intent()` 调用 Python |
| 2.3 | 增强 `ai/agent_router.py` | 支持 Provider 偏好路由 |
| 2.4 | 增强 `ai/agent_registry.py` | 支持 Provider 关联的 Agent 注册 |
| 2.5 | `db/` 新增表 | `agent_providers`, `agent_sessions` |

**验收标准**:
- Rust Gateway 调用 Python Router 进行意图识别
- 路由结果包含目标 Provider + Agent
- 前端 `routeByIntent` 改为调用后端

### Phase 3: 前端重构（2 周）

**目标**: 前端 AgentStore 从静态定义改为动态加载

| 任务 | 文件 | 说明 |
|------|------|------|
| 3.1 | `store/agentStore.ts` | 重构：从后端加载 Agent/Provider |
| 3.2 | `types/agent.ts` | 扩展类型定义（含 Provider 信息） |
| 3.3 | `app/settings/agent-providers/` | 新增 Provider 配置页面 |
| 3.4 | `components/agent/` | 新增 Provider 选择器、Agent 卡片 |
| 3.5 | 删除前端硬编码 | `DEFAULT_AGENTS`, `INTENT_PATTERNS` |

**验收标准**:
- 前端 Agent 列表与后端完全一致
- 新增 Provider 后前端自动显示对应 Agent
- Provider 配置页面可启用/禁用/配置 Provider

### Phase 4: 多 Agent 协作（3 周）

**目标**: 支持复杂任务的自动分解和多 Agent 协作

| 任务 | 文件 | 说明 |
|------|------|------|
| 4.1 | `core/python/contentforge/ai/collaboration.py` | 新增协作执行器 |
| 4.2 | 增强 `ai/agent_router.py` | `auto_collaborate()` 生产级化 |
| 4.3 | `src/session_manager.rs` | 支持协作计划执行 |
| 4.4 | 前端新增协作 UI | 协作进度展示、步骤卡片 |
| 4.5 | `db/` 新增表 | `collaboration_plans`, `collaboration_steps` |

**验收标准**:
- "分析这个视频然后改写成小红书风格" 自动触发协作
- 前端实时显示协作步骤进度
- 协作结果汇总展示

### Phase 5: Skill 系统贯通（2 周）

**目标**: Skill 系统跨层贯通

| 任务 | 文件 | 说明 |
|------|------|------|
| 5.1 | `core/python/contentforge/ai/skill_bridge.py` | Skill → Rust 调用桥接 |
| 5.2 | `src/commands/skill.rs` | 新增 Skill 执行命令 |
| 5.3 | `store/agentStore.ts` | `executeSkill` 调用后端 |
| 5.4 | Skill 加载目录 | 支持 `.agents/skills/` 热加载 |

---

## 六、数据库 Schema 扩展

### 6.1 新增表

```sql
-- Agent Provider 配置表
CREATE TABLE agent_providers (
    id TEXT PRIMARY KEY,           -- "kimi", "openai", "ollama"
    name TEXT NOT NULL,            -- 显示名称
    provider_type TEXT NOT NULL,   -- "kimi_cli", "openai_api", "ollama"
    enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0,    -- 自动选择优先级
    config TEXT,                   -- JSON 配置
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent 定义表（替代硬编码）
CREATE TABLE agent_definitions (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    capabilities TEXT,             -- JSON ["analyze", "summarize"]
    tools TEXT,                    -- JSON ["search_assets"]
    model TEXT,
    temperature REAL,
    max_tokens INTEGER,
    icon TEXT,
    color TEXT,
    auto_switch INTEGER DEFAULT 0,
    requires_context INTEGER DEFAULT 1,
    "order" INTEGER DEFAULT 0,
    FOREIGN KEY (provider_id) REFERENCES agent_providers(id)
);

-- Agent 会话表
CREATE TABLE agent_sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',  -- active | paused | completed
    context_variables TEXT,        -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 协作计划表
CREATE TABLE collaboration_plans (
    id TEXT PRIMARY KEY,
    description TEXT,
    status TEXT DEFAULT 'pending', -- pending | running | completed | failed
    session_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- 协作步骤表
CREATE TABLE collaboration_steps (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    step_index INTEGER,
    agent_id TEXT NOT NULL,
    task TEXT,
    depends_on TEXT,               -- JSON [step_index]
    status TEXT DEFAULT 'pending', -- pending | running | completed | failed
    output TEXT,
    error TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES collaboration_plans(id)
);
```

---

## 七、关键决策记录

### ADR-001: 为什么 Provider 抽象放在 Rust 层而不是 Python 层？

**决策**: Agent Provider 的抽象和注册放在 Rust (Tauri) 层，但路由决策委托给 Python。

**理由**:
1. Rust 层是 Tauri 的 IPC Gateway，所有前端调用必须经过这里
2. Provider 需要访问系统资源（进程 spawn、文件系统），Rust 更擅长
3. Python 层专注高阶逻辑（路由、规划、协作），不处理底层 I/O
4. 保持 Python 层的可替换性（未来可能用其他语言重写 AI 核心）

### ADR-002: 为什么意图路由放在 Python 层？

**决策**: 意图路由和 Agent 编排逻辑保留在 Python 层。

**理由**:
1. Python 已有完整的 `AgentRouter` 实现（LLM 调用、模式匹配、协作规划）
2. Python 的 AI 生态更丰富（langchain 等可作为备选）
3. 路由逻辑与 Agent 定义紧密耦合，放在同一层更内聚
4. Rust 层作为 Thin Gateway，负责协议转换和事件转发

### ADR-003: Agent 定义的唯一权威来源

**决策**: Agent 定义的权威来源是运行时聚合（Provider 注册 + 数据库），而非静态代码。

**理由**:
1. 不同 Provider 可能有同名但不同能力的 Agent
2. 用户可能自定义 Agent
3. 需要支持动态启用/禁用
4. 前端不再维护 Agent 定义副本

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Kimi CLI 接口变更 | 高 | Provider 封装隔离，接口变更只需改 `kimi_cli.rs` |
| Python Bridge 性能瓶颈 | 中 | 异步调用 + 流式传输，关键路径用 Rust 直接实现 |
| 多 Provider 配置冲突 | 中 | 优先级系统 + 显式选择 UI |
| 前端状态同步复杂 | 中 | Zustand 订阅模式 + WebSocket 实时推送 |
| 向后兼容性 | 高 | Phase 1-3 保持现有接口可用，Phase 4 后逐步废弃 |

---

## 九、附录：术语表

| 术语 | 定义 |
|------|------|
| **Agent Provider** | Agent 后端实现，如 Kimi CLI、OpenAI API、Python ReAct |
| **Agent Gateway** | Rust Tauri 层的统一入口，负责 Provider 调度 |
| **Agent Orchestrator** | Python 层的编排器，负责路由、规划、协作 |
| **Collaboration Plan** | 多 Agent 协作的执行计划，包含步骤和依赖 |
| **Shared Context** | 跨 Agent 共享的上下文（变量、记忆、资产） |
| **Stream Event** | 流式事件（token、tool_call、error、done） |
| **ReAct** | Reasoning + Acting 模式，Agent 的思考-行动循环 |

---

*本文档作为多智能体架构的长期规划，各 Phase 可独立实施，按需启动。*
