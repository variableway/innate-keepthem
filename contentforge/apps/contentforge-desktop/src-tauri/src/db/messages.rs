use crate::db::{Database, Message, MessageStatus};

impl Database {
    pub async fn create_message(&self, message: &Message) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO messages (id, session_id, role, content, status, model, tokens_used, tool_calls, tool_results, selected_asset_ids, error, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            "#,
        )
        .bind(&message.id)
        .bind(&message.session_id)
        .bind(&message.role)
        .bind(&message.content)
        .bind(&message.status)
        .bind(&message.model)
        .bind(&message.tokens_used)
        .bind(&message.tool_calls)
        .bind(&message.tool_results)
        .bind(&message.selected_asset_ids)
        .bind(&message.error)
        .bind(message.created_at)
        .bind(message.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_messages_by_session(
        &self,
        session_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Message>, sqlx::Error> {
        sqlx::query_as::<_, Message>(
            "SELECT * FROM messages WHERE session_id = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3"
        )
        .bind(session_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn get_message_by_id(&self, id: &str) -> Result<Option<Message>, sqlx::Error> {
        sqlx::query_as::<_, Message>(
            "SELECT * FROM messages WHERE id = ?1"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn update_message_content(&self, id: &str, content: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE messages SET content = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2"
        )
        .bind(content)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_message_status(&self, id: &str, status: MessageStatus) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE messages SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2"
        )
        .bind(status)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_message_error(&self, id: &str, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE messages SET error = ?1, status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?2"
        )
        .bind(error)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_message(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM messages WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
