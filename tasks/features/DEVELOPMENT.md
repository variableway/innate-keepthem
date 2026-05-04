# Development Workflow - vYtDL Desktop

## 开发环境设置

### 推荐工具

| 类别 | 工具 | 用途 |
|------|------|------|
| IDE | VS Code / RustRover | 代码编辑 |
| 终端 | iTerm2 / Windows Terminal | 命令执行 |
| API 测试 | Postman / HTTPie | 后端 API 测试 |
| 数据库 | TablePlus / DBeaver | SQLite 查看 |
| Git | Git / GitHub Desktop | 版本控制 |

### VS Code 推荐插件

```json
// .vscode/extensions.json
{
  "recommendations": [
    "rust-lang.rust-analyzer",
    "tauri-apps.tauri-vscode",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense"
  ]
}
```

## 项目结构详解

```
vYtDL-desktop/
├── src/                          # 前端源代码
│   ├── components/               # React 组件
│   │   ├── ui/                   # 基础 UI 组件
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   └── ...
│   │   ├── DownloadForm.tsx      # 下载表单
│   │   ├── DownloadList.tsx      # 下载列表
│   │   ├── VideoPlayer.tsx       # 视频播放器
│   │   ├── Layout.tsx            # 页面布局
│   │   └── ...
│   ├── stores/                   # Zustand 状态管理
│   │   ├── downloadStore.ts
│   │   └── settingsStore.ts
│   ├── types/                    # TypeScript 类型定义
│   │   └── index.ts
│   ├── lib/                      # 工具函数
│   │   └── utils.ts
│   ├── App.tsx                   # 根组件
│   ├── main.tsx                  # 应用入口
│   └── index.css                 # 全局样式
├── src-tauri/                    # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs               # 应用入口
│   │   ├── commands.rs           # IPC 命令
│   │   ├── database.rs           # 数据库操作
│   │   └── downloader.rs         # 下载器
│   ├── Cargo.toml                # Rust 依赖
│   └── tauri.conf.json           # Tauri 配置
└── package.json
```

## 开发工作流程

### 1. 创建新功能

```bash
# 1. 创建功能分支
git checkout -b feature/new-download-option

# 2. 开发前端组件
# - 在 src/components/ 创建新组件
# - 在 stores/ 添加状态管理
# - 在 types/ 添加类型定义

# 3. 开发后端命令
# - 在 src-tauri/src/commands.rs 添加命令
# - 在 src-tauri/src/main.rs 注册命令

# 4. 测试
npm run tauri:dev

# 5. 提交
# 按照提交信息规范
```

### 2. 修改现有功能

```bash
# 1. 定位代码
# 使用 grep 查找相关代码
grep -r "start_download" src/

# 2. 修改代码
# 前端修改后自动热重载
# Rust 修改后自动重新编译

# 3. 验证
# 在 Tauri 窗口中测试
# 查看 DevTools Console 和 Network
```

### 3. 调试流程

```bash
# 1. 启动开发服务器
RUST_LOG=debug npm run tauri:dev

# 2. 打开 DevTools
# macOS: Cmd + Option + I
# Windows/Linux: Ctrl + Shift + I

# 3. 设置断点
# 前端: Sources 面板
# Rust: VS Code 调试面板

# 4. 查看日志
# Console 面板 (前端)
# 终端输出 (Rust)
```

## 编码规范

### TypeScript/React

```typescript
// 1. 使用函数式组件
export function ComponentName({ prop }: Props) {
  // ...
}

// 2. 类型定义前置
interface Props {
  id: string;
  onAction: () => void;
}

// 3. 使用自定义 hooks
function useDownloadProgress(id: string) {
  // ...
}

// 4. 错误处理
try {
  await invoke('command');
} catch (error) {
  console.error('Failed:', error);
}
```

### Rust

```rust
// 1. 错误处理使用 Result
pub async fn download() -> Result<Output, Error> {
    // ...
}

// 2. 日志记录
use log::{info, error};
info!("Starting download: {}", url);

// 3. 文档注释
/// Start a new download
/// 
/// # Arguments
/// * `url` - The video URL
#[tauri::command]
pub async fn start_download(url: String) -> Result<String, String> {
    // ...
}
```

