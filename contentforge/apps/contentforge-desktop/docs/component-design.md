# ContentForge Chat 组件设计文档

> 版本: v1.0
> 日期: 2026-07-11
> 状态: 设计草案

---

## 目录

1. [组件总览](#1-组件总览)
2. [Chat 对话框 (chat-panel)](#2-chat-对话框-chat-panel)
3. [Agent 切换界面 (agent-selector)](#3-agent-切换界面-agent-selector)
4. [内容资产选择器 (asset-selector)](#4-内容资产选择器-asset-selector)
5. [工具调用卡片 (tool-call-card)](#5-工具调用卡片-tool-call-card)
6. [流式消息渲染 (stream-message)](#6-流式消息渲染-stream-message)
7. [消息输入框 (chat-input)](#7-消息输入框-chat-input)
8. [组件交互关系](#8-组件交互关系)
9. [Props 接口定义](#9-props-接口定义)
10. [样式规范](#10-样式规范)

---

## 1. 组件总览

```
+-----------------------------------------------------------------------------+
|                           AI Workspace Layout                                |
+--------------+------------------------------------------+-------------------+
|              |                                          |                   |
|  Asset       |                                          |   Agent           |
|  Selector    |           Chat Panel                     |   Selector        |
|  (280px)     |           (flex-grow)                    |   (240px)         |
|              |                                          |                   |
|  +--------+  |  +------------------------------------+  |  +-------------+  |
|  | search |  |  |  ChatHeader                        |  |  |  | AgentCard   |  |
|  +--------+  |  |  [AgentInfo] [SessionTitle]        |  |  |   v         |  |
|              |  +------------------------------------+  |  +-------------+  |
|  AssetList   |                                          |                   |
|  +--------+  |  +------------------------------------+  |  QuickActions     |
|  | [icon] |  |  |  MessageList                       |  |  +-----------+    |
|  | Title  |  |  |  +------------------------------+  |  | Summarize |    |
|  | Meta   |  |  |  | UserMessage                  |  |  | Rewrite   |    |
|  +--------+  |  |  | [avatar] [bubble] [assets]     |  |  | Translate |    |
|              |  |  +------------------------------+  |  +-----------+    |
|  Groups      |  |  | AssistantMessage               |  |                   |
|  +--------+  |  |  | [avatar] [bubble]              |  |  SessionInfo      |
|  | Type   |  |  |  | [ToolCallCard]                 |  |  Tokens: 1,234   |
|  | Platform|  |  |  | [ToolResultCard]               |  |  Model: gpt-4o   |
|  +--------+  |  |  +------------------------------+  |  |                 |
|              |  |                                      |  +-----------+     |
|              |  |  +------------------------------------+  | Clear Chat |     |
|              |  |  | ChatInput                          |  +-----------+     |
|              |  |  | [AssetAttach] [Textarea] [Send]    |                   |
|              |  |  +------------------------------------+                   |
|              |  |                                          |                   |
+--------------+------------------------------------------+-------------------+
```

---

## 2. Chat 对话框 (chat-panel)

### 2.1 职责
- 聊天主面板容器，整合所有子组件
- 管理布局（三栏/两栏/单栏响应式）
- 协调 Store 数据流

### 2.2 文件路径
```
desktop/src/components/chat/chat-panel.tsx
```

### 2.3 组件结构
```tsx
<ChatPanel>
  <AssetSelector />      {/* 左侧：内容资产选择器 */}
  <ChatMainArea>         {/* 中间：聊天主区域 */}
    <ChatHeader />
    <MessageList />
    <ChatInput />
  </ChatMainArea>
  <AgentSelector />      {/* 右侧：Agent 切换界面 */}
</ChatPanel>
```

### 2.4 响应式断点
| 断点 | 布局 |
|------|------|
| >=1280px | 三栏：Asset (280px) + Chat (flex) + Agent (240px) |
| 768-1279px | 两栏：Chat + 可折叠的 Asset Drawer |
| <768px | 单栏：Chat 全屏，Asset/Agent 通过 Bottom Sheet |

### 2.5 Props
```typescript
interface ChatPanelProps {
  /** 初始会话 ID */
  initialSessionId?: string;
  /** 初始 Agent ID */
  initialAgentId?: string;
  /** 是否显示 Asset Selector */
  showAssetSelector?: boolean;
  /** 是否显示 Agent Selector */
  showAgentSelector?: boolean;
  /** 布局模式 */
  layout?: "three-column" | "two-column" | "single";
  /** 自定义样式类 */
  className?: string;
}
```

---

## 3. Agent 切换界面 (agent-selector)

### 3.1 职责
- 展示可用 Agent 列表
- 支持 Agent 切换
- 展示当前 Agent 信息和快捷操作
- 显示会话统计

### 3.2 文件路径
```
desktop/src/components/chat/agent-selector.tsx
```

### 3.3 组件结构
```tsx
<AgentSelector>
  <AgentCard />           {/* 当前 Agent 信息卡片 */}
  <AgentQuickActions />   {/* 快捷操作按钮 */}
  <AgentList />           {/* Agent 列表（可切换） */}
  <SessionInfo />         {/* 会话统计信息 */}
</AgentSelector>
```

### 3.4 AgentCard 设计
```
+--------------------------------+
|  [icon] 内容分析师              |
|  content_analyst                |
|  分析内容结构、提取要点          |
|                                 |
|  [彩色圆点] 在线                |
|  Model: gpt-4o                  |
|  Temperature: 0.3               |
+--------------------------------+
```

### 3.5 AgentList 设计
```
+--------------------------------+
|  可用 Agent                     |
|  +---------------------------+ |
|  | [icon] 通用助手     [check]| |  <- 当前选中
|  | 帮助用户管理和处理内容      | |
|  +---------------------------+ |
|  | [icon] 内容分析师         | |
|  | 分析内容结构、提取要点     | |
|  +---------------------------+ |
|  | [icon] 摘要专家           | |
|  | 生成多风格摘要            | |
|  +---------------------------+ |
+--------------------------------+
```

### 3.6 Props
```typescript
interface AgentSelectorProps {
  /** 当前 Agent ID */
  currentAgentId?: string;
  /** 切换回调 */
  onAgentSwitch?: (agentId: string, reason?: string) => void;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认展开状态 */
  defaultExpanded?: boolean;
  className?: string;
}
```

---

## 4. 内容资产选择器 (asset-selector)

### 4.1 职责
- 展示内容资产列表
- 支持搜索、过滤、分组
- 支持单选/多选
- 展示资产预览

### 4.2 文件路径
```
desktop/src/components/chat/asset-selector.tsx
```

### 4.3 组件结构
```tsx
<AssetSelector>
  <AssetSearchBar />      {/* 搜索框 */}
  <AssetFilterBar />      {/* 过滤条件 */}
  <AssetGroupTabs />      {/* 分组标签 */}
  <AssetList />           {/* 资产列表 */}
  <AssetPreviewModal />   {/* 预览弹窗 */}
</AssetSelector>
```

### 4.4 AssetListItem 设计
```
+--------------------------------+
| [checkbox] [thumbnail] [icon]  |
| Title: AI 发展趋势分析          |
| Platform: youtube | 5:32        |
| Status: processed [green dot]   |
| Tags: #AI #technology           |
+--------------------------------+
```

### 4.5 分组标签
- 按类型：Video / Article / Tweet / Audio / Image / Note
- 按平台：YouTube / Twitter / RSS / Web / Local
- 按状态：Ingested / Processing / Processed / Ready / Published

### 4.6 Props
```typescript
interface AssetSelectorProps {
  /** 选中的资产 ID 列表 */
  selectedIds?: string[];
  /** 选择模式 */
  selectionMode?: "single" | "multiple";
  /** 选择回调 */
  onSelectionChange?: (selectedIds: string[]) => void;
  /** 是否显示预览按钮 */
  showPreview?: boolean;
  /** 资产类型过滤 */
  filterType?: AssetType[];
  /** 最大选择数量 */
  maxSelection?: number;
  className?: string;
}
```

---

## 5. 工具调用卡片 (tool-call-card)

### 5.1 职责
- 展示工具调用状态（pending/running/completed/failed）
- 展示工具参数和结果
- 支持用户确认（destructive 操作）
- 支持展开/折叠详情

### 5.2 文件路径
```
desktop/src/components/chat/tool-call-card.tsx
```

### 5.3 状态设计

#### Pending 状态
```
+--------------------------------+
| [spinner] Tool: analyze          |
| 等待执行...                      |
|                                  |
| Arguments:                       |
| * asset_id: "abc123"             |
| * mode: "ai"                     |
|                                  |
| [Cancel]                         |
+--------------------------------+
```

#### Running 状态
```
+--------------------------------+
| [spinner] Tool: analyze          |
| 正在分析... 45%                  |
| [==========>        ]          |
|                                  |
| Duration: 2.3s                 |
|                                  |
| [Cancel]                         |
+--------------------------------+
```

#### Completed 状态
```
+--------------------------------+
| [check] Tool: analyze - Completed|
| Duration: 3.2s | Tokens: 1,847 |
|                                  |
| Result:                          |
| * Topics: AI, ML, Python       |
| * Sentiment: Positive (0.85)   |
| * Keywords: neural network...    |
|                                  |
| [View Details] [Apply to Asset]|
+--------------------------------+
```

#### Failed 状态
```
+--------------------------------+
| [x] Tool: analyze - Failed       |
| Error: 资产不存在或已删除        |
|                                  |
| [Retry] [Dismiss]              |
+--------------------------------+
```

#### 需要确认状态
```
+--------------------------------+
| [alert] Tool: run_pipeline       |
| 此操作将执行流水线并修改内容     |
|                                  |
| Preset: twitter_to_xiaohongshu |
| Input: https://twitter.com/... |
|                                  |
| [Approve] [Reject]             |
+--------------------------------+
```

### 5.4 Props
```typescript
interface ToolCallCardProps {
  /** 工具调用数据 */
  toolCall: ToolCall;
  /** 工具结果（如果有） */
  toolResult?: ToolResult;
  /** 是否可展开详情 */
  expandable?: boolean;
  /** 默认展开状态 */
  defaultExpanded?: boolean;
  /** 确认回调（需要确认时） */
  onConfirm?: (callId: string, approved: boolean) => void;
  /** 重试回调 */
  onRetry?: (callId: string) => void;
  /** 取消回调 */
  onCancel?: (callId: string) => void;
  className?: string;
}
```

---

## 6. 流式消息渲染 (stream-message)

### 6.1 职责
- 实时渲染流式文本
- 支持 Markdown 渲染
- 支持代码块语法高亮
- 支持工具调用卡片嵌入
- 打字机效果

### 6.2 文件路径
```
desktop/src/components/chat/stream-message.tsx
```

### 6.3 渲染策略

#### 文本流式渲染
- 使用 `useEffect` + `requestAnimationFrame` 平滑更新
- 支持打字机效果（可选）
- 自动滚动到底部

#### Markdown 渲染
- 使用 `react-markdown` 或 `remark`
- 支持代码块、表格、列表
- 支持 LaTeX 公式（可选）

#### 工具调用嵌入
- 在消息流中检测工具调用标记
- 动态插入 ToolCallCard 组件
- 保持流式文本的连续性

### 6.4 Props
```typescript
interface StreamMessageProps {
  /** 消息内容 */
  content: string;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 增量内容 */
  delta?: string;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 工具结果列表 */
  toolResults?: ToolResult[];
  /** 是否支持 Markdown */
  enableMarkdown?: boolean;
  /** 打字机效果速度（ms/char） */
  typewriterSpeed?: number;
  className?: string;
}
```

---

## 7. 消息输入框 (chat-input)

### 7.1 职责
- 文本输入
- 资产附件选择
- 多模态输入（图片、语音、文件）
- 发送/取消操作
- 快捷键支持

### 7.2 文件路径
```
desktop/src/components/chat/chat-input.tsx
```

### 7.3 组件结构
```tsx
<ChatInput>
  <SelectedAssetsBar />    {/* 已选资产标签 */}
  <InputArea>              {/* 输入区域 */}
    <Textarea
      placeholder="输入消息..."
      onKeyDown={handleKeyDown}  {/* Enter 发送, Shift+Enter 换行 */}
    />
  </InputArea>
  <ActionBar>              {/* 操作栏 */}
    <AssetAttachButton />  {/* 附加资产 */}
    <FileUploadButton />   {/* 上传文件 */}
    <VoiceInputButton />   {/* 语音输入 */}
    <SendButton />         {/* 发送 */}
    <CancelButton />       {/* 取消（流式时显示） */}
  </ActionBar>
</ChatInput>
```

### 7.4 设计细节

#### 已选资产标签
```
+--------------------------------+
| [x] AI 发展趋势分析 | [x] 另一篇 |
|                                |
| [输入消息...                    |
|                                |
| [paperclip] [mic] [send]      |
+--------------------------------+
```

#### 快捷键
| 快捷键 | 功能 |
|--------|------|
| Enter | 发送消息 |
| Shift+Enter | 换行 |
| Ctrl+K | 聚焦搜索 |
| Esc | 取消流式/关闭弹窗 |
| @ | 提及资产（触发资产选择器） |
| / | 触发快捷命令 |

### 7.5 Props
```typescript
interface ChatInputProps {
  /** 是否禁用（发送中） */
  disabled?: boolean;
  /** 是否正在流式输出 */
  isStreaming?: boolean;
  /** 已选资产 ID */
  selectedAssetIds?: string[];
  /** 发送回调 */
  onSend?: (text: string, options?: SendMessageOptions) => void;
  /** 取消回调 */
  onCancel?: () => void;
  /** 资产选择回调 */
  onAssetSelect?: (assetIds: string[]) => void;
  /** 文件上传回调 */
  onFileUpload?: (files: File[]) => void;
  /** 占位符文本 */
  placeholder?: string;
  className?: string;
}
```

---

## 8. 组件交互关系

### 8.1 数据流
```
User Input
  -> ChatInput.onSend
    -> chatStore.sendMessage
      -> apiInvoke("chat_send")
        -> Backend ChatEngine
          -> AIEngine.stream()
            -> WebSocket Events
              -> chatStore.handleWSEvent
                -> StreamMessage re-render
```

### 8.2 Agent 切换流
```
User Message
  -> ChatEngine.route_by_intent()
    -> agentRegistry.routeByIntent()
      -> If agent changed:
        -> WebSocket "agent.switched" event
          -> chatStore.handleAgentSwitched()
            -> agentStore.setCurrentAgentId()
              -> AgentSelector re-render
```

### 8.3 工具调用流
```
AI Response (tool_call detected)
  -> ChatEngine._extract_tool_calls()
    -> WebSocket "tool.call.start" event
      -> chatStore.handleToolCallStart()
        -> ToolCallCard render (pending)
    -> ToolExecutor.execute()
      -> WebSocket "tool.call.progress" event
        -> chatStore.handleToolCallProgress()
          -> ToolCallCard render (running)
      -> Tool execution completed
        -> WebSocket "tool.call.completed" event
          -> chatStore.handleToolCallCompleted()
            -> ToolCallCard render (completed)
            -> StreamMessage append result
```

### 8.4 资产选择流
```
User clicks Asset in AssetSelector
  -> assetStore.selectAsset()
    -> AssetSelector re-render (checked)
  -> ChatInput receives selectedAssetIds
    -> Shows SelectedAssetsBar
  -> User sends message
    -> selectedAssetIds passed to chatStore.sendMessage()
      -> Backend injects asset context
```

---

## 9. Props 接口定义

### 9.1 完整 Props 汇总

```typescript
// chat-panel.tsx
interface ChatPanelProps {
  initialSessionId?: string;
  initialAgentId?: string;
  showAssetSelector?: boolean;
  showAgentSelector?: boolean;
  layout?: "three-column" | "two-column" | "single";
  className?: string;
}

// agent-selector.tsx
interface AgentSelectorProps {
  currentAgentId?: string;
  onAgentSwitch?: (agentId: string, reason?: string) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

// asset-selector.tsx
interface AssetSelectorProps {
  selectedIds?: string[];
  selectionMode?: "single" | "multiple";
  onSelectionChange?: (selectedIds: string[]) => void;
  showPreview?: boolean;
  filterType?: AssetType[];
  maxSelection?: number;
  className?: string;
}

// tool-call-card.tsx
interface ToolCallCardProps {
  toolCall: ToolCall;
  toolResult?: ToolResult;
  expandable?: boolean;
  defaultExpanded?: boolean;
  onConfirm?: (callId: string, approved: boolean) => void;
  onRetry?: (callId: string) => void;
  onCancel?: (callId: string) => void;
  className?: string;
}

// stream-message.tsx
interface StreamMessageProps {
  content: string;
  isStreaming: boolean;
  delta?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  enableMarkdown?: boolean;
  typewriterSpeed?: number;
  className?: string;
}

// chat-input.tsx
interface ChatInputProps {
  disabled?: boolean;
  isStreaming?: boolean;
  selectedAssetIds?: string[];
  onSend?: (text: string, options?: SendMessageOptions) => void;
  onCancel?: () => void;
  onAssetSelect?: (assetIds: string[]) => void;
  onFileUpload?: (files: File[]) => void;
  placeholder?: string;
  className?: string;
}
```

---

## 10. 样式规范

### 10.1 颜色系统
```css
:root {
  /* Agent 主题色 */
  --agent-general: #6366f1;
  --agent-analyst: #0ea5e9;
  --agent-summarizer: #8b5cf6;
  --agent-rewriter: #ec4899;
  --agent-publisher: #10b981;
  --agent-pipeline: #f59e0b;

  /* 状态色 */
  --status-pending: #f59e0b;
  --status-running: #3b82f6;
  --status-completed: #10b981;
  --status-failed: #ef4444;
  --status-cancelled: #6b7280;

  /* 消息气泡 */
  --message-user-bg: #6366f1;
  --message-user-text: #ffffff;
  --message-assistant-bg: #f3f4f6;
  --message-assistant-text: #1f2937;

  /* 工具卡片 */
  --tool-card-bg: #ffffff;
  --tool-card-border: #e5e7eb;
  --tool-card-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
```

### 10.2 间距系统
```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;

/* 组件间距 */
--panel-gap: 16px;
--message-gap: 12px;
--card-padding: 16px;
--input-padding: 12px 16px;
```

### 10.3 圆角与阴影
```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 9999px;

--shadow-card: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
--shadow-dropdown: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
--shadow-modal: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
```

### 10.4 动画
```css
/* 流式文本出现 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

.stream-char {
  animation: fadeIn 0.1s ease-out;
}

/* 工具卡片状态切换 */
.tool-card {
  transition: all 0.2s ease;
}

/* 消息气泡 */
.message-bubble {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

/* Agent 切换 */
.agent-switch {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}
```

---

## 11. 文件清单

```
desktop/src/components/chat/
├── chat-panel.tsx          # 主面板容器
├── agent-selector.tsx      # Agent 切换界面
├── asset-selector.tsx      # 内容资产选择器
├── tool-call-card.tsx      # 工具调用卡片
├── stream-message.tsx      # 流式消息渲染
├── chat-input.tsx          # 消息输入框
├── chat-header.tsx         # 聊天头部
├── message-list.tsx        # 消息列表
├── message-item.tsx        # 单条消息
├── user-message.tsx        # 用户消息
├── assistant-message.tsx   # 助手消息
└── index.ts                # 统一导出
```

---

> 本文档为 ContentForge Chat 组件的设计规范，实际实现中可根据需要调整。
