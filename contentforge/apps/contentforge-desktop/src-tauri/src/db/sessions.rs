use crate::db::{Database, Session, SessionStatus};

impl Database {
    pub async fn create_session(&self, session: &Session) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO sessions (id, title, agent_id, status, linked_task_id, linked_asset_ids, metadata, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
        )
        .bind(&session.id)
        .bind(&session.title)
        .bind(&session.agent_id)
        .bind(&session.status)
        .bind(&session.linked_task_id)
        .bind(&session.linked_asset_ids)
        .bind(&session.metadata)
        .bind(session.created_at)
        .bind(session.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_sessions(&self) -> Result<Vec<Session>, sqlx::Error> {
        sqlx::query_as::<_, Session>(
            "SELECT * FROM sessions ORDER BY updated_at DESC"
        )
        .fetch_all(&self.pool)
        .await
    }

    pub async fn get_session_by_id(&self, id: &str) -> Result<Option<Session>, sqlx::Error> {
        sqlx::query_as::<_, Session>(
            "SELECT * FROM sessions WHERE id = ?1"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn update_session_status(&self, id: &str, status: SessionStatus) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE sessions SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2"
        )
        .bind(status)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_session_title(&self, id: &str, title: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE sessions SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2"
        )
        .bind(title)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_session_agent(&self, id: &str, agent_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE sessions SET agent_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2"
        )
        .bind(agent_id)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_session(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM sessions WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Generic session updater for partial updates.
    pub async fn update_session<F>(&self, id: &str, updater: F) -> Result<(), sqlx::Error>
    where
        F: FnOnce(&mut Session),
    {
        let mut session = self
            .get_session_by_id(id)
            .await?
            .ok_or_else(|| sqlx::Error::RowNotFound)?;
        updater(&mut session);
        sqlx::query(
            "UPDATE sessions SET title = ?1, agent_id = ?2, status = ?3, linked_task_id = ?4, linked_asset_ids = ?5, metadata = ?6, updated_at = CURRENT_TIMESTAMP WHERE id = ?7"
        )
        .bind(&session.title)
        .bind(&session.agent_id)
        .bind(&session.status)
        .bind(&session.linked_task_id)
        .bind(&session.linked_asset_ids)
        .bind(&session.metadata)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
