/**
 * ContentForge 内容资产类型定义
 */

/** 内容资产类型 */
export type AssetType =
  | "video"
  | "article"
  | "tweet"
  | "thread"
  | "audio"
  | "image"
  | "note";

/** 内容资产状态 */
export type AssetStatus =
  | "ingested"
  | "processing"
  | "processed"
  | "ready"
  | "published"
  | "failed";

/** 来源平台 */
export type AssetPlatform =
  | "youtube"
  | "twitter"
  | "rss"
  | "web"
  | "local"
  | "bilibili"
  | "podcast"
  | "unknown";

/** 来源信息 */
export interface AssetSource {
  platform: AssetPlatform;
  url: string;
  author?: string;
  publishedAt?: string;
  /** 互动数据 */
  engagement?: {
    likes?: number;
    replies?: number;
    reposts?: number;
    views?: number;
  };
}

/** 分析结果 */
export interface AssetAnalysis {
  topics: string[];
  keywords: string[];
  entities: string[];
  sentiment: {
    label: string;
    confidence: number;
  };
  qualityScore: number;
  language?: string;
}

/** 内容资产 */
export interface ContentAsset {
  id: string;
  type: AssetType;
  title: string;
  description?: string;
  source: AssetSource;

  // 内容
  extractedText?: string;
  summary?: string;
  transcript?: string;
  translatedText?: string;
  rewrittenText?: string;

  // 媒体
  filePath?: string;
  thumbnailUrl?: string;
  durationSec?: number;

  // 分析结果
  analysis?: AssetAnalysis;

  // 元数据
  status: AssetStatus;
  tags: string[];
  pipelineId?: string;

  // 时间戳
  createdAt: string;
  updatedAt: string;
}

/** 资产搜索过滤器 */
export interface AssetFilter {
  type?: AssetType;
  status?: AssetStatus;
  platform?: AssetPlatform;
  tags?: string[];
  query?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** 资产搜索排序 */
export type AssetSortField =
  | "createdAt"
  | "updatedAt"
  | "title"
  | "qualityScore"
  | "views";

export type AssetSortOrder = "asc" | "desc";

/** 资产搜索请求 */
export interface AssetSearchRequest {
  filter?: AssetFilter;
  sort?: {
    field: AssetSortField;
    order: AssetSortOrder;
  };
  pagination?: {
    page: number;
    pageSize: number;
  };
}

/** 资产搜索响应 */
export interface AssetSearchResponse {
  assets: ContentAsset[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 资产选择状态 */
export interface AssetSelection {
  selectedIds: string[];
  /** 最后选中的资产ID */
  lastSelectedId?: string;
  /** 选择模式 */
  mode: "single" | "multiple";
}

/** 资产分组（按类型或来源） */
export interface AssetGroup {
  id: string;
  label: string;
  type: "type" | "platform" | "status" | "tag" | "custom";
  value: string;
  assetIds: string[];
  count: number;
}

/** 资产预览 */
export interface AssetPreview {
  id: string;
  title: string;
  type: AssetType;
  thumbnailUrl?: string;
  snippet: string; // 前 200 字
  source: AssetSource;
  durationSec?: number;
}
