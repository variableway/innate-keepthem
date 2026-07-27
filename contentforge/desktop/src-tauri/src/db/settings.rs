use crate::db::Database;

impl Database {
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

    pub async fn get_all_settings(&self) -> Result<Vec<(String, String)>, sqlx::Error> {
        sqlx::query_as::<_, (String, String)>(
            "SELECT key, value FROM settings ORDER BY key"
        )
        .fetch_all(&self.pool)
        .await
    }
}
