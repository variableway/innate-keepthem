use chrono::{DateTime, Utc};

use crate::db::{Database, DownloadRecord, DownloadStatus, VttReport};

// Internal row mapping struct for downloads
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
    options: Option<String>,
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
            options: row.options,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl Database {
    // ─── Downloads ───

    pub async fn create_download(&self, record: DownloadRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO downloads (id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, queue_position, options, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
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
        .bind(&record.options)
        .bind(record.created_at)
        .bind(record.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_all_downloads(&self) -> Result<Vec<DownloadRecord>, sqlx::Error> {
        let rows = sqlx::query_as::<_, DownloadRow>(
            r#"
            SELECT id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, queue_position, options, created_at, updated_at
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
            SELECT id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, queue_position, options, created_at, updated_at
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
        title: Option<String>,
        filename: Option<String>,
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

    pub async fn get_incomplete_downloads(&self) -> Result<Vec<DownloadRecord>, sqlx::Error> {
        let rows = sqlx::query_as::<_, DownloadRow>(
            r#"
            SELECT id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, queue_position, options, created_at, updated_at
            FROM downloads
            WHERE status IN ('pending', 'downloading')
            ORDER BY created_at ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    // ─── VTT Reports ───

    pub async fn create_vtt_report(&self, report: &VttReport) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO vtt_reports (
                id, youtube_url, video_id, title, language, content,
                cue_count, duration_sec, created_at, status, error
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
        )
        .bind(&report.id)
        .bind(&report.youtube_url)
        .bind(&report.video_id)
        .bind(&report.title)
        .bind(&report.language)
        .bind(&report.content)
        .bind(report.cue_count)
        .bind(report.duration_sec)
        .bind(report.created_at)
        .bind(&report.status)
        .bind(&report.error)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_vtt_report(&self, id: &str) -> Result<Option<VttReport>, sqlx::Error> {
        sqlx::query_as::<_, VttReport>(
            "SELECT * FROM vtt_reports WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn list_vtt_reports(
        &self,
        page: u32,
        limit: u32,
        lang: Option<&str>,
    ) -> Result<(Vec<VttReport>, i64), sqlx::Error> {
        let offset = ((page.saturating_sub(1)) * limit) as i64;
        let limit = limit as i64;

        let (reports, total) = if let Some(lang) = lang {
            let total: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM vtt_reports WHERE language = ?1",
            )
            .bind(lang)
            .fetch_one(&self.pool)
            .await?;

            let reports = sqlx::query_as::<_, VttReport>(
                "SELECT * FROM vtt_reports WHERE language = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3",
            )
            .bind(lang)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

            (reports, total.0)
        } else {
            let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM vtt_reports")
                .fetch_one(&self.pool)
                .await?;

            let reports = sqlx::query_as::<_, VttReport>(
                "SELECT * FROM vtt_reports ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

            (reports, total.0)
        };

        Ok((reports, total))
    }

    pub async fn update_vtt_report(
        &self,
        id: &str,
        title: Option<&str>,
        language: Option<&str>,
        content: Option<&str>,
        cue_count: Option<i64>,
        duration_sec: Option<f64>,
        video_id: Option<&str>,
        status: Option<&str>,
        error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        if let Some(title) = title {
            sqlx::query("UPDATE vtt_reports SET title = ?1 WHERE id = ?2")
                .bind(title)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        if let Some(language) = language {
            sqlx::query("UPDATE vtt_reports SET language = ?1 WHERE id = ?2")
                .bind(language)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        if let Some(content) = content {
            sqlx::query("UPDATE vtt_reports SET content = ?1 WHERE id = ?2")
                .bind(content)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        if let Some(cue_count) = cue_count {
            sqlx::query("UPDATE vtt_reports SET cue_count = ?1 WHERE id = ?2")
                .bind(cue_count)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        if let Some(duration_sec) = duration_sec {
            sqlx::query("UPDATE vtt_reports SET duration_sec = ?1 WHERE id = ?2")
                .bind(duration_sec)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        if let Some(video_id) = video_id {
            sqlx::query("UPDATE vtt_reports SET video_id = ?1 WHERE id = ?2")
                .bind(video_id)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        if let Some(status) = status {
            sqlx::query("UPDATE vtt_reports SET status = ?1 WHERE id = ?2")
                .bind(status)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        if let Some(error) = error {
            sqlx::query("UPDATE vtt_reports SET error = ?1 WHERE id = ?2")
                .bind(error)
                .bind(id)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    pub async fn delete_vtt_report(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM vtt_reports WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
