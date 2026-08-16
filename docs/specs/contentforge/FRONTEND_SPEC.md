# ContentForge Frontend 模块 SPEC

> 版本: 0.1.0  
> 模块路径: `desktop/src/`  
> 语言: TypeScript 5.x  
> 框架: Next.js 15 + React 19 + Tailwind CSS 4

---

## 1. 模块定位

Frontend 是 ContentForge Desktop 的 UI 层，基于 Next.js App Router 构建，通过 Tauri IPC 或 HTTP API 与 Rust/Python 后端通信。采用 Zustand 进行状态管理，支持 Chat 对话、Agent 路由、资产管理、下载管理等核心功能。

### 1.1 设计原则

- **同构渲染**: 同一代码库支持 Tauri Desktop 和 Web 部署
- **API 抽象**: `api-client.ts` 统一封装 IPC/HTTP/WebSocket
- **Store 分离**: chatStore / agentStore / assetStore / downloadStore 职责清晰
- **乐观更新**: UI 先行更新，失败时回滚
- **流式响应**: WebSocket/Tauri Event 驱动实时 UI 更新

---

## 2. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 15.x | React 框架、App Router |
| React | 19.x | UI 库 |
| TypeScript | 5.x | 类型系统 |
| Tailwind CSS | 4.x | 原子化 CSS |
| Zustand | 5.x | 状态管理 |
| Tauri API | 2.x | 桌面端 IPC |
| Lucide React | 0.46 | 图标库 |

---

## 3. 项目结构

```
desktop/src/
├── app/                        # Next.js App Router 页面
│   ├── page.tsx                # 首页 / 仪表盘
│   ├── layout.tsx              # 根布局
│   ├── globals.css             # 全局样式
│   ├── settings/               # 设置页面
│   │   └── page.tsx
│   ├── download/               # 下载管理页面
│   │   └── page.tsx
│   ├── ingestion/              # 内容采集页面
│   ├── processing/             # 内容处理页面
│   ├── publishing/             # 发布页面
│   └── workflows/              # 流水线页面
│
├── components/                 # React 组件
│   ├── layout/                 # 布局组件
│   │   ├── app-shell.tsx       # 应用外壳
│   │   ├── app-sidebar.tsx     # 侧边栏导航
│   │   └── app-header.tsx      # 顶部栏
│   ├── download/               # 下载相关组件
│   │   ├── download-form.tsx   # 下载表单
│   │   └── download-list.tsx   # 下载列表
│   ├── forms/                  # 通用表单组件
│   └── ui/                     # 基础 UI 组件
│
├── store/                      # Zustand Stores
│   ├── chatStore.ts            # 聊天状态管理
│   ├── agentStore.ts           # Agent 状态管理
│   ├── assetStore.ts           # 资产状态管理
│   └── downloadStore.ts        # 下载状态管理
│
├── lib/                        # 工具库
│   ├── api-client.ts           # API 抽象层（IPC/HTTP/WebSocket）
│   ├── ws-client.ts            # WebSocket 客户端
│   ├── navigation.ts           # 导航配置
│   └── utils.ts                # 工具函数
│
├── types/                      # TypeScript 类型定义
│   ├── chat.ts                 # 聊天相关类型
│   ├── agent.ts                # Agent 相关类型
│   ├── asset.ts                # 资产相关类型
│   └── download.ts             # 下载相关类型
│
└── i18n/                       # 国际化（预留）
```

---

## 4. API 抽象层（api-client.ts）

### 4.1 环境检测

```typescript
function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI__;
}
```

### 4.2 核心 API

```typescript
// 统一调用（Desktop: Tauri IPC / Web: HTTP POST）
export async function apiInvoke<T>(command: string, args?: unknown): Promise<T>

// 统一事件监听（Desktop: Tauri Event / Web: WebSocket）
export function apiListen(event: string, handler: (payload: unknown) => void): () => void

// 错误类
export class ApiError extends Error {
  statusCode: number;
  data: unknown;
}
```

