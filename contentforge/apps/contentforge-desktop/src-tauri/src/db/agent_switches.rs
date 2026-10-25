use crate::db::{AgentSwitchRecord, Database};

impl Database {
    pub async fn record_agent_switch(&self, record: &AgentSwitchRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO agent_switches (id, session_id, from_agent_id, to_agent_id, reason, triggered_by, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
        )
        .bind(&record.id)
        .bind(&record.session_id)
        .bind(&record.from_agent_id)
        .bind(&record.to_agent_id)
        .bind(&record.reason)
        .bind(&record.triggered_by)
        .bind(record.created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_agent_switches_by_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<AgentSwitchRecord>, sqlx::Error> {
        sqlx::query_as::<_, AgentSwitchRecord>(
            "SELECT * FROM agent_switches WHERE session_id = ?1 ORDER BY created_at DESC"
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await
    }
}
