/**
 * ContentForge Agent 类型定义
 */

/** Agent 能力枚举 */
export type AgentCapability =
  | "analyze"
  | "summarize"
  | "rewrite"
  | "translate"
  | "publish"
  | "pipeline"
  | "search"
  | "general";

/** Agent 角色定义 */
export interface AgentRole {
  id: string;
  name: string;
  description: string;
  /** 系统提示词（角色定义） */
  systemPrompt: string;
  /** 能力列表 */
  capabilities: AgentCapability[];
  /** 可用工具名列表 */
  tools: string[];
  /** 默认模型 */
  model: string;
  temperature: number;
  maxTokens: number;
  /** 上下文窗口大小 */
  contextWindow: number;
  /** UI 图标 */
  icon: string;
  /** UI 主题色 */
  color: string;
  /** 是否支持自动切换 */
  autoSwitch: boolean;
  /** 是否支持流式响应 */
  streaming: boolean;
  /** 是否需要上下文 */
  requiresContext: boolean;
  /** 排序权重 */
  order: number;
}

/** Agent 状态 */
export interface AgentState {
  /** 当前激活的 Agent ID */
  currentAgentId: string;
  /** 上一个 Agent ID（用于回退） */
  previousAgentId?: string;
  /** 切换原因 */
  switchReason?: string;
  /** 是否正在切换中 */
  isSwitching: boolean;
}

/** Agent 切换记录 */
export interface AgentSwitchRecord {
  id: string;
  sessionId: string;
  fromAgentId: string;
  toAgentId: string;
  reason?: string;
  triggeredBy: "user" | "auto" | "tool";
  timestamp: string;
}

/** Agent 快捷操作 */
export interface AgentQuickAction {
  id: string;
  agentId: string;
  label: string;
  description: string;
  /** 预设提示词模板 */
  promptTemplate: string;
  /** 需要的参数 */
  requiredParams?: string[];
  icon: string;
}

/** Agent 性能指标 */
export interface AgentMetrics {
  agentId: string;
  totalCalls: number;
  avgLatencyMs: number;
  avgTokensPerCall: number;
  toolCallSuccessRate: number;
  userRating?: number;
}

// ─────────────────────────── Skill 相关 ───────────────────────────

/** Skill 定义（Markdown + YAML Frontmatter） */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  /** YAML Frontmatter 中的元数据 */
  metadata: {
    version: string;
    author?: string;
    tags?: string[];
    requires?: string[];
  };
  /** Markdown 内容（使用说明） */
  content: string;
  /** 关联的 Agent ID */
  agentId?: string;
  /** 触发关键词 */
  triggers: string[];
  /** 工具调用定义 */
  toolDefinitions?: SkillToolDefinition[];
}

/** Skill 中的工具定义 */
export interface SkillToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: string; // Python 函数路径
}

/** Skill 执行结果 */
export interface SkillExecutionResult {
  skillId: string;
  status: "success" | "failed" | "partial";
  output: unknown;
  error?: string;
  durationMs: number;
}
