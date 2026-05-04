# Debug Guide - vYtDL Desktop

## 调试环境设置

### 启用开发者工具

**开发模式**: 自动启用 DevTools

**生产模式**: 在 `main.rs` 中添加:
```rust
// 临时启用 DevTools
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 在 setup 中打开 DevTools
.setup(|app| {
    #[cfg(debug_assertions)]
    {
        let window = app.get_webview_window("main").unwrap();
        window.open_devtools();
    }
    Ok(())
})
```

### 日志级别

```bash
# Rust 端日志
RUST_LOG=debug cargo tauri dev      # 所有日志
RUST_LOG=info cargo tauri dev       # 仅 Info 及以上
RUST_LOG=tauri=debug cargo tauri dev # 仅 Tauri 日志

# 前端日志
# 在 DevTools Console 查看
```

## 常见问题诊断

### 1. 应用启动问题

#### 白屏/黑屏

**诊断步骤**:
1. 打开 DevTools (F12 或右键 Inspect)
2. 检查 Console 错误
3. 检查 Network 面板资源加载

**常见原因**:
- 前端构建失败 → 重新运行 `npm run build`
- 路径配置错误 → 检查 `tauri.conf.json` 的 `frontendDist`
- CSP 限制 → 检查 `security.csp` 配置

#### 启动崩溃

**查看日志**:
```bash
# macOS
tail -f ~/Library/Logs/vYtDL\ Desktop/log.txt

# Windows
# 事件查看器 → Windows 日志 → 应用程序

# Linux
journalctl -f | grep vytdl
```

### 2. 下载功能问题

#### 下载无反应

**检查清单**:
1. yt-dlp 是否安装?
   ```bash
   yt-dlp --version
   ```

2. 检查 Rust 端日志:
   ```bash
   RUST_LOG=debug npm run tauri:dev
   ```

3. 检查前端状态:
   ```typescript
   // DevTools Console
   const { useDownloadStore } = await import('./src/stores/downloadStore');
   useDownloadStore.getState();
   ```

#### 进度不更新

**诊断**:
```rust
// 在 downloader.rs 添加日志
println!("Progress: {}%", percent);

// 检查事件发送
app.emit(&format!("download:progress:{}", id), progress)?;
```

**前端检查**:
```typescript
// 检查事件监听
import { listen } from '@tauri-apps/api/event';
listen('download:progress:*', (e) => console.log(e));
```

#### 下载失败

**错误分类**:

| 错误信息 | 原因 | 解决 |
|----------|------|------|
| "yt-dlp not found" | 未安装或不在 PATH | 安装 yt-dlp |
| "Sign in to confirm" | 需要 Cookie | 配置 --cookies-from-browser |
| "Video unavailable" | 地区限制/已删除 | 使用代理 |
| "No space left" | 磁盘满 | 清理磁盘 |

### 3. 数据库问题

#### 数据库初始化失败

**检查**:
```bash
# 数据库路径
# macOS
ls ~/Library/Application\ Support/com.vytdl.desktop/

# 检查权限
ls -la ~/Library/Application\ Support/com.vytdl.desktop/vytdl.db
```

**重置数据库**:
```bash
# 删除数据库文件后重启应用
rm ~/Library/Application\ Support/com.vytdl.desktop/vytdl.db
```

#### 数据查询失败

**调试 SQL**:
```rust
// 在 database.rs 添加
println!("Executing SQL: {}", query);
println!("Parameters: {:?", params);
```

### 4. UI 渲染问题

#### 样式不生效

**检查**:
1. Tailwind 类名是否正确
2. CSS 变量是否定义
3. 热重载是否生效 (强制刷新 Cmd+R)

**调试工具**:
```typescript
// 检查元素类名
$0.classList;

// 检查计算样式
getComputedStyle($0);
```

#### 组件不更新

**Zustand 调试**:
```typescript
// 启用 Redux DevTools
import { devtools } from 'zustand/middleware';

const useStore = create(devtools((set) => ({
  // ...
})));

// 手动触发更新
useDownloadStore.setState({ downloads: newDownloads });
```

