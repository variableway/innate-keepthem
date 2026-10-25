/**
 * ContentForge Agent Store
 * 基于 Zustand，管理 Agent 注册、切换、路由、状态
 *
 * 特性：
 * - Agent 注册与发现
 * - 基于意图的自动路由
 * - Agent 切换状态管理
 * - Skill 注册与触发
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  AgentRole,
  AgentCapability,
  AgentState,
  AgentSwitchRecord,
  AgentQuickAction,
  SkillDefinition,
  SkillExecutionResult,
} from "../types/agent";

// ─────────────────────────── 状态定义 ───────────────────────────

interface AgentStoreState extends AgentState {
  // Agent 注册表
  agents: AgentRole[];
  // Agent 切换历史
  switchHistory: AgentSwitchRecord[];
  // 快捷操作
  quickActions: AgentQuickAction[];
  // Skill 注册表
  skills: SkillDefinition[];
  // 加载状态
  isLoadingAgents: boolean;
  isLoadingSkills: boolean;
  // 错误状态
  error: string | null;
  // 路由缓存（意图 -> Agent ID）
  routeCache: Map<string, string>;
}

interface AgentStoreActions {
  // Agent 管理
  loadAgents: () => Promise<void>;
  registerAgent: (agent: AgentRole) => void;
  unregisterAgent: (agentId: string) => void;
  setCurrentAgentId: (agentId: string, reason?: string) => void;
  switchAgent: (agentId: string, triggeredBy: "user" | "auto" | "tool", reason?: string) => Promise<void>;
  routeByIntent: (message: string, selectedAssetIds?: string[]) => string;
  getAgentById: (agentId: string) => AgentRole | undefined;
  getAgentByCapability: (capability: AgentCapability) => AgentRole | undefined;

  // 快捷操作
  loadQuickActions: () => Promise<void>;
  executeQuickAction: (actionId: string, params?: Record<string, unknown>) => Promise<void>;

  // Skill 管理
  loadSkills: () => Promise<void>;
  registerSkill: (skill: SkillDefinition) => void;
  unregisterSkill: (skillId: string) => void;
  findSkillByTrigger: (message: string) => SkillDefinition | undefined;
  executeSkill: (skillId: string, params: Record<string, unknown>) => Promise<SkillExecutionResult>;

  // 状态
  clearError: () => void;
  reset: () => void;
}

// ─────────────────────────── 辅助函数 ───────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ─────────────────────────── 默认 Agent 配置 ───────────────────────────

const DEFAULT_AGENTS: AgentRole[] = [
  {
    id: "general",
    name: "通用助手",
    description: "ContentForge 通用助手，帮助用户管理和处理内容",
    systemPrompt:
      "你是 ContentForge 的通用助手。你帮助用户管理内容资产、执行内容处理任务、导航应用功能。当用户请求需要专业分析时，你会建议切换到对应的专家 Agent。",
    capabilities: ["general", "search"],
    tools: ["search_assets", "get_asset_detail", "list_sessions"],
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 4000,
    contextWindow: 128000,
    icon: "bot",
    color: "#6366f1",
    autoSwitch: false,
    streaming: true,
    requiresContext: false,
    order: 0,
  },
  {
    id: "content_analyst",
    name: "内容分析师",
    description: "分析内容结构、提取要点、情感分析",
    systemPrompt:
      "你是内容分析专家，擅长从文本/视频中提取结构化洞察。你能分析主题、关键词、情感倾向、内容质量，并给出结构化的分析报告。",
    capabilities: ["analyze", "search"],
    tools: ["analyze", "extract_keywords", "detect_language", "search_assets", "get_asset_detail"],
    model: "gpt-4o",
    temperature: 0.3,
    maxTokens: 4000,
    contextWindow: 128000,
    icon: "microscope",
    color: "#0ea5e9",
    autoSwitch: true,
    streaming: true,
    requiresContext: true,
    order: 1,
  },
  {
    id: "summarizer",
    name: "摘要专家",
    description: "生成多风格摘要",
    systemPrompt:
      "你是摘要专家，擅长将长内容转化为精炼的要点。你支持多种摘要风格：结构化、简洁、详细、要点列表、执行摘要。",
    capabilities: ["summarize", "search"],
    tools: ["summarize", "chunk_text", "search_assets", "get_asset_detail"],
    model: "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 4000,
    contextWindow: 128000,
    icon: "scroll-text",
    color: "#8b5cf6",
    autoSwitch: true,
    streaming: true,
    requiresContext: true,
    order: 2,
  },
  {
    id: "rewriter",
    name: "改写专家",
    description: "改写风格、翻译、润色",
    systemPrompt:
      "你是文案改写专家，能根据不同平台调性调整内容。你支持专业、 casual、幽默、学术、营销等多种风格，也支持中英日翻译。",
    capabilities: ["rewrite", "translate", "search"],
    tools: ["rewrite", "translate", "xiaohongshu_convert", "search_assets", "get_asset_detail"],
    model: "gpt-4o",
    temperature: 0.8,
    maxTokens: 4000,
    contextWindow: 128000,
    icon: "pen-tool",
    color: "#ec4899",
    autoSwitch: true,
    streaming: true,
    requiresContext: true,
    order: 3,
  },
  {
    id: "publisher",
    name: "发布助手",
    description: "格式转换、发布准备",
    systemPrompt:
      "你是发布专家，负责将内容转化为各平台可用格式。你支持 Markdown、小红书、JSON 等格式导出，并确保内容符合平台规范。",
    capabilities: ["publish", "search"],
    tools: ["publish", "generate_markdown", "generate_xhs", "search_assets", "get_asset_detail"],
    model: "gpt-4o-mini",
    temperature: 0.6,
    maxTokens: 4000,
    contextWindow: 128000,
    icon: "send",
    color: "#10b981",
    autoSwitch: true,
    streaming: true,
    requiresContext: true,
    order: 4,
  },
  {
    id: "pipeline_runner",
    name: "流水线执行器",
    description: "执行预设 Pipeline",
    systemPrompt:
      "你是流水线调度员，负责执行和管理内容处理 Pipeline。你了解所有预设流程（twitter_to_xiaohongshu, youtube_to_notes 等），能根据用户需求选择最佳流程。",
    capabilities: ["pipeline", "search"],
    tools: ["run_pipeline", "list_presets", "search_assets", "get_asset_detail"],
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 4000,
    contextWindow: 128000,
    icon: "workflow",
    color: "#f59e0b",
    autoSwitch: true,
    streaming: true,
    requiresContext: true,
    order: 5,
  },
];

// ─────────────────────────── 意图路由模式 ───────────────────────────

const INTENT_PATTERNS: Record<AgentCapability, RegExp[]> = {
  analyze: [
    /分析.*内容/i,
    /提取.*要点/i,
    /主题.*是什么/i,
    /情感.*如何/i,
    /关键词/i,
    /核心.*观点/i,
    /analyze/i,
    /extract.*key/i,
    /sentiment/i,
    /topics/i,
  ],
  summarize: [
    /总结/i,
    /摘要/i,
    /概括/i,
    /提炼/i,
    /summarize/i,
    /summary/i,
    /tl;dr/i,
  ],
  rewrite: [
    /改写/i,
    /重写/i,
    /润色/i,
    /调整.*风格/i,
    /rewrite/i,
    /rephrase/i,
    /polish/i,
    /change.*tone/i,
  ],
  translate: [
    /翻译/i,
    /translate/i,
    /转成.*文/i,
  ],
  publish: [
    /发布/i,
    /导出/i,
    /生成.*格式/i,
    /小红书/i,
    /publish/i,
    /export/i,
    /generate.*format/i,
  ],
  pipeline: [
    /运行.*流水线/i,
    /执行.*预设/i,
    /pipeline/i,
    /run.*preset/i,
    /batch.*process/i,
  ],
  search: [
    /搜索/i,
    /查找/i,
    /找.*内容/i,
    /search/i,
    /find/i,
    /lookup/i,
  ],
  general: [],
};

const AGENT_MENTIONS: Record<string, RegExp[]> = {
  content_analyst: [/分析师/i, /analyst/i, /分析.*专家/i],
  summarizer: [/摘要/i, /summarizer/i, /总结.*专家/i],
  rewriter: [/改写/i, /rewriter/i, /改写.*专家/i, /文案/i],
  publisher: [/发布/i, /publisher/i, /发布.*专家/i],
  pipeline_runner: [/流水线/i, /pipeline/i, /调度/i],
};

// ─────────────────────────── API 调用（占位） ───────────────────────────

let apiInvoke: <T>(command: string, args?: unknown) => Promise<T>;

export function setAgentApiClient(
  invoke: <T>(command: string, args?: unknown) => Promise<T>
) {
  apiInvoke = invoke;
}

// ─────────────────────────── Store 实现 ───────────────────────────

export const useAgentStore = create<AgentStoreState & AgentStoreActions>()(
  devtools(
    immer((set, get) => ({
      // ─────────────────── 初始状态 ───────────────────
      currentAgentId: "general",
      previousAgentId: undefined,
      switchReason: undefined,
      isSwitching: false,
      agents: DEFAULT_AGENTS,
      switchHistory: [],
      quickActions: [],
      skills: [],
      isLoadingAgents: false,
      isLoadingSkills: false,
      error: null,
      routeCache: new Map(),

      // ─────────────────── Agent 管理 ───────────────────

      loadAgents: async () => {
        set((state) => {
          state.isLoadingAgents = true;
        });
        try {
          const response = await apiInvoke<{ agents: AgentRole[] }>("get_agents");
          set((state) => {
            // 合并默认 Agent 和远程 Agent（远程优先）
            const remoteMap = new Map(response.agents.map((a) => [a.id, a]));
            const merged = DEFAULT_AGENTS.map((a) => remoteMap.get(a.id) || a);
            // 添加远程独有的 Agent
            response.agents.forEach((a) => {
              if (!merged.find((m) => m.id === a.id)) {
                merged.push(a);
              }
            });
            state.agents = merged.sort((a, b) => a.order - b.order);
            state.isLoadingAgents = false;
          });
        } catch (err) {
          // 使用默认 Agent
          set((state) => {
            state.isLoadingAgents = false;
            state.error = err instanceof Error ? err.message : "加载 Agent 失败";
          });
        }
      },

      registerAgent: (agent: AgentRole) => {
        set((state) => {
          const existing = state.agents.findIndex((a) => a.id === agent.id);
          if (existing >= 0) {
            state.agents[existing] = agent;
          } else {
            state.agents.push(agent);
          }
          state.agents.sort((a, b) => a.order - b.order);
        });
      },

      unregisterAgent: (agentId: string) => {
        set((state) => {
          state.agents = state.agents.filter((a) => a.id !== agentId);
          if (state.currentAgentId === agentId) {
            state.currentAgentId = "general";
          }
        });
      },

      setCurrentAgentId: (agentId: string, reason?: string) => {
        set((state) => {
          state.previousAgentId = state.currentAgentId;
          state.currentAgentId = agentId;
          state.switchReason = reason;
        });
      },

      switchAgent: async (agentId: string, triggeredBy: "user" | "auto" | "tool", reason?: string) => {
        const state = get();
        if (state.currentAgentId === agentId) return;
        if (state.isSwitching) return;

        const previousAgentId = state.currentAgentId;

        set((state) => {
          state.isSwitching = true;
        });

        try {
          await apiInvoke("switch_agent", {
            fromAgentId: previousAgentId,
            toAgentId: agentId,
            triggeredBy,
            reason,
          });

          set((state) => {
            state.previousAgentId = previousAgentId;
            state.currentAgentId = agentId;
            state.switchReason = reason;
            state.isSwitching = false;
            state.switchHistory.unshift({
              id: generateId(),
              sessionId: "", // 由调用方填充
              fromAgentId: previousAgentId,
              toAgentId: agentId,
              reason,
              triggeredBy,
              timestamp: now(),
            });
          });
        } catch (err) {
          set((state) => {
            state.isSwitching = false;
            state.error = err instanceof Error ? err.message : "切换 Agent 失败";
          });
        }
      },

      routeByIntent: (message: string, selectedAssetIds?: string[]) => {
        const state = get();

        // 1. 检查缓存
        const cached = state.routeCache.get(message);
        if (cached) return cached;

        // 2. 检查是否显式提及 Agent
        for (const [agentId, patterns] of Object.entries(AGENT_MENTIONS)) {
          if (patterns.some((p) => p.test(message))) {
            state.routeCache.set(message, agentId);
            return agentId;
          }
        }

        // 3. 基于意图模式匹配
        const capabilityScores: Record<AgentCapability, number> = {
          analyze: 0,
          summarize: 0,
          rewrite: 0,
          translate: 0,
          publish: 0,
          pipeline: 0,
          search: 0,
          general: 0,
        };

        for (const [capability, patterns] of Object.entries(INTENT_PATTERNS)) {
          const score = patterns.reduce((acc, pattern) => {
            return acc + (pattern.test(message) ? 1 : 0);
          }, 0);
          capabilityScores[capability as AgentCapability] = score;
        }

        // 4. 选择最高分的 capability
        const sortedCapabilities = Object.entries(capabilityScores)
          .sort((a, b) => b[1] - a[1])
          .filter(([, score]) => score > 0);

        if (sortedCapabilities.length === 0) {
          // 无明确意图，返回当前 Agent 或通用
          return state.currentAgentId;
        }

        const topCapability = sortedCapabilities[0][0] as AgentCapability;

        // 5. 找到支持该 capability 的 Agent
        const agent = state.agents.find((a) =>
          a.capabilities.includes(topCapability)
        );

        const result = agent?.id || state.currentAgentId;
        state.routeCache.set(message, result);
        return result;
      },

      getAgentById: (agentId: string) => {
        return get().agents.find((a) => a.id === agentId);
      },

      getAgentByCapability: (capability: AgentCapability) => {
        return get().agents.find((a) => a.capabilities.includes(capability));
      },

      // ─────────────────── 快捷操作 ───────────────────

      loadQuickActions: async () => {
        try {
          const response = await apiInvoke<{ actions: AgentQuickAction[] }>("get_quick_actions");
          set((state) => {
            state.quickActions = response.actions;
          });
        } catch {
          // 使用默认快捷操作
          set((state) => {
            state.quickActions = [
              {
                id: "summarize",
                agentId: "summarizer",
                label: "生成摘要",
                description: "为选中的内容生成结构化摘要",
                promptTemplate: "请为以下内容生成摘要：\n\n{{asset_content}}",
                icon: "scroll-text",
              },
              {
                id: "rewrite-xhs",
                agentId: "rewriter",
                label: "转小红书",
                description: "将内容改写为小红书风格",
                promptTemplate: "请将以下内容改写为小红书风格的文案：\n\n{{asset_content}}",
                icon: "pen-tool",
              },
              {
                id: "analyze",
                agentId: "content_analyst",
                label: "分析内容",
                description: "分析内容的主题、情感和关键词",
                promptTemplate: "请分析以下内容：\n\n{{asset_content}}",
                icon: "microscope",
              },
            ];
          });
        }
      },

      executeQuickAction: async (actionId: string, params?: Record<string, unknown>) => {
        const action = get().quickActions.find((a) => a.id === actionId);
        if (!action) return;

        // 切换到对应 Agent
        await get().switchAgent(action.agentId, "user", `执行快捷操作: ${action.label}`);

        // 构建提示词
        let prompt = action.promptTemplate;
        if (params) {
          for (const [key, value] of Object.entries(params)) {
            prompt = prompt.replace(`{{${key}}}`, String(value));
          }
        }

        // 触发消息发送（通过 chatStore）
        // 这里通过事件或回调机制通知 chatStore
        // 实际实现中可以通过全局事件总线或组合 store 调用
      },

      // ─────────────────── Skill 管理 ───────────────────

      loadSkills: async () => {
        set((state) => {
          state.isLoadingSkills = true;
        });
        try {
          const response = await apiInvoke<{ skills: SkillDefinition[] }>("get_skills");
          set((state) => {
            state.skills = response.skills;
            state.isLoadingSkills = false;
          });
        } catch (err) {
          set((state) => {
            state.isLoadingSkills = false;
            state.error = err instanceof Error ? err.message : "加载 Skill 失败";
          });
        }
      },

      registerSkill: (skill: SkillDefinition) => {
        set((state) => {
          const existing = state.skills.findIndex((s) => s.id === skill.id);
          if (existing >= 0) {
            state.skills[existing] = skill;
          } else {
            state.skills.push(skill);
          }
        });
      },

      unregisterSkill: (skillId: string) => {
        set((state) => {
          state.skills = state.skills.filter((s) => s.id !== skillId);
        });
      },

      findSkillByTrigger: (message: string) => {
        return get().skills.find((skill) =>
          skill.triggers.some((trigger) => message.includes(trigger))
        );
      },

      executeSkill: async (skillId: string, params: Record<string, unknown>) => {
        try {
          const result = await apiInvoke<SkillExecutionResult>("execute_skill", {
            skillId,
            params,
          });
          return result;
        } catch (err) {
          return {
            skillId,
            status: "failed" as const,
            output: null,
            error: err instanceof Error ? err.message : "Skill 执行失败",
            durationMs: 0,
          };
        }
      },

      // ─────────────────── 状态 ───────────────────

      clearError: () => {
        set((state) => {
          state.error = null;
        });
      },

      reset: () => {
        set((state) => {
          state.currentAgentId = "general";
          state.previousAgentId = undefined;
          state.switchReason = undefined;
          state.isSwitching = false;
          state.switchHistory = [];
          state.error = null;
          state.routeCache.clear();
        });
      },
    })),
    { name: "agent-store" }
  )
);

// ─────────────────────────── Selector Hooks ───────────────────────────

/** 获取当前 Agent */
export function useCurrentAgent(): AgentRole | undefined {
  return useAgentStore((state) =>
    state.agents.find((a) => a.id === state.currentAgentId)
  );
}

/** 获取所有 Agent 列表（按 order 排序） */
export function useSortedAgents(): AgentRole[] {
  return useAgentStore((state) => state.agents.slice().sort((a, b) => a.order - b.order));
}

/** 获取当前 Agent 的快捷操作 */
export function useCurrentAgentQuickActions(): AgentQuickAction[] {
  return useAgentStore((state) =>
    state.quickActions.filter((a) => a.agentId === state.currentAgentId)
  );
}

/** 获取当前 Agent 的 Skill */
export function useCurrentAgentSkills(): SkillDefinition[] {
  return useAgentStore((state) =>
    state.skills.filter((s) => s.agentId === state.currentAgentId || !s.agentId)
  );
}
