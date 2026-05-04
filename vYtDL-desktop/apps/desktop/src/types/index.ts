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

export interface DownloadOptions {
  url: string;
  is_playlist: boolean;
  quality?: string;
  format?: string;
  output_dir?: string;
  sub_langs?: string[];
  write_subs?: boolean;
  write_auto_subs?: boolean;
  start_time?: string;
  end_time?: string;
}

export interface Settings {
  yt_dlp_path: string | null;
  default_output_dir: string | null;
  default_quality: string;
  default_format: string;
  default_sub_langs: string[];
  language: string;
  ai_provider: string | null;
  ai_api_key: string | null;
  ai_model: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface PlaylistVideo {
  id: string;
  title: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  webpage_url: string;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  uploader?: string;
  description?: string;
  thumbnail?: string;
  entries: PlaylistVideo[];
  webpage_url: string;
}