### 4.3 HTTP 模式

```typescript
async function httpRequest<T>(command: string, args?: unknown): Promise<T>
```

- 基础 URL: `http://localhost:3000/api/{command}`
- 超时: 30s
- 重试: 2 次，指数退避
- 请求方法: POST
- Content-Type: `application/json`

### 4.4 WebSocket 客户端

```typescript
class WebSocketClient {
  constructor(url: string = "ws://localhost:3000/ws")
  
  connect(): void
  disconnect(): void
  subscribe(event: string, handler: (payload) => void): () => void
  send(type: string, payload: unknown): void
  
  get isConnected(): boolean
}
```

特性:
- 自动重连（最多 5 次，指数退避）
- 事件订阅/取消订阅
- 连接状态广播 (`ws.connected` / `ws.error`)

### 4.5 Store 注入

```typescript
export function initApiClients(): void {
  setChatApiClient(apiInvoke, apiListen);
  setAgentApiClient(apiInvoke);
  setAssetApiClient(apiInvoke);
  setDownloadApiClient(apiInvoke, apiListen);
}
```

---

## 5. Chat Store（chatStore.ts）

### 5.1 状态定义

```typescript
interface ChatState {
  sessions: ChatSession[];                    // 会话列表
  currentSessionId: string | null;            // 当前会话 ID
  messagesBySession: Map<string, ChatMessage[]>;  // 消息缓存
  toolCallsByMessage: Map<string, ToolCall[]>;    // 工具调用缓存
  isSending: boolean;                         // 发送中
  isStreaming: boolean;                       // 流式响应中
  streamingMessageId: string | null;          // 当前流式消息 ID
  error: string | null;                       // 错误信息
  wsConnected: boolean;                       // WebSocket 连接状态
  isLoadingSessions: boolean;                 // 加载会话中
  isLoadingHistory: boolean;                  // 加载历史中
  hasMoreHistory: boolean;                    // 是否还有更多历史
}
```

### 5.2 会话管理 Actions

| Action | 说明 | 乐观更新 |
|--------|------|----------|
| `loadSessions()` | 加载会话列表 | 否 |
| `createSession(agentId, title?)` | 创建新会话 | 是（失败回滚） |
| `switchSession(sessionId)` | 切换当前会话 | 是 |
| `archiveSession(sessionId)` | 归档会话 | 是（失败恢复） |
| `pinSession(sessionId)` | 置顶/取消置顶 | 是 |
| `updateSessionTitle(sessionId, title)` | 更新标题 | 是 |
| `deleteSession(sessionId)` | 删除会话 | 是（失败回滚） |

### 5.3 消息操作 Actions

| Action | 说明 | 乐观更新 |
|--------|------|----------|
| `sendMessage(text, options?)` | 发送消息 | 是（先添加用户消息 + 占位助手消息） |
| `cancelStream()` | 取消流式响应 | 是 |
| `retryMessage(messageId)` | 重试失败消息 | 是 |
| `deleteMessage(messageId)` | 删除消息 | 是 |

### 5.4 流式响应处理

```typescript
handleStreamChunk(chunk: StreamChunk): void
handleStreamDone(messageId: string): void
handleStreamError(messageId: string, error: string): void
```

**StreamChunk 类型:**

```typescript
type StreamChunk =
  | { type: "text"; messageId: string; text: string }
  | { type: "tool_call"; messageId: string; toolCall: ToolCall }
  | { type: "tool_result"; messageId: string; toolResult: ToolResult }
  | { type: "error"; messageId: string; error?: string }
  | { type: "done"; messageId: string };
```

### 5.5 工具调用处理

```typescript
handleToolCallStart(payload: ToolCallStartPayload): void
handleToolCallProgress(payload: ToolCallProgressPayload): void
handleToolCallCompleted(payload: ToolCallCompletedPayload): void
handleToolCallFailed(messageId, callId, error): void
```

