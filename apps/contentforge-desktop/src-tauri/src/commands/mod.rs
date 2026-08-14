use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

pub mod agent;
pub mod ai;
pub mod asset;
pub mod chat;
pub mod download;
pub mod settings;
pub mod video;

// Re-export all command functions so lib.rs can reference them easily
pub use agent::*;
pub use ai::*;
pub use asset::*;
pub use chat::*;
pub use download::*;
pub use settings::*;
pub use video::*;