### 5. 视频播放问题

#### 无法播放

**检查**:
1. 文件是否存在:
   ```typescript
   console.log('Video path:', download.filename);
   ```

2. 文件 URL 格式:
   ```typescript
   // 必须是 file:// 协议
   const videoUrl = `file://${download.filename}`;
   ```

3. 视频编码支持:
   ```bash
   # 检查视频编码
   ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1 input.mp4
   ```

#### 字幕不显示

**检查清单**:
- 字幕文件存在且可读
- track 标签 srcLang 属性正确
- 视频和字幕同源 (CORS)

## 调试工具

### 1. Rust 调试

**日志宏**:
```rust
use log::{debug, info, warn, error};

debug!("Detailed debug: {:?}", data);
info!("Operation completed: {}", id);
warn!("Unexpected state: {}", state);
error!("Failed to download: {}", e);
```

**断点调试** (VS Code):
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Tauri Debug",
      "cargo": {
        "args": ["build", "--manifest-path=src-tauri/Cargo.toml"]
      },
      "preLaunchTask": "ui:dev"
    }
  ]
}
```

### 2. 前端调试

**React DevTools**:
- 安装浏览器扩展
- 查看组件树和 Props
- 检查 Hook 状态

**Zustand DevTools**:
```typescript
// stores/downloadStore.ts
import { devtools } from 'zustand/middleware';

export const useDownloadStore = create(
  devtools((set, get) => ({
    // ... store definition
  }), { name: 'DownloadStore' })
);
```

**网络调试**:
```typescript
// 监听 Tauri 命令调用
const originalInvoke = window.__TAURI__.core.invoke;
window.__TAURI__.core.invoke = async (...args) => {
  console.log('Tauri invoke:', args);
  const result = await originalInvoke(...args);
  console.log('Tauri result:', result);
  return result;
};
```

### 3. 数据库调试

**SQLite CLI**:
```bash
# 打开数据库
sqlite3 ~/Library/Application\ Support/com.vytdl.desktop/vytdl.db

# 查看表结构
.schema downloads

# 查询数据
SELECT * FROM downloads ORDER BY created_at DESC LIMIT 10;

# 导出数据
.mode json
SELECT * FROM downloads;
```

### 4. 性能调试

**Rust 性能分析**:
```bash
# 使用 cargo flamegraph
cargo install flamegraph
cargo flamegraph --bin vytdl-desktop
```

**前端性能**:
```typescript
// React 性能监测
import { Profiler } from 'react';

function onRenderCallback(id, phase, actualDuration) {
  console.log('Component:', id, 'Phase:', phase, 'Duration:', actualDuration);
}

<Profiler id="DownloadList" onRender={onRenderCallback}>
  <DownloadList />
</Profiler>
```

## 错误报告模板

提交 Issue 时包含:

```markdown
## 环境信息
- OS: macOS 14.0 / Windows 11 / Ubuntu 22.04
- App Version: 0.1.0
- yt-dlp Version: 2024.03.10

## 复现步骤
1. 打开应用
2. 输入 URL: ...
3. 点击下载

## 预期结果
正常开始下载

## 实际结果
下载按钮无反应

## 日志
```
[粘贴相关日志]
```

## 截图
[如有]
```

## 常用调试命令

```bash
# 清理并重新构建
rm -rf src-tauri/target
rm -rf node_modules dist
npm install
npm run tauri:dev

# 检查依赖版本
npm list @tauri-apps/api
rustc --version
cargo --version

# 验证 Tauri 安装
cargo tauri --version

# 检查 yt-dlp
which yt-dlp
yt-dlp --version

# 查看应用数据目录
# macOS
open ~/Library/Application\ Support/com.vytdl.desktop/

# Windows
explorer "%APPDATA%\vYtDL Desktop"

# Linux
xdg-open ~/.local/share/vYtDL\ Desktop
```

## 参考资源

- [Tauri Debugging](https://tauri.app/v1/guides/debugging/)
- [Rust Logging](https://docs.rs/log/latest/log/)
- [React DevTools](https://react.dev/learn/react-developer-tools)