**工具调用状态机:**

```
pending → running → completed
                ↘→ failed
```

### 5.6 Selector Hooks

```typescript
export function useCurrentMessages(): ChatMessage[]
export function useCurrentSession(): ChatSession | null
export function useStreamingMessage(): ChatMessage | null
export function useCurrentToolCalls(): ToolCall[]
```

---

## 6. Agent Store（agentStore.ts）

### 6.1 状态定义

```typescript
interface AgentStoreState extends AgentState {
  agents: AgentRole[];                        // Agent 注册表
  switchHistory: AgentSwitchRecord[];         // 切换历史
  quickActions: AgentQuickAction[];           // 快捷操作
  skills: SkillDefinition[];                  // Skill 注册表
  isLoadingAgents: boolean;
  isLoadingSkills: boolean;
  error: string | null;
  routeCache: Map<string, string>;            // 意图 → Agent ID 缓存
}
```

### 6.2 内置 Agent 配置

| ID | 名称 | 能力 | 模型 | 自动切换 |
|----|------|------|------|----------|
| `general` | 通用助手 | general, search | gpt-4o-mini | 否 |
| `content_analyst` | 内容分析师 | analyze, search | gpt-4o | 是 |
| `summarizer` | 摘要专家 | summarize, search | gpt-4o-mini | 是 |
| `rewriter` | 改写专家 | rewrite, translate, search | gpt-4o | 是 |
| `publisher` | 发布助手 | publish, search | gpt-4o-mini | 是 |
| `pipeline_runner` | 流水线执行器 | pipeline, search | gpt-4o-mini | 是 |

### 6.3 Agent 配置字段

```typescript
interface AgentRole {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: AgentCapability[];
  tools: string[];                    // 可用工具列表
  model: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  icon: string;                       // Lucide 图标名
  color: string;                      // 主题色
  autoSwitch: boolean;                // 是否支持自动切换
  streaming: boolean;                 // 是否支持流式
  requiresContext: boolean;           // 是否需要资产上下文
  order: number;                      // 排序权重
}
```

### 6.4 意图路由

```typescript
routeByIntent(message: string, selectedAssetIds?: string[]): string
```

路由逻辑:
1. **缓存检查** — 命中直接返回
2. **显式提及检查** — 如 "分析师" → content_analyst
3. **Capability 得分计算** — 正则匹配所有意图模式
4. **选择最高分 Agent** — 找到支持该 capability 的 Agent
5. **回退** — 无明确意图时返回当前 Agent

**意图模式示例:**

| Capability | 匹配模式 |
|-----------|----------|
| analyze | `/分析.*内容/i`, `/提取.*要点/i`, `/analyze/i` |
| summarize | `/总结/i`, `/摘要/i`, `/summarize/i`, `/tl;dr/i` |
| rewrite | `/改写/i`, `/重写/i`, `/润色/i`, `/rewrite/i` |
| translate | `/翻译/i`, `/translate/i`, `/转成.*文/i` |
| publish | `/发布/i`, `/导出/i`, `/小红书/i`, `/publish/i` |
| pipeline | `/运行.*流水线/i`, `/pipeline/i`, `/batch.*process/i` |
| search | `/搜索/i`, `/查找/i`, `/search/i`, `/find/i` |

### 6.5 Agent Actions

| Action | 说明 |
|--------|------|
| `loadAgents()` | 加载 Agent 列表（合并默认 + 远程） |
| `registerAgent(agent)` | 注册新 Agent |
| `unregisterAgent(agentId)` | 注销 Agent |
| `setCurrentAgentId(agentId, reason?)` | 设置当前 Agent |
| `switchAgent(agentId, triggeredBy, reason?)` | 切换 Agent（通知后端） |
| `routeByIntent(message)` | 基于意图路由 |
| `loadQuickActions()` | 加载快捷操作 |
| `executeQuickAction(actionId, params?)` | 执行快捷操作 |
| `loadSkills()` | 加载 Skill 列表 |
| `registerSkill(skill)` | 注册 Skill |
| `executeSkill(skillId, params)` | 执行 Skill |

