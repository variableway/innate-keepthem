use serde::{Deserialize, Serialize};
use std::path::Path;

/// Content asset types supported by ContentForge
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetType {
    Video,
    Article,
    Tweet,
    Thread,
    Audio,
    Image,
    Note,
}

/// Content asset processing status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetStatus {
    Ingested,
    Processing,
    Processed,
    Ready,
    Published,
    Failed,
}

/// Source platform for content assets
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetPlatform {
    Youtube,
    Twitter,
    Rss,
    Web,
    Local,
    Bilibili,
    Podcast,
    Unknown,
}

/// Asset source information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetSource {
    pub platform: AssetPlatform,
    pub url: String,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub engagement: Option<EngagementData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngagementData {
    pub likes: Option<i64>,
    pub replies: Option<i64>,
    pub reposts: Option<i64>,
    pub views: Option<i64>,
}

/// Asset analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetAnalysis {
    pub topics: Vec<String>,
    pub keywords: Vec<String>,
    pub entities: Vec<String>,
    pub sentiment: SentimentScore,
    pub quality_score: f64,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentimentScore {
    pub label: String,
    pub confidence: f64,
}

/// Pipeline step definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStep {
    pub id: String,
    pub name: String,
    pub step_type: String,
    pub config: serde_json::Value,
    pub depends_on: Vec<String>,
}

/// Pipeline definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pipeline {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub steps: Vec<PipelineStep>,
    pub created_at: String,
    pub updated_at: String,
}

/// Extract text from various content types
pub async fn extract_text_from_file(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "txt" | "md" | "markdown" => tokio::fs::read_to_string(path)
            .await
            .map_err(|e| format!("Failed to read text file: {}", e)),
        "json" => {
            let content = tokio::fs::read_to_string(path)
                .await
                .map_err(|e| format!("Failed to read JSON file: {}", e))?;
            // Try to extract text from common JSON structures
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(text) = json.get("text").and_then(|v| v.as_str()) {
                    Ok(text.to_string())
                } else if let Some(content) = json.get("content").and_then(|v| v.as_str()) {
                    Ok(content.to_string())
                } else {
                    Ok(content)
                }
            } else {
                Ok(content)
            }
        }
        "html" | "htm" => {
            let content = tokio::fs::read_to_string(path)
                .await
                .map_err(|e| format!("Failed to read HTML file: {}", e))?;
            // Simple HTML tag stripping
            Ok(strip_html_tags(&content))
        }
        _ => Err(format!(
            "Unsupported file type for text extraction: {}",
            extension
        )),
    }
}

/// Strip HTML tags from text (simple implementation)
fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;

    for ch in html.chars() {
        if ch == '<' {
            in_tag = true;
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag {
            result.push(ch);
        }
    }

    result
}

/// Generate a summary from text content
pub fn generate_summary(text: &str, max_length: usize) -> String {
    if text.len() <= max_length {
        return text.to_string();
    }

    // Simple sentence-based summarization
    let sentences: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?')
        .filter(|s| !s.trim().is_empty())
        .collect();

    if sentences.is_empty() {
        return text.chars().take(max_length).collect::<String>() + "...";
    }

    let mut summary = String::new();
    for sentence in sentences {
        if summary.len() + sentence.len() + 2 > max_length {
            break;
        }
        if !summary.is_empty() {
            summary.push_str(". ");
        }
        summary.push_str(sentence.trim());
    }

    if summary.is_empty() {
        text.chars().take(max_length).collect::<String>() + "..."
    } else {
        summary + "."
    }
}

/// Detect language from text (simple heuristic)
pub fn detect_language(text: &str) -> Option<String> {
    if text.is_empty() {
        return None;
    }

    // Check for Chinese characters
    let has_chinese = text.chars().any(|c| matches!(c, '\u{4e00}'..='\u{9fff}'));
    if has_chinese {
        return Some("zh".to_string());
    }

    // Check for Japanese characters
    let has_japanese = text
        .chars()
        .any(|c| matches!(c, '\u{3040}'..='\u{309f}' | '\u{30a0}'..='\u{30ff}'));
    if has_japanese {
        return Some("ja".to_string());
    }

    // Check for Korean characters
    let has_korean = text.chars().any(|c| matches!(c, '\u{ac00}'..='\u{d7af}'));
    if has_korean {
        return Some("ko".to_string());
    }

    // Default to English
    Some("en".to_string())
}

/// Extract keywords from text (simple frequency-based)
pub fn extract_keywords(text: &str, max_keywords: usize) -> Vec<String> {
    use std::collections::HashMap;

    // Simple stop words list
    let stop_words: std::collections::HashSet<&str> = [
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
        "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall",
        "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
        "from", "as", "into", "through", "during", "before", "after", "above", "below", "between",
        "under", "and", "but", "or", "yet", "so", "if", "because", "although", "though", "while",
        "where", "when", "that", "which", "who", "whom", "whose", "what", "this", "these", "those",
        "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my",
        "your", "his", "its", "our", "their",
    ]
    .iter()
    .cloned()
    .collect();

    let mut word_counts: HashMap<String, usize> = HashMap::new();

    for word in text.to_lowercase().split_whitespace() {
        let cleaned: String = word.chars().filter(|c| c.is_alphanumeric()).collect();

        if cleaned.len() > 2 && !stop_words.contains(cleaned.as_str()) {
            *word_counts.entry(cleaned).or_insert(0) += 1;
        }
    }

    let mut keywords: Vec<(String, usize)> = word_counts.into_iter().collect();
    keywords.sort_by(|a, b| b.1.cmp(&a.1));

    keywords
        .into_iter()
        .take(max_keywords)
        .map(|(word, _)| word)
        .collect()
}
