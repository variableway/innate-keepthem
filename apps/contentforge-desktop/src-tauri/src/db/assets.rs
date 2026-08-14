use crate::db::{Asset, Database};

impl Database {
    pub async fn create_asset(&self, asset: &Asset) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO assets (
                id, title, asset_type, status, platform, url, file_path, thumbnail_url,
                description, extracted_text, summary, transcript, translated_text, rewritten_text,
                duration_sec, analysis, tags, pipeline_id, author, published_at, engagement, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
            "#,
        )
        .bind(&asset.id)
        .bind(&asset.title)
        .bind(&asset.asset_type)
        .bind(&asset.status)
        .bind(&asset.platform)
        .bind(&asset.url)
        .bind(&asset.file_path)
        .bind(&asset.thumbnail_url)
        .bind(&asset.description)
        .bind(&asset.extracted_text)
        .bind(&asset.summary)
        .bind(&asset.transcript)
        .bind(&asset.translated_text)
        .bind(&asset.rewritten_text)
        .bind(asset.duration_sec)
        .bind(&asset.analysis)
        .bind(&asset.tags)
        .bind(&asset.pipeline_id)
        .bind(&asset.author)
        .bind(&asset.published_at)
        .bind(&asset.engagement)
        .bind(asset.created_at)
        .bind(asset.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_asset_by_id(&self, id: &str) -> Result<Option<Asset>, sqlx::Error> {
        sqlx::query_as::<_, Asset>(
            "SELECT * FROM assets WHERE id = ?1"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    pub async fn search_assets(
        &self,
        query: Option<&str>,
        asset_type: Option<&str>,
        status: Option<&str>,
        platform: Option<&str>,
        tags: Option<&str>,
        sort_field: &str,
        sort_order: &str,
        page: i64,
        page_size: i64,
    ) -> Result<(Vec<Asset>, i64), sqlx::Error> {
        let offset = (page - 1) * page_size;

        // Build dynamic WHERE clause
        let mut conditions = vec!["1=1".to_string()];
        if let Some(q) = query {
            if !q.is_empty() {
                conditions.push(format!(
                    "(title LIKE '%{}%' OR description LIKE '%{}%' OR extracted_text LIKE '%{}%' OR summary LIKE '%{}%')",
                    q, q, q, q
                ));
            }
        }
        if let Some(t) = asset_type {
            conditions.push(format!("asset_type = '{}'", t));
        }
        if let Some(s) = status {
            conditions.push(format!("status = '{}'", s));
        }
        if let Some(p) = platform {
            conditions.push(format!("platform = '{}'", p));
        }
        if let Some(t) = tags {
            conditions.push(format!("tags LIKE '%{}%'", t));
        }

        let where_clause = conditions.join(" AND ");
        let order_clause = format!("{} {}", sort_field, sort_order);

        let count_sql = format!("SELECT COUNT(*) FROM assets WHERE {}", where_clause);
        let total: (i64,) = sqlx::query_as(&count_sql)
            .fetch_one(&self.pool)
            .await?;

        let query_sql = format!(
            "SELECT * FROM assets WHERE {} ORDER BY {} LIMIT ?1 OFFSET ?2",
            where_clause, order_clause
        );
        let assets = sqlx::query_as::<_, Asset>(&query_sql)
            .bind(page_size)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?;

        Ok((assets, total.0))
    }

    pub async fn delete_asset(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM assets WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_asset_tags(&self, id: &str, tags: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE assets SET tags = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2"
        )
        .bind(tags)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_asset_groups(&self) -> Result<Vec<(String, String, i64)>, sqlx::Error> {
        let mut groups = Vec::new();

        // Group by type
        let type_groups: Vec<(String, i64)> = sqlx::query_as(
            "SELECT asset_type, COUNT(*) FROM assets GROUP BY asset_type"
        )
        .fetch_all(&self.pool)
        .await?;
        for (t, count) in type_groups {
            groups.push(("type".to_string(), t, count));
        }

        // Group by platform
        let platform_groups: Vec<(Option<String>, i64)> = sqlx::query_as(
            "SELECT platform, COUNT(*) FROM assets GROUP BY platform"
        )
        .fetch_all(&self.pool)
        .await?;
        for (p, count) in platform_groups {
            if let Some(p) = p {
                groups.push(("platform".to_string(), p, count));
            }
        }

        // Group by status
        let status_groups: Vec<(String, i64)> = sqlx::query_as(
            "SELECT status, COUNT(*) FROM assets GROUP BY status"
        )
        .fetch_all(&self.pool)
        .await?;
        for (s, count) in status_groups {
            groups.push(("status".to_string(), s, count));
        }

        Ok(groups)
    }
}
