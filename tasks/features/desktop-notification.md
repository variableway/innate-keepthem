# Feature: Notification System

## 概述
实现桌面通知功能，及时告知用户下载状态和系统消息。

## 关联代码
- `vYtDL-desktop/src-tauri/src/commands.rs` (notification)
- `vYtDL-desktop/src-tauri/src/main.rs` (plugin init)

## 子任务

### 6.1 系统通知
**优先级**: P1
**状态**: ✅ 已完成

- [x] Tauri notification 插件集成
- [x] 下载完成通知
- [ ] 下载失败通知
- [ ] 批量下载完成汇总

**实现**:
```rust
let _ = app
    .notification()
    .builder()
    .title("Download Complete")
    .body(format!("{} has been downloaded", title))
    .show();
```

### 6.2 应用内通知
**优先级**: P1
**状态**: ⏳ 待实现

- [ ] Toast 通知组件
- [ ] 通知历史中心
- [ ] 通知优先级分级

### 6.3 通知设置
**优先级**: P2
**状态**: ⏳ 待实现

- [ ] 开关系统通知
- [ ] 选择通知类型
- [ ] 免打扰模式

## 通知场景

| 场景 | 通知内容 | 优先级 |
|------|----------|--------|
| 单个下载完成 | "{title} downloaded" | Normal |
| 批量完成 | "5 videos downloaded" | Normal |
| 下载失败 | "{title} failed: {error}" | High |
| 网络恢复 | "Network restored, resuming..." | Low |
| 空间不足 | "Storage space running low" | High |
