use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{Asset, AssetStatus, Database};
use crate::commands::ApiResponse;

// ─────────────────────────── Asset Types ───────────────────────────

#[derive(Debug, Serialize)]
pub struct ContentAssetOut {
    pub id: String,
    pub asset_type: String,
    pub title: String,
    pub description: Option<String>,
    pub source: AssetSourceOut,
    pub extracted_text: Option<String>,
    pub summary: Option<String>,
    pub transcript: Option<String>,
    pub translated_text: Option<String>,
    pub rewritten_text: Option<String>,
    pub file_path: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_sec: Option<f64>,
    pub analysis: Option<serde_json::Value>,
    pub status: String,
    pub tags: Vec<String>,
    pub pipeline_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct AssetSourceOut {
    pub platform: String,
    pub url: String,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub engagement: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct SearchAssetsRequest {
    pub filter: Option<serde_json::Value>,
    pub sort: Option<serde_json::Value>,
    pub pagination: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct GetAssetDetailRequest {
    pub asset_id: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteAssetRequest {
    pub asset_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAssetTagsRequest {
    pub asset_id: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddAssetToSessionRequest {
    pub asset_id: String,
    pub session_id: String,
}

// ─────────────────────────── Helpers ───────────────────────────

fn asset_to_out(a: Asset) -> ContentAssetOut {
    let platform = a.platform.clone().unwrap_or_else(|| "unknown".to_string());
    let url = a.url.clone().unwrap_or_default();
    ContentAssetOut {
        id: a.id.clone(),
        asset_type: a.asset_type.clone(),
        title: a.title,
        description: a.description,
        source: AssetSourceOut {
            platform: platform.clone(),
            url,
            author: a.author.clone(),
            published_at: a.published_at.clone(),
            engagement: a.engagement.as_ref().and_then(|e| serde_json::from_str(e).ok()),
        },
        extracted_text: a.extracted_text,
        summary: a.summary,
        transcript: a.transcript,
        translated_text: a.translated_text,
        rewritten_text: a.rewritten_text,
        file_path: a.file_path,
        thumbnail_url: a.thumbnail_url,
        duration_sec: a.duration_sec,
        analysis: a.analysis.as_ref().and_then(|a| serde_json::from_str(a).ok()),
        status: match a.status {
            AssetStatus::Ingested => "ingested".to_string(),
            AssetStatus::Processing => "processing".to_string(),
            AssetStatus::Processed => "processed".to_string(),
            AssetStatus::Ready => "ready".to_string(),
            AssetStatus::Published => "published".to_string(),
            AssetStatus::Failed => "failed".to_string(),
        },
        tags: serde_json::from_str(&a.tags).unwrap_or_default(),
        pipeline_id: a.pipeline_id,
        created_at: a.created_at.to_rfc3339(),
        updated_at: a.updated_at.to_rfc3339(),
    }
}

// ─────────────────────────── Asset Commands ───────────────────────────

#[tauri::command]
pub async fn search_assets(
    db: State<'_, Database>,
    request: SearchAssetsRequest,
) -> Result<ApiResponse<serde_json::Value>, String> {
    let filter = request.filter.as_ref();
    let query = filter
        .and_then(|f| f.get("query"))
        .and_then(|v| v.as_str());
    let asset_type = filter
        .and_then(|f| f.get("type"))
        .and_then(|v| v.as_str());
    let status = filter
        .and_then(|f| f.get("status"))
        .and_then(|v| v.as_str());
    let platform = filter
        .and_then(|f| f.get("platform"))
        .and_then(|v| v.as_str());
    let tags = filter
        .and_then(|f| f.get("tags"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str());

    let sort = request.sort.as_ref();
    let sort_field = sort
        .and_then(|s| s.get("field"))
        .and_then(|v| v.as_str())
        .unwrap_or("updated_at");
    let sort_order = sort
        .and_then(|s| s.get("order"))
        .and_then(|v| v.as_str())
        .unwrap_or("desc");

    let pagination = request.pagination.as_ref();
    let page = pagination
        .and_then(|p| p.get("page"))
        .and_then(|v| v.as_i64())
        .unwrap_or(1);
    let page_size = pagination
        .and_then(|p| p.get("pageSize"))
        .and_then(|v| v.as_i64())
        .unwrap_or(20)
        .clamp(1, 100);

    let safe_sort_field = match sort_field {
        "createdAt" => "created_at",
        "updatedAt" => "updated_at",
        "title" => "title",
        _ => "updated_at",
    };
    let safe_sort_order = if sort_order == "asc" { "ASC" } else { "DESC" };

    match db
        .search_assets(query, asset_type, status, platform, tags, safe_sort_field, safe_sort_order, page, page_size)
        .await
    {
        Ok((assets, total)) => {
            let out: Vec<ContentAssetOut> = assets.into_iter().map(asset_to_out).collect();
            let has_more = out.len() as i64 >= page_size;
            Ok(ApiResponse::ok(serde_json::json!({
                "assets": out,
                "total": total,
                "page": page,
                "pageSize": page_size,
                "hasMore": has_more,
            })))
        }
        Err(e) => Ok(ApiResponse::err(format!("Failed to search assets: {}", e))),
    }
}

#[tauri::command]
pub async fn get_asset_detail(
    db: State<'_, Database>,
    request: GetAssetDetailRequest,
) -> Result<ApiResponse<ContentAssetOut>, String> {
    match db.get_asset_by_id(&request.asset_id).await {
        Ok(Some(asset)) => Ok(ApiResponse::ok(asset_to_out(asset))),
        Ok(None) => Ok(ApiResponse::err("Asset not found".to_string())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to get asset: {}", e))),
    }
}

#[tauri::command]
pub async fn delete_asset(
    db: State<'_, Database>,
    request: DeleteAssetRequest,
) -> Result<ApiResponse<()>, String> {
    match db.delete_asset(&request.asset_id).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to delete asset: {}", e))),
    }
}

#[tauri::command]
pub async fn update_asset_tags(
    db: State<'_, Database>,
    request: UpdateAssetTagsRequest,
) -> Result<ApiResponse<()>, String> {
    let tags_json = serde_json::to_string(&request.tags).unwrap_or_else(|_| "[]".to_string());
    match db.update_asset_tags(&request.asset_id, &tags_json).await {
        Ok(_) => Ok(ApiResponse::ok(())),
        Err(e) => Ok(ApiResponse::err(format!("Failed to update tags: {}", e))),
    }
}

#[tauri::command]
pub async fn add_asset_to_session(
    db: State<'_, Database>,
    request: AddAssetToSessionRequest,
) -> Result<ApiResponse<()>, String> {
    match db.get_session_by_id(&request.session_id).await {
        Ok(Some(session)) => {
            let mut linked: Vec<String> = serde_json::from_str(&session.linked_asset_ids).unwrap_or_default();
            if !linked.contains(&request.asset_id) {
                linked.push(request.asset_id);
                let linked_json = serde_json::to_string(&linked).unwrap_or_else(|_| "[]".to_string());
                match db
                    .update_session(&request.session_id, |s| {
                        s.linked_asset_ids = linked_json;
                    })
                    .await
                {
                    Ok(_) => Ok(ApiResponse::ok(())),
                    Err(e) => Ok(ApiResponse::err(format!("Failed to update session: {}", e))),
                }
            } else {
                Ok(ApiResponse::ok(()))
            }
        }
        Ok(None) => Ok(ApiResponse::err("Session not found".to_string())),
        Err(e) => Ok(ApiResponse::err(format!("Database error: {}", e))),
    }
}

#[tauri::command]
pub async fn get_asset_groups(
    db: State<'_, Database>,
) -> Result<ApiResponse<serde_json::Value>, String> {
    match db.get_asset_groups().await {
        Ok(groups) => {
            let out: Vec<serde_json::Value> = groups
                .into_iter()
                .map(|(group_type, value, count)| {
                    serde_json::json!({
                        "id": format!("{}-{}", group_type, value),
                        "label": value,
                        "type": group_type,
                        "value": value,
                        "assetIds": [],
                        "count": count,
                    })
                })
                .collect();
            Ok(ApiResponse::ok(serde_json::json!({ "groups": out })))
        }
        Err(e) => Ok(ApiResponse::err(format!("Failed to get groups: {}", e))),
    }
}