### 6.6 Selector Hooks

```typescript
export function useCurrentAgent(): AgentRole | undefined
export function useSortedAgents(): AgentRole[]
export function useCurrentAgentQuickActions(): AgentQuickAction[]
export function useCurrentAgentSkills(): SkillDefinition[]
```

---

## 7. 类型定义

### 7.1 Chat 类型（types/chat.ts）

```typescript
interface ChatSession {
  id: string;
  title: string;
  agentId: string;
  status: "active" | "archived" | "pinned";
  linkedTaskId?: string;
  linkedAssetIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;    // ISO 8601
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  selectedAssetIds?: string[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  model?: string;
  tokensUsed?: Record<string, number>;
  error?: string;
  delta?: string;       // 当前增量文本
  createdAt: string;
  updatedAt: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

interface ToolResult {
  callId: string;
  name: string;
  output: unknown;
  error?: string;
  durationMs?: number;
}

interface SendMessageOptions {
  agentId?: string;
  selectedAssetIds?: string[];
  attachments?: Attachment[];
  streaming?: boolean;
}
```

### 7.2 Agent 类型（types/agent.ts）

```typescript
type AgentCapability = 
  | "general" 
  | "analyze" 
  | "summarize" 
  | "rewrite" 
  | "translate" 
  | "publish" 
  | "pipeline" 
  | "search";

interface AgentState {
  currentAgentId: string;
  previousAgentId?: string;
  switchReason?: string;
  isSwitching: boolean;
}

interface AgentSwitchRecord {
  id: string;
  sessionId: string;
  fromAgentId: string;
  toAgentId: string;
  reason?: string;
  triggeredBy: "user" | "auto" | "tool";
  timestamp: string;
}

interface AgentQuickAction {
  id: string;
  agentId: string;
  label: string;
  description: string;
  promptTemplate: string;
  icon: string;
}

interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  agentId?: string;
  triggers: string[];
  parameters: SkillParameter[];
}

interface SkillExecutionResult {
  skillId: string;
  status: "success" | "failed";
  output: unknown;
  error?: string;
  durationMs: number;
}
```

### 7.3 Asset 类型（types/asset.ts）

```typescript
interface ContentAsset {
  id: string;
  title: string;
  assetType: "video" | "article" | "tweet" | "thread" | "audio" | "image" | "note";
  status: "ingested" | "processing" | "processed" | "editing" | "ready" | "published" | "failed";
  platform?: string;
  url?: string;
  filePath?: string;
  thumbnailUrl?: string;
  description?: string;
  extractedText?: string;
  summary?: string;
  transcript?: string;
  translatedText?: string;
  rewrittenText?: string;
  durationSec?: number;
  analysis?: Record<string, unknown>;
  tags: string[];
  pipelineId?: string;
  author?: string;
  publishedAt?: string;
  engagement?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}
```

### 7.4 Download 类型（types/download.ts）

```typescript
interface DownloadRecord {
  id: string;
  url: string;
  title?: string;
  status: "pending" | "downloading" | "completed" | "failed" | "cancelled";
  progress: number;           // 0.0 - 100.0
  speed?: string;
  eta?: string;
  outputDir?: string;
  filename?: string;
  subtitles: string[];
  error?: string;
  queuePosition: number;
  options?: DownloadOptions;
  createdAt: string;
  updatedAt: string;
}

interface DownloadOptions {
  url: string;
  isPlaylist?: boolean;
  quality?: string;
  format?: string;
  outputDir?: string;
  subLangs?: string[];
  writeSubs?: boolean;
  writeAutoSubs?: boolean;
  startTime?: string;
  endTime?: string;
}
```

---

## 8. 组件体系

