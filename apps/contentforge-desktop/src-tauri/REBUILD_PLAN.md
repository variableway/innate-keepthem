# ContentForge Rust Backend Rebuild 计划

## 目标
将 ContentForge 桌面端的 Rust 后端从 placeholder 实现重建为功能完整的生产级后端，参照 vYtDL-desktop 的架构模式。

## Stage 1: Database 层完善
- **文件**: `database.rs`
- **内容**: 添加所有 CRUD 方法（sessions, messages, assets, settings, pipeline_runs）
- **参考**: vYtDL-desktop/database.rs

## Stage 2: Pipeline Queue 实现
- **文件**: `pipeline_queue.rs` (新增)
- **内容**: 异步 Pipeline 执行队列管理器，支持并发控制和状态追踪
- **参考**: vYtDL-desktop/queue.rs

## Stage 3: Commands 实现
- **文件**: `commands.rs`
- **内容**: 实现所有 IPC 命令的实际逻辑
- **参考**: vYtDL-desktop/commands.rs

## Stage 4: Lib.rs 集成
- **文件**: `lib.rs`
- **内容**: 集成 queue manager，完善启动流程

## 依赖确认
- sqlx (已有)
- tokio (已有)
- uuid (已有)
- chrono (已有)
- serde (已有)
- tauri (已有)
