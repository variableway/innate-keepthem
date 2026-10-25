# Tracing: 移除 AI Agent 工作台/终端启动器功能线

## Task Entry (2026-10-25 16:24:06)

- **Issue**: #25
- **Title**: 移除 AI Agent 工作台/终端启动器功能线
- **Started At**: 2026-10-25 16:24:06
- **Status**: completed

### Original Task Description

```markdown
产品决策：去掉 AI 工作（agent 终端启动器 + 应用内 AI chat）相关代码，产品聚焦下载/媒体处理。

范围：
- 删 packages/plugin-workspace（workspace 页 + terminal 页 + chatStore + 终端启动器组件）
- 删 apps/web 的 /workspace thin routes 与插件注册
- 删 apps/shell 的 terminal-launcher.ts + 4 个 IPC handler + preload 桥方法 + 16 个单测
- 删 plugin-settings 的 AgentCliSettings 组件与 AI 表单区（ai_provider/ai_api_key/ai_model）
- runtime types/navigation/locales 清理 workspace 与 agent/ai 键
- daemon get/update-settings 的 ai_*/agent_cli_* 键移除
- 文档同步（AGENTS.md 终端启动器章节删除）

保留：桌面通用桥（reveal/open folder、picker、clipboard）、VTT 分析、其余全部功能。
```
- **Completed At**: 2026-10-25 16:47:36

### Implementation Summary

AI 工作台/终端启动器功能线已整体下线（PR #26 squash 合并，CI 5/5 绿）。宿主在删除整条插件后真机启动验证通过，插件协议文档 docs/plugin-protocol.md 随本 PR 落库：协议的移除语义（删包→宿主照常启动）获得实际验证。