### 8.1 布局组件

| 组件 | 路径 | 职责 |
|------|------|------|
| `AppShell` | `components/layout/app-shell.tsx` | 应用外壳（侧边栏 + 主内容区） |
| `AppSidebar` | `components/layout/app-sidebar.tsx` | 侧边栏导航 |
| `AppHeader` | `components/layout/app-header.tsx` | 顶部工具栏 |

### 8.2 页面路由

| 路径 | 页面 | 功能 |
|------|------|------|
| `/` | 首页 | 仪表盘、快捷入口 |
| `/settings` | 设置 | AI Provider、代理、下载路径 |
| `/download` | 下载管理 | 下载列表、队列、进度 |
| `/ingestion` | 内容采集 | URL 输入、批量导入 |
| `/processing` | 内容处理 | AI 处理操作面板 |
| `/workflows` | 流水线 | 预设执行、自定义流水线 |

### 8.3 Chat 界面组件（规划）

| 组件 | 职责 |
|------|------|
| `ChatContainer` | 聊天窗口容器 |
| `MessageList` | 消息列表（支持虚拟滚动） |
| `MessageBubble` | 单条消息气泡 |
| `StreamingText` | 流式文本渲染 |
| `ToolCallCard` | 工具调用状态卡片 |
| `AgentSelector` | Agent 切换下拉框 |
| `AssetSelector` | 内容资产选择器 |
| `ChatInput` | 消息输入框 |

---

## 9. Store 初始化

### 9.1 客户端初始化流程

```typescript
// 应用启动时（layout.tsx 或 page.tsx）
import { initApiClients } from "@/lib/api-client";

if (typeof window !== "undefined") {
  initApiClients();  // 注入 apiInvoke / apiListen 到所有 Store
}
```

### 9.2 Store 组合使用

```typescript
// 发送消息时自动关联当前 Agent 和选中资产
const sendMessage = async (text: string) => {
  const currentAgentId = useAgentStore.getState().currentAgentId;
  const selectedAssetIds = useAssetStore.getState().selection.selectedIds;
  
  await useChatStore.getState().sendMessage(text, {
    agentId: currentAgentId,
    selectedAssetIds,
  });
};
```

---

## 10. 样式体系

### 10.1 Tailwind 配置

```typescript
// tailwind.config.ts
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Agent 主题色
        "agent-general": "#6366f1",
        "agent-analyst": "#0ea5e9",
        "agent-summarizer": "#8b5cf6",
        "agent-rewriter": "#ec4899",
        "agent-publisher": "#10b981",
        "agent-pipeline": "#f59e0b",
      },
    },
  },
};
```

### 10.2 全局样式

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 11. 扩展指南

### 11.1 添加新页面

1. 在 `app/` 下创建新目录和 `page.tsx`
2. 在 `lib/navigation.ts` 添加导航项
3. 在 `components/layout/app-sidebar.tsx` 注册导航

### 11.2 添加新 Store

1. 创建 `store/myStore.ts`
2. 使用 `zustand` + `immer` + `devtools` 组合
3. 在 `lib/api-client.ts` 中注入 API 客户端

### 11.3 添加新类型

1. 在 `types/` 下创建或扩展类型文件
2. 确保与 Rust 后端和 Python Core 的序列化兼容

---

## 12. 依赖清单

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.460.0",
    "zustand": "^5.0.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.0.0",
    "eslint-config-next": "^15.0.0"
  }
}
```

---

## 13. 相关 SPEC 文档

| 文档 | 内容 |
|------|------|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | 项目整体架构 |
| [CLI_SPEC.md](CLI_SPEC.md) | Go CLI 命令与桥接 |
| [PYTHON_CORE_SPEC.md](PYTHON_CORE_SPEC.md) | Python 核心引擎 |
| [RUST_BACKEND_SPEC.md](RUST_BACKEND_SPEC.md) | Tauri Rust 后端 |
