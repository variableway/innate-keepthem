use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::path::Path;
use tauri::Manager;

pub struct Database {
    pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new(app: &tauri::App) -> Result<Self, sqlx::Error> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| sqlx::Error::Configuration(Box::new(e)))?;

        std::fs::create_dir_all(&app_data_dir).map_err(|e| sqlx::Error::Io(e))?;

        let db_path = app_data_dir.join("contentforge.db");
        let db_url = format!("sqlite:{}", db_path.to_string_lossy());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await?;

        Ok(Self { pool })
    }

    pub async fn new_with_path(path: &Path) -> Result<Self, sqlx::Error> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| sqlx::Error::Io(e))?;
        }

        let db_url = format!("sqlite:{}", path.to_string_lossy());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await?;

        Ok(Self { pool })
    }

    pub async fn new_in_memory() -> Result<Self, sqlx::Error> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect("sqlite::memory:")
            .await?;

        Ok(Self { pool })
    }

    pub async fn init(&self) -> Result<(), sqlx::Error> {
        // Create sessions table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create messages table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create assets table
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
                extracted_text TEXT,
                summary TEXT,
                tags TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create settings table
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

        Ok(())
    }

    pub fn pool(&self) -> &Pool<Sqlite> {
        &self.pool
    }
}

impl Clone for Database {
    fn clone(&self) -> Self {
        Self {
            pool: self.pool.clone(),
        }
    }
}
