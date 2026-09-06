export type DownloadStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface Download {
  id: string;
  url: string;
  title: string | null;
  status: DownloadStatus;
  progress: number;
  speed: string | null;
  eta: string | null;
  output_dir: string | null;
  filename: string | null;
  subtitles: string[];
  error: string | null;
  queue_position: number;
  created_at: string;
  updated_at: string;
}

export interface DownloadProgress {
  video_id: string | null;
  title: string | null;
  percent: number;
  speed: string | null;
  eta: string | null;
  status: string;
  error: string | null;
  /** 视频/音频双进度槽（CSV format_id 路由） */
  video_percent?: number;
  audio_percent?: number;
}

export interface DownloadLog {
  level: string;
  message: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  uploader: string | null;
  formats: VideoFormat[];
}

export interface VideoFormat {
  format_id: string;
  quality: string;
  resolution: string | null;
  filesize: number | null;
}

export type CookieConfig =
  | { mode: "none" }
  | { mode: "text"; content: string }
  | { mode: "file"; path: string }
  | { mode: "browser"; browser: string };

export interface DownloadOptions {
  url: string;
  is_playlist: boolean;
  quality?: string;
  /** 精确 format_id（Format Picker） */
  format_id?: string;
  format?: string;
  output_dir?: string;
  sub_langs?: string[];
  write_subs?: boolean;
  write_auto_subs?: boolean;
  start_time?: string;
  end_time?: string;
  cookie?: CookieConfig;
  proxy?: string;
  rate_limit?: string;
  concurrent_fragments?: number;
  embed_thumbnail?: boolean;
  embed_metadata?: boolean;
  embed_chapters?: boolean;
  sponsorblock_remove?: boolean;
  filename_template?: string;
  po_token?: string;
  extractor_args?: string;
  config_location?: string;
}

export interface Settings {
  yt_dlp_path: string | null;
  default_output_dir: string | null;
  default_quality: string;
  default_format: string;
  default_sub_langs: string[];
  language: string;
  max_concurrent_downloads: number;
  ai_provider: string | null;
  ai_api_key: string | null;
  ai_model: string | null;
  agent_cli_kimi_bin: string | null;
  agent_cli_other_bin: string | null;
  /** 网络与高级（借鉴清单 #3/#6/#9） */
  proxy?: string | null;
  cookie?: CookieConfig | null;
  rate_limit?: string | null;
  concurrent_fragments?: number | null;
  embed_thumbnail?: boolean;
  embed_metadata?: boolean;
  embed_chapters?: boolean;
  sponsorblock_remove?: boolean;
  filename_template?: string | null;
  po_token?: string | null;
  extractor_args?: string | null;
  config_location?: string | null;
  /** AI agent terminal launcher */
  agent_terminal?: string | null;
  agent_terminal_workdir?: string | null;
  agent_glm_api_key?: string | null;
  agent_minimax_api_key?: string | null;
  agent_anthropic_api_key?: string | null;
  agent_openai_api_key?: string | null;
}

export interface AgentCliDetection {
  id: string;
  label: string;
  found: boolean;
  path: string | null;
  version: string | null;
  source: string;
  config?: KimiConfigStatus | null;
}

export interface ConfigCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string | null;
}

export interface KimiConfigStatus {
  status: "ready" | "needs_login" | "token_expired" | "config_missing" | "not_installed" | string;
  ready: boolean;
  config_dir: string | null;
  config_toml_path: string | null;
  tui_toml_path: string | null;
  credentials_path: string | null;
  default_model: string | null;
  authenticated: boolean;
  token_expired: boolean;
  token_expires_at: string | null;
  skills_count: number;
  project_skills_exists: boolean;
  project_skills_path: string | null;
  checks: ConfigCheck[];
}

export interface DetectAgentCliResult {
  kimi: AgentCliDetection;
  other: AgentCliDetection;
}

// ── AI agent terminal launcher ──

export interface AgentTerminalInfo {
  id: string;
  label: string;
  platform: string;
  found: boolean;
  detail: string | null;
}

export interface AgentModelInfo {
  id: string;
  label: string;
}

export interface ProviderRegion {
  id: string;
  label: string;
  base_url: string;
}

export interface AgentProviderInfo {
  id: string;
  label: string;
  agent_cli: AgentCliToolId;
  requires_api_key: boolean;
  api_key_setting: keyof Settings | null;
  models: AgentModelInfo[];
  regions: ProviderRegion[];
  hint: string | null;
}

export type AgentCliToolId = "kimi" | "claude-code" | "codex";

export interface AgentCliToolInfo {
  id: AgentCliToolId;
  label: string;
  command: string;
  found: boolean;
  path: string | null;
  source: string;
}

export interface LaunchAgentTerminalRequest {
  terminal_id: string;
  agent_cli: AgentCliToolId;
  provider_id: string;
  region?: string | null;
  model?: string | null;
  api_key?: string | null;
  workdir?: string | null;
  cli_bin?: string | null;
}

export interface LaunchAgentTerminalResult {
  terminal_label: string;
  script_path: string;
  command_line: string;
  env_summary: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// Union-compatible with the Tauri PlaylistInfo (full) and the web
// getPlaylistInfo response (title/uploader/entries only).
export interface PlaylistVideo {
  id: string;
  title: string;
  duration?: number | null;
  thumbnail?: string | null;
  uploader?: string | null;
  webpage_url?: string;
}

export interface PlaylistInfo {
  id?: string;
  title: string;
  uploader?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  entries: PlaylistVideo[];
  webpage_url?: string;
}

export interface ExtractAudioRequest {
  video_path: string;
  output_dir?: string;
  audio_format?: string;
}

export interface ExtractAudioResult {
  audio_path: string;
}

export type MediaAssetType = "video" | "subtitle" | "vtt_report";

export interface MediaAsset {
  id: string;
  type: MediaAssetType;
  title: string;
  source_url?: string | null;
  file_path?: string | null;
  transcript?: string | null;
  metadata: {
    duration_sec?: number | null;
    language?: string | null;
    cue_count?: number;
    download_id?: string;
    report_id?: string;
    status?: string;
  };
}

export type AgentId = "kimi" | "mock";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  asset_ids?: string[];
}

export interface AssetContextPayload {
  id: string;
  title: string;
  type: MediaAssetType;
  source_url?: string | null;
  transcript_excerpt?: string | null;
  language?: string | null;
  duration_sec?: number | null;
}
