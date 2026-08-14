use crate::db::{Database, PipelineRun};

impl Database {
    pub async fn create_pipeline_run(&self, run: &PipelineRun) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO pipeline_runs (id, pipeline_id, asset_id, status, progress, current_step, step_results, error, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
        )
        .bind(&run.id)
        .bind(&run.pipeline_id)
        .bind(&run.asset_id)
        .bind(&run.status)
        .bind(run.progress)
        .bind(&run.current_step)
        .bind(&run.step_results)
        .bind(&run.error)
        .bind(run.created_at)
        .bind(run.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_pipeline_run_by_id(&self, id: &str) -> Result<Option<PipelineRun>, sqlx::Error> {
        sqlx::query_as::<_, PipelineRun>(
            "SELECT * FROM pipeline_runs WHERE id = ?1"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn update_pipeline_run_progress(
        &self,
        id: &str,
        progress: f64,
        current_step: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE pipeline_runs SET progress = ?1, current_step = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3"
        )
        .bind(progress)
        .bind(current_step)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_pipeline_run_status(
        &self,
        id: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE pipeline_runs SET status = ?1, error = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3"
        )
        .bind(status)
        .bind(error)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
