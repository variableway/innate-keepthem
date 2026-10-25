# Tracing: monorepo 整理:vytdl/contentforge 按技术栈切割成独立项目目录

## Task Entry (2026-10-25 17:47:26)

- **Issue**: #28
- **Title**: monorepo 整理:vytdl/contentforge 按技术栈切割成独立项目目录
- **Started At**: 2026-10-25 17:47:26
- **Status**: in_progress

### Original Task Description

```markdown
将 monorepo 切割为 vytdl/(Go+Next.js/Electron+DSH 插件)与 contentforge/(Rust+Python+Go cli)两个顶层项目目录;共享技术层 packages/{ui,utils,plugin-runtime}(DSH/desktop 定位)留顶层;CI 拆 vytdl.yml + contentforge.yml 带 paths 过滤;workspace/go.work/Taskfile/docker/scripts/AGENTS.md 全部改线。先完全切割,合并策略后议。
```

