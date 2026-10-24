# Tracing: Refactor Sprint 1: vytdl serve 后台服务（Go daemon）

## Task Entry (2026-10-24 19:34:20)

- **Issue**: #15
- **Title**: Refactor Sprint 1: vytdl serve 后台服务（Go daemon）
- **Started At**: 2026-10-24 19:34:20
- **Status**: in_progress

### Original Task Description

```markdown
按 docs/refactor/sprint-0/04-roadmap.md Sprint 1：为 Go CLI 增加 vytdl serve daemon，替换 apps/vytdl-web 的 Node 后端，成为唯一后端。

任务：
1. 迁移 vYtDL-standalone → services/vytdl（Q1 决策：monorepo 开发，standalone 单向同步），更新 go.work/.gitignore/引用
2. cmd/serve.go：--port 0（随机）、--static <dir>、--home <dir>、--dev
3. internal/server/：HTTP 路由（sprint-0 01 文档 §4 全表）+ WS 进度广播 /api/ws，复用 internal/downloader、record、vtt、ytdlpbin
4. Go 队列管理器：max_concurrent、FIFO、取消、resume-on-startup，行为对齐 queue.rs/queue.ts
5. SQLite 层（modernc.org/sqlite 纯 Go）：沿用 downloads/settings/vtt_reports schema
6. 前端静态资源服务（Next output: export 产物）
7. Docker：镜像改为 daemon + 前端静态产物，更新 docker-compose.yml
8. 集成测试：API 全表逐条断言（以 vytdl-web 现行为基线），CLI 原有 *_test.go 全绿

验收：浏览器打开 http://127.0.0.1:<port> 完成下载→进度→完成全流程；task web:up 跑通 Docker 路径；Rust 桌面不动。开放问题 Q1–Q5 已由维护者拍板（见 docs/refactor/sprint-0/05-risks-open-questions.md §3，issue #12）。
```