### Git 提交规范

```
类型(scope): 简短描述

详细描述 (可选)

Fixes #123
```

**类型**:
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 代码格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

**示例**:
```
feat(download): add playlist support

- Add is_playlist option to DownloadForm
- Update downloader to handle playlists
- Add playlist progress tracking

Fixes #42
```

## 测试策略

### 前端测试

```typescript
// components/DownloadForm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadForm } from './DownloadForm';

describe('DownloadForm', () => {
  it('should submit form with valid URL', () => {
    const onSubmit = jest.fn();
    render(<DownloadForm onSubmit={onSubmit} />);
    
    fireEvent.change(screen.getByPlaceholderText('URL'), {
      target: { value: 'https://youtube.com/watch?v=...' }
    });
    fireEvent.click(screen.getByText('Download'));
    
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

### Rust 测试

```rust
// src/database.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_download() {
        let db = Database::new_in_memory().await.unwrap();
        let record = DownloadRecord {
            id: "test-1".to_string(),
            url: "https://...".to_string(),
            // ...
        };
        
        db.create_download(record).await.unwrap();
        
        let downloads = db.get_all_downloads().await.unwrap();
        assert_eq!(downloads.len(), 1);
    }
}
```

### 集成测试

```bash
# 端到端测试
npm run test:e2e

# 手动测试清单
# 1. 下载单个视频
# 2. 下载播放列表
# 3. 取消下载
# 4. 删除下载记录
# 5. 播放已下载视频
```

## 性能优化

### 前端优化

```typescript
// 1. 组件懒加载
const VideoPlayer = lazy(() => import('./VideoPlayer'));

// 2. 使用 useMemo/useCallback
const memoizedValue = useMemo(() => compute(value), [value]);

// 3. 虚拟列表 (长列表)
import { VirtualList } from 'react-window';

// 4. 图片/视频懒加载
<img loading="lazy" src={thumbnail} />
```

### Rust 优化

```rust
// 1. 使用 Arc<Mutex<T>> 共享状态
use std::sync::{Arc, Mutex};

// 2. 异步操作使用 tokio
use tokio::time::{sleep, Duration};

// 3. 数据库连接池
let pool = SqlitePoolOptions::new()
    .max_connections(5)
    .connect(&database_url)
    .await?;
```

## 发布流程

### 版本号规范

使用语义化版本: `MAJOR.MINOR.PATCH`

- MAJOR: 不兼容的 API 变更
- MINOR: 向下兼容的功能添加
- PATCH: 向下兼容的问题修复

### 发布步骤

```bash
# 1. 更新版本号
# package.json
# Cargo.toml
# tauri.conf.json

# 2. 更新 CHANGELOG.md

# 3. 创建发布分支
git checkout -b release/v0.2.0

# 4. 测试
npm run test
npm run tauri:build

# 5. 合并到 main
git checkout main
git merge release/v0.2.0

# 6. 打标签
git tag v0.2.0
git push origin v0.2.0

# 7. GitHub Actions 自动构建发布
```

## 故障排除

### 开发服务器崩溃

```bash
# 清理缓存
rm -rf node_modules/.vite
rm -rf src-tauri/target/debug

# 重新启动
npm install
npm run tauri:dev
```

### 类型错误

```bash
# 重新生成类型
npm run type-check

# 检查类型定义
npx tsc --noEmit
```

### 构建失败

```bash
# 清理并重新构建
cargo clean
npm run tauri:build
```

## 学习资源

### 官方文档

- [Tauri Docs](https://tauri.app/v1/guides/)
- [React Docs](https://react.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Tailwind CSS](https://tailwindcss.com/docs)

### 示例项目

- [Tauri Examples](https://github.com/tauri-apps/tauri/tree/dev/examples)
- [Awesome Tauri](https://github.com/tauri-apps/awesome-tauri)

### 社区

- [Tauri Discord](https://discord.gg/tauri)
- [Rust Users Forum](https://users.rust-lang.org/)
- [Reactiflux Discord](https://www.reactiflux.com/)
