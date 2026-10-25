# Tracing: Refactor Sprint 4: 收尾 —— market 设施、下线、发布流水线

## Task Entry (2026-10-25 12:08:47)

- **Issue**: #23
- **Title**: Refactor Sprint 4: 收尾 —— market 设施、下线、发布流水线
- **Started At**: 2026-10-25 12:08:47
- **Status**: in_progress

### Original Task Description

```markdown
按 docs/refactor/sprint-0/04-roadmap.md Sprint 4：重构收尾。

任务：
1. 下线：删除 apps/vytdl-desktop（Tauri 全量，功能已被 apps/web + apps/shell 取代）与 apps/vytdl-web（Node 后端已被 Go daemon 取代）；CI 移除 Rust job、新增 Shell job；Taskfile/scripts 清理
2. 第三方插件设施：CLI 增 vytdl plugin install/list/remove（pnpm 装入 <home>/plugins，pending 标记+失败诊断）；daemon 增 /api/plugins（列出已装插件）与静态入口服务；前端 plugin-runtime 动态加载器（manifest 校验+错误隔离复用）+ 插件管理界面 + Safe Mode 恢复提示
3. 旧 Tauri 数据一次性迁移：shell 首启检测 com.vytdl.desktop userData（vytdl.db+设置）并提示导入（Q3 决策）
4. 发布流水线：electron-updater 接线（electron-builder publish 配置）+ docs/release-runbook.md（参照 DSH 结构）
5. 文档重写：architecture/modules 按新架构更新；docs/refactor/sprint-0 标记为历史

验收：CI 全绿（无 Rust job）；旧 Tauri 数据迁移提示可用；插件管理界面可列出/禁用第三方插件；runbook 成文。范围内有意的功能例外：summarize_video（桌面 AI 特性）暂不迁移，记入 backlog。
```

