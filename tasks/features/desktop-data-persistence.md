# Feature: Data Persistence & Settings

## 概述
实现应用数据的持久化存储，包括下载记录、用户设置和应用状态。

## 关联代码
- `vYtDL-desktop/src-tauri/src/database.rs`
- `vYtDL-desktop/src/stores/*.ts`
- `vYtDL-desktop/src/components/SettingsPage.tsx`

## 子任务

### 5.1 SQLite 数据库
**优先级**: P0
**状态**: ✅ 已完成

**表结构**:

```sql
-- 下载记录表
CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    progress REAL DEFAULT 0.0,
    speed TEXT,
    eta TEXT,
    output_dir TEXT,
    filename TEXT,
    subtitles TEXT DEFAULT '[]',
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 设置表
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Rust 实现**: `database.rs`

### 5.2 下载记录管理
**优先级**: P0
**状态**: ✅ 已完成

- [x] 创建下载记录
- [x] 更新状态/进度
- [x] 查询所有记录
- [x] 查询单条记录
- [x] 删除记录
- [x] 分页查询 (预留)

**CRUD 操作**:
```rust
impl Database {
    pub async fn create_download(&self, record: DownloadRecord) -> Result<(), sqlx::Error>;
    pub async fn get_all_downloads(&self) -> Result<Vec<DownloadRecord>, sqlx::Error>;
    pub async fn update_download_status(&self, id: &str, status: DownloadStatus) -> Result<(), sqlx::Error>;
    pub async fn update_download_progress(&self, id: &str, progress: f64, speed: Option<&str>, eta: Option<&str>) -> Result<(), sqlx::Error>;
    pub async fn delete_download(&self, id: &str) -> Result<(), sqlx::Error>;
}
```

### 5.3 用户设置存储
**优先级**: P0
**状态**: ✅ 已完成

**设置项**:
```typescript
interface Settings {
  // 下载设置
  yt_dlp_path: string | null;
  default_output_dir: string | null;
  default_quality: string;
  default_format: string;
  default_sub_langs: string[];
  
  // AI 设置
  ai_provider: string | null;
  ai_api_key: string | null;
  ai_model: string | null;
}
```

**存储策略**:
- SQLite 优先 (设置表)
- 本地文件备份 (config.json)

### 5.4 应用状态管理
**优先级**: P0
**状态**: ✅ 已完成

**Zustand Stores**:
- `downloadStore.ts` - 下载状态
- `settingsStore.ts` - 设置状态

**状态持久化**:
```typescript
// 自动同步到后端
const useDownloadStore = create<DownloadState>((set, get) => ({
  // ...
  startDownload: async (options) => {
    const id = await invoke("start_download", { options });
    // 自动更新本地状态
    get().fetchDownloads();
    return id;
  },
}));
```

### 5.5 数据迁移
**优先级**: P2
**状态**: ⏳ 待实现

- [ ] 版本控制 (schema_version)
- [ ] 自动迁移脚本
- [ ] 数据备份/恢复

**迁移示例**:
```rust
async fn migrate_v1_to_v2(db: &Database) -> Result<(), sqlx::Error> {
    sqlx::query(
        "ALTER TABLE downloads ADD COLUMN thumbnail TEXT"
    ).execute(&db.pool).await?;
    
    sqlx::query(
        "UPDATE schema_version SET version = 2"
    ).execute(&db.pool).await?;
    
    Ok(())
}
```

### 5.6 数据导出/导入
**优先级**: P2
**状态**: ⏳ 待实现

- [ ] 导出为 JSON/CSV
- [ ] 从文件导入
- [ ] 跨设备同步 (预留)

## 数据库位置

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/com.vytdl.desktop/vytdl.db` |
| Windows | `%APPDATA%/vYtDL Desktop/vytdl.db` |
| Linux | `~/.local/share/vYtDL Desktop/vytdl.db` |

## 性能优化

1. **索引**:
   ```sql
   CREATE INDEX idx_downloads_status ON downloads(status);
   CREATE INDEX idx_downloads_created_at ON downloads(created_at);
   ```

2. **批量操作**:
   - 批量插入使用事务
   - 分页查询 (LIMIT/OFFSET)

3. **缓存策略**:
   - 前端 Zustand 缓存
   - 后端查询结果缓存

## 数据备份

**手动备份**:
```bash
# macOS/Linux
cp ~/Library/Application\ Support/com.vytdl.desktop/vytdl.db ~/vytdl-backup.db

# Windows
copy "%APPDATA%\vYtDL Desktop\vytdl.db" "%USERPROFILE%\vytdl-backup.db"
```

**自动备份** (预留):
- 每周自动备份
- 保留最近 5 个备份

## 测试要点

1. **数据完整性**
   - 并发写入测试
   - 异常关闭恢复
   - 大容量数据测试 (10K+ 记录)

2. **迁移测试**
   - 旧版本数据兼容
   - 迁移失败回滚

3. **性能测试**
   - 查询响应时间 (< 100ms)
   - 批量插入性能
