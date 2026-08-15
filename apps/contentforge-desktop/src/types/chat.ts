/**
 * ContentForge Chat 类型定义
 * 前后端共享契约
 */

// ─────────────────────────── 消息相关 ───────────────────────────

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessageStatus = "sending" | "streaming" | "completed" | "failed" | "cancelled";

/** 工具调用状态 */
export type ToolCallStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/** 单个工具调用 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

/** 工具调用结果 */
export interface ToolResult {
  callId: string;
  name: string;
  output: unknown;
  error?: string;
  durationMs: number;
}

/** 消息附件（图片、文件等） */
export interface MessageAttachment {
  id: string;
  type: "image" | "file" | "audio" | "video";
  url: string;
  name: string;
  mimeType: string;
  size?: number;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  /** 流式响应时的增量内容 */
  delta?: string;
  attachments?: MessageAttachment[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  /** 用户发送时选中的资产ID */
  selectedAssetIds?: string[];
  /** Token 使用量 */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 使用的模型 */
  model?: string;
  /** 消息状态 */
  status: MessageStatus;
  /** 错误信息 */
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────── 会话相关 ───────────────────────────

export type SessionStatus = "active" | "archived" | "pinned";

/** 聊天会话 */
export interface ChatSession {
  id: string;
  title: string;
  /** 当前会话绑定的 Agent ID */
  agentId: string;
  status: SessionStatus;
  /** 关联的任务ID（如 PipelineRun） */
  linkedTaskId?: string;
  /** 关联的资产ID列表 */
  linkedAssetIds: string[];
  /** 会话元数据 */
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** 发送消息选项 */
export interface SendMessageOptions {
  /** 指定 Agent ID，覆盖当前会话默认 */
  agentId?: string;
  /** 选中的资产ID */
  selectedAssetIds?: string[];
  /** 附件 */
  attachments?: MessageAttachment[];
  /** 是否流式响应 */
  streaming?: boolean;
}

// ─────────────────────────── WebSocket 事件 ───────────────────────────

export type WSEventType =
  | "chat.send"
  | "session.bind"
  | "stream.cancel"
  | "ping"
  | "message.delta"
  | "message.completed"
  | "message.failed"
  | "tool.call.start"
  | "tool.call.progress"
  | "tool.call.completed"
  | "tool.call.failed"
  | "tool.confirm"
  | "agent.switched"
  | "session.updated"
  | "error";

export interface WSEvent {
  type: WSEventType;
  sessionId: string;
  payload: unknown;
  timestamp: string;
}

/** message.delta 事件 payload */
export interface MessageDeltaPayload {
  messageId: string;
  delta: string;
  /** 累积内容（可选，前端可自行拼接） */
  accumulated?: string;
}

/** message.completed 事件 payload */
export interface MessageCompletedPayload {
  messageId: string;
  content: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model?: string;
}

/** tool.call.start 事件 payload */
export interface ToolCallStartPayload {
  messageId: string;
  toolCall: ToolCall;
}

/** tool.call.progress 事件 payload */
export interface ToolCallProgressPayload {
  messageId: string;
  callId: string;
  progress: number; // 0-100
  detail?: string;
}

/** tool.call.completed 事件 payload */
export interface ToolCallCompletedPayload {
  messageId: string;
  callId: string;
  result: unknown;
  durationMs: number;
}

/** agent.switched 事件 payload */
export interface AgentSwitchedPayload {
  previousAgentId: string;
  currentAgentId: string;
  reason?: string;
}

// ─────────────────────────── 请求/响应 ───────────────────────────

export interface ChatSendRequest {
  sessionId: string;
  message: string;
  agentId?: string;
  selectedAssetIds?: string[];
  attachments?: MessageAttachment[];
  streaming?: boolean;
}

export interface ChatSendResponse {
  messageId: string;
  sessionId: string;
  status: "accepted" | "rejected";
  error?: string;
}

export interface GetSessionsResponse {
  sessions: ChatSession[];
}

export interface GetHistoryResponse {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

// ─────────────────────────── 流式响应 ───────────────────────────

export interface StreamChunk {
  /** chunk 类型 */
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  /** 消息 ID */
  messageId: string;
  /** 文本增量（type=text 时） */
  text?: string;
  /** 工具调用（type=tool_call 时） */
  toolCall?: ToolCall;
  /** 工具结果（type=tool_result 时） */
  toolResult?: ToolResult;
  /** 错误信息（type=error 时） */
  error?: string;
}
