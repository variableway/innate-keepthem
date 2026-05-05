use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::path::Path;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub status: DownloadStatus,
    pub progress: f64,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub output_dir: Option<String>,
    pub filename: Option<String>,
    pub subtitles: Vec<String>,
    pub error: Option<String>,
    pub queue_position: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct Database {
    pool: Pool<Sqlite>,
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

    pub async fn new(app: &AppHandle) -> Result<Self, sqlx::Error> {
        let app_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| {
                dirs::data_dir()
                    .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
                    .join("com.vytdl.desktop")
            });

        let db_path = app_dir.join("vytdl.db");
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

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

    pub async fn create_download(&self, record: DownloadRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO downloads (id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, queue_position, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            "#,
        )
        .bind(&record.id)
        .bind(&record.url)
        .bind(&record.title)
        .bind(&record.status)
        .bind(record.progress)
        .bind(&record.speed)
        .bind(&record.eta)
        .bind(&record.output_dir)
        .bind(&record.filename)
        .bind(serde_json::to_string(&record.subtitles).unwrap())
        .bind(&record.error)
        .bind(record.queue_position)
        .bind(record.created_at)
        .bind(record.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_all_downloads(&self) -> Result<Vec<DownloadRecord>, sqlx::Error> {
        let rows = sqlx::query_as::<_, DownloadRow>(
            r#"
            SELECT id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, queue_position, created_at, updated_at
            FROM downloads
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    pub async fn get_download_by_id(&self, id: &str) -> Result<Option<DownloadRecord>, sqlx::Error> {
        let row = sqlx::query_as::<_, DownloadRow>(
            r#"
            SELECT id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, created_at, updated_at
            FROM downloads
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    pub async fn update_download_status(
        &self,
        id: &str,
        status: DownloadStatus,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE downloads
            SET status = ?1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?2
            "#,
        )
        .bind(status)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_download_progress(
        &self,
        id: &str,
        progress: f64,
        speed: Option<&str>,
        eta: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE downloads
            SET progress = ?1, speed = ?2, eta = ?3, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?4
            "#,
        )
        .bind(progress)
        .bind(speed)
        .bind(eta)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_download_complete(
        &self,
        id: &str,
        title: String,
        filename: String,
        subtitles: Vec<String>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE downloads
            SET title = ?1, filename = ?2, subtitles = ?3, status = 'completed', progress = 100.0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?4
            "#,
        )
        .bind(title)
        .bind(filename)
        .bind(serde_json::to_string(&subtitles).unwrap())
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_download_error(&self, id: &str, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE downloads
            SET status = 'failed', error = ?1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?2
            "#,
        )
        .bind(error)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_queue_position(&self, id: &str, position: i64) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE downloads
            SET queue_position = ?1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?2
            "#,
        )
        .bind(position)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete_download(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            DELETE FROM downloads
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // Settings helpers
    pub async fn get_setting(&self, key: &str) -> Result<Option<String>, sqlx::Error> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM settings WHERE key = ?1"
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.0))
    }

    pub async fn set_setting(&self, key: &str, value: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO settings (key, value, updated_at)
            VALUES (?1, ?2, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct DownloadRow {
    id: String,
    url: String,
    title: Option<String>,
    status: DownloadStatus,
    progress: f64,
    speed: Option<String>,
    eta: Option<String>,
    output_dir: Option<String>,
    filename: Option<String>,
    subtitles: String,
    error: Option<String>,
    queue_position: i64,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<DownloadRow> for DownloadRecord {
    fn from(row: DownloadRow) -> Self {
        Self {
            id: row.id,
            url: row.url,
            title: row.title,
            status: row.status,
            progress: row.progress,
            speed: row.speed,
            eta: row.eta,
            output_dir: row.output_dir,
            filename: row.filename,
            subtitles: serde_json::from_str(&row.subtitles).unwrap_or_default(),
            error: row.error,
            queue_position: row.queue_position,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

pub async fn init_db(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::new(app).await?;
    db.init().await?;
    app.manage(db);
    Ok(())
}
