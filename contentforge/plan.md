# ContentForge Chat 前端集成层 — 实现计划

## 目标
为 ContentForge 桌面端（Next.js + Zustand）实现 Chat 对话框的前端集成层，包含：
1. WebSocket 实时通信
2. 流式响应展示
3. 工具调用卡片 UI
4. Agent 切换界面
5. 内容资产选择器

## 阶段划分

### Stage 1: 核心类型定义与共享接口
- 文件: `desktop/src/types/chat.ts`, `desktop/src/types/agent.ts`, `desktop/src/types/asset.ts`
- 定义所有核心 TypeScript 类型，作为前后端契约

### Stage 2: 前端 Store 实现（并行）
- **Worker A**: `chatStore.ts` — 会话管理、消息状态、流式响应、工具调用
- **Worker B**: `agentStore.ts` — Agent 注册、切换、路由、状态
- **Worker C**: `assetStore.ts` — 内容资产加载、搜索、选择、缓存

### Stage 3: API Client 与 WebSocket 层
- 文件: `desktop/src/lib/api-client.ts`, `desktop/src/lib/ws-client.ts`
- 统一 Tauri IPC / HTTP / WebSocket 抽象

### Stage 4: Python 后端 Agent 系统
- 文件: `core/python/contentforge/ai/chat_engine.py`, `agent.py`, `router.py`, `tools.py`, `context.py`, `session.py`
- 自研轻量 ReAct 风格 Agent 框架
- 与现有 AIEngine、PipelineEngine 复用

### Stage 5: 组件设计文档
- 文件: `desktop/docs/component-design.md`

## 输出文件清单

### TypeScript (desktop/src/)
```
types/
  chat.ts
  agent.ts
  asset.ts
store/
  chatStore.ts
  agentStore.ts
  assetStore.ts
lib/
  api-client.ts
  ws-client.ts
```

### Python (core/python/contentforge/ai/)
```
chat_engine.py
agent.py
router.py
tools.py
context.py
session.py
```

### 文档
```
desktop/docs/component-design.md
```

## 关键设计决策
1. **不复用 LangChain** — 与现有 PipelineEngine 风格一致，自研轻量框架
2. **Function Calling Schema** — 采用 OpenAI 标准，兼容 Claude/Ollama
3. **Zustand 分 Store** — chatStore + agentStore + assetStore，职责清晰
4. **WebSocket 流式** — 后端通过 WS 推送流式 token + 工具调用事件
5. **Skill 格式** — Markdown + YAML Frontmatter
