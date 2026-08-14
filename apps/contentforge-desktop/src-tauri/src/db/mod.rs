use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::Manager;

use sqlx::{Pool, Sqlite};
use std::path::Path;

pub mod types;
pub mod agent_switches;
pub mod assets;
pub mod downloads;
pub mod messages;
pub mod pipeline_runs;
pub mod sessions;
pub mod settings;

pub use types::*;

#[derive(Clone)]
pub struct Database {
    pub(crate) pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new_with_path(db_path: &Path) -> Result<Self, sqlx::Error> {
        let parent = db_path.parent().ok_or_else(|| {
            sqlx::Error::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Invalid database path: no parent directory",
            ))
        })?;

        std::fs::create_dir_all(parent).map_err(|e| {
            sqlx::Error::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create database directory: {}", e),
            ))
        })?;

        let options = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        Ok(Self { pool })
    }

    pub async fn new(app: &tauri::AppHandle) -> Result<Self, sqlx::Error> {
        let app_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| {
                dirs::data_dir()
                    .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
                    .join("com.contentforge.desktop")
            });

        let db_path = app_dir.join("contentforge.db");
        Self::new_with_path(&db_path).await
    }

    pub async fn new_in_memory() -> Result<Self, sqlx::Error> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new())
            .await?;
        Ok(Self { pool })
    }

    pub async fn init(&self) -> Result<(), sqlx::Error> {
        // Sessions table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                agent_id TEXT NOT NULL DEFAULT 'general',
                status TEXT NOT NULL DEFAULT 'active',
                linked_task_id TEXT,
                linked_asset_ids TEXT DEFAULT '[]',
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Messages table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'completed',
                model TEXT,
                tokens_used TEXT,
                tool_calls TEXT,
                tool_results TEXT,
                selected_asset_ids TEXT,
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Assets table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                asset_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ingested',
                platform TEXT,
                url TEXT,
                file_path TEXT,
                thumbnail_url TEXT,
                description TEXT,
                extracted_text TEXT,
                summary TEXT,
                transcript TEXT,
                translated_text TEXT,
                rewritten_text TEXT,
                duration_sec REAL,
                analysis TEXT,
                tags TEXT DEFAULT '[]',
                pipeline_id TEXT,
                author TEXT,
                published_at TEXT,
                engagement TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Settings table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Agent switch history
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS agent_switches (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                from_agent_id TEXT NOT NULL,
                to_agent_id TEXT NOT NULL,
                reason TEXT,
                triggered_by TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Pipeline runs table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id TEXT PRIMARY KEY,
                pipeline_id TEXT NOT NULL,
                asset_id TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                progress REAL DEFAULT 0.0,
                current_step TEXT,
                step_results TEXT,
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Downloads table (from vYtDL)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS downloads (
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
                queue_position INTEGER DEFAULT 0,
                options TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // VTT reports table (from vYtDL)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS vtt_reports (
                id TEXT PRIMARY KEY,
                youtube_url TEXT NOT NULL,
                video_id TEXT,
                title TEXT,
                language TEXT,
                content TEXT NOT NULL DEFAULT '',
                cue_count INTEGER DEFAULT 0,
                duration_sec REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT NOT NULL DEFAULT 'pending',
                error TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create indexes for performance
        let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type)")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status)")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)")
            .execute(&self.pool)
            .await;

        Ok(())
    }

    pub fn pool(&self) -> &Pool<Sqlite> {
        &self.pool
    }
}
