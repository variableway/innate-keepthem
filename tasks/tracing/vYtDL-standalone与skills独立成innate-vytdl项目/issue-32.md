# Tracing: 文档整理：vYtDL-standalone CLI 与 skills 独立成 innate-vytdl 项目

## Task Entry (2026-10-26 00:30:00)

- **Issue**: #32
- **Title**: 文档整理
- **Started At**: 2026-10-26 00:30:00
- **Status**: completed

### Original Task Description

```markdown
1. vYtDL-standalone 这个是一个standalone 的cli
2. 目前在vYt项目还有不少skill
3. 现在希望把这两个项目完全先变成独立于当前目录的项目，在一个全新的目录中和其他内容隔离，同时完善所有的文档
4. 文档全部重新新，主要是 1. 说明cli的如何使用 2.skill如何和cli使用在workbuddy，zcode，kimi中
5. 查看当前的x-twitter-skill，把这个skill也一起合并进新的目录
6. 说明DSH是如何使用完成的第一个这一个项目
```
- **Completed At**: 2026-10-26 00:45:00

### Implementation Summary

新独立项目 `~/innate/innate-works/projects/innate-vytdl`（GitHub: qdriven/innate-vytdl）：

1. **搬迁**：gitignored 嵌套克隆 `vYtDL-standalone/` 整体移出 monorepo；未提交的 X/Twitter syndication 回退 + TUI 纯文本回退 WIP（含测试，28 绿）先行提交。
2. **skills 合并**：`skills/` 成为规范源 —— `vytdl-cli`（中文重写，并入 WorkBuddy 代理 502 教训，去除 monorepo 双向同步条款）+ `x-video-dl`（即 x-twitter-skill，自 `innate-works/skills/wip-skills/wip/` 合并，补「与 vYtDL CLI 的关系」一节）。
3. **文档全部重写（中文为主）**：README.md、USAGE.md（CLI 使用，含新 syndication 一节）、`docs/skills-guide.md`（skill + CLI 在 WorkBuddy / zcode / Kimi 中的安装与任务化用法）、`docs/dsh-plugin-model.md`（DSH 插件模式如何落地完成第一个项目：借用/改造对照表、Sprint 0-4 过程、对 ContentForge 的意义）。
4. **安装副本刷新**：`~/.{cursor,codex,trae,workbuddy}/skills/vytdl-cli` 重新复制；`~/.zcode/skills/{vytdl-cli,x-video-dl}`、`~/.kimi-code/skills/{vytdl-cli,x-video-dl}` 符号链接指向新规范源。

monorepo 侧收尾（本 PR）：删除 `vytdl/services/vytdl/.agents/skills/`（源已迁移）；更新根 README / AGENTS.md / .gitignore 注释 / docs/architecture.md（"单向同步"改"完全独立"）/ url-extractor README / daemon AGENTS.md+USAGE.md 的过时路径。

