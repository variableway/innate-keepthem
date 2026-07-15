/**
 * ContentForge Asset Store
 * 基于 Zustand，管理内容资产的加载、搜索、选择、缓存
 *
 * 特性：
 * - 资产列表加载与分页
 * - 搜索与过滤
 * - 资产选择状态（单选/多选）
 * - 资产缓存
 * - 缩略图/预览管理
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  ContentAsset,
  AssetFilter,
  AssetSortField,
  AssetSortOrder,
  AssetSearchRequest,
  AssetSearchResponse,
  AssetSelection,
  AssetGroup,
  AssetPreview,
  AssetType,
  AssetPlatform,
  AssetStatus,
} from "../types/asset";

// ─────────────────────────── 状态定义 ───────────────────────────

interface AssetStoreState {
  // 资产列表
  assets: ContentAsset[];
  // 资产缓存（按 ID 索引）
  assetCache: Map<string, ContentAsset>;
  // 资产分组
  groups: AssetGroup[];
  // 选择状态
  selection: AssetSelection;
  // 搜索状态
  searchQuery: string;
  activeFilter: AssetFilter;
  activeSort: {
    field: AssetSortField;
    order: AssetSortOrder;
  };
  // 分页状态
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  // 加载状态
  isLoading: boolean;
  isSearching: boolean;
  isLoadingDetail: boolean;
  // 预览状态
  previewAssetId: string | null;
  // 错误状态
  error: string | null;
}

interface AssetStoreActions {
  // 资产加载
  loadAssets: (request?: AssetSearchRequest) => Promise<void>;
  loadMoreAssets: () => Promise<void>;
  refreshAssets: () => Promise<void>;
  loadAssetDetail: (assetId: string) => Promise<ContentAsset | null>;

  // 搜索与过滤
  searchAssets: (query: string, filter?: AssetFilter) => Promise<void>;
  setFilter: (filter: AssetFilter) => void;
  setSort: (field: AssetSortField, order: AssetSortOrder) => void;
  clearFilter: () => void;

  // 资产选择
  selectAsset: (assetId: string, mode?: "single" | "multiple") => void;
  deselectAsset: (assetId: string) => void;
  toggleAssetSelection: (assetId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectByGroup: (groupId: string) => void;
  setSelectionMode: (mode: "single" | "multiple") => void;

  // 资产操作
  deleteAsset: (assetId: string) => Promise<void>;
  updateAssetTags: (assetId: string, tags: string[]) => Promise<void>;
  addAssetToSession: (assetId: string, sessionId: string) => Promise<void>;

  // 预览
  setPreviewAsset: (assetId: string | null) => void;

  // 分组
  loadGroups: () => Promise<void>;

  // 状态
  clearError: () => void;
  reset: () => void;
}

// ─────────────────────────── 辅助函数 ───────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ─────────────────────────── API 调用（占位） ───────────────────────────

let apiInvoke: <T>(command: string, args?: unknown) => Promise<T>;

export function setAssetApiClient(
  invoke: <T>(command: string, args?: unknown) => Promise<T>
) {
  apiInvoke = invoke;
}

// ─────────────────────────── 默认配置 ───────────────────────────

const DEFAULT_PAGE_SIZE = 20;

const DEFAULT_FILTER: AssetFilter = {
  query: "",
};

const DEFAULT_SORT = {
  field: "updatedAt" as AssetSortField,
  order: "desc" as AssetSortOrder,
};

// ─────────────────────────── Store 实现 ───────────────────────────

export const useAssetStore = create<AssetStoreState & AssetStoreActions>()(
  devtools(
    immer((set, get) => ({
      // ─────────────────── 初始状态 ───────────────────
      assets: [],
      assetCache: new Map(),
      groups: [],
      selection: {
        selectedIds: [],
        mode: "multiple",
      },
      searchQuery: "",
      activeFilter: DEFAULT_FILTER,
      activeSort: DEFAULT_SORT,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      total: 0,
      hasMore: true,
      isLoading: false,
      isSearching: false,
      isLoadingDetail: false,
      previewAssetId: null,
      error: null,

      // ─────────────────── 资产加载 ───────────────────

      loadAssets: async (request?: AssetSearchRequest) => {
        const state = get();
        const filter = request?.filter || state.activeFilter;
        const sort = request?.sort || state.activeSort;
        const page = request?.pagination?.page || 1;
        const pageSize = request?.pagination?.pageSize || state.pageSize;

        set((state) => {
          state.isLoading = true;
          state.error = null;
          if (page === 1) {
            state.assets = [];
          }
        });

        try {
          const response = await apiInvoke<AssetSearchResponse>("search_assets", {
            filter,
            sort,
            pagination: { page, pageSize },
          });

          set((state) => {
            if (page === 1) {
              state.assets = response.assets;
            } else {
              // 合并并去重
              const existingIds = new Set(state.assets.map((a) => a.id));
              const newAssets = response.assets.filter((a) => !existingIds.has(a.id));
              state.assets.push(...newAssets);
            }
            // 更新缓存
            response.assets.forEach((asset) => {
              state.assetCache.set(asset.id, asset);
            });
            state.total = response.total;
            state.page = response.page;
            state.pageSize = response.pageSize;
            state.hasMore = response.hasMore;
            state.isLoading = false;
          });
        } catch (err) {
          set((state) => {
            state.error = err instanceof Error ? err.message : "加载资产失败";
            state.isLoading = false;
          });
        }
      },

      loadMoreAssets: async () => {
        const state = get();
        if (!state.hasMore || state.isLoading) return;
        await state.loadAssets({
          filter: state.activeFilter,
          sort: state.activeSort,
          pagination: {
            page: state.page + 1,
            pageSize: state.pageSize,
          },
        });
      },

      refreshAssets: async () => {
        const state = get();
        await state.loadAssets({
          filter: state.activeFilter,
          sort: state.activeSort,
          pagination: { page: 1, pageSize: state.pageSize },
        });
      },

      loadAssetDetail: async (assetId: string) => {
        // 先检查缓存
        const cached = get().assetCache.get(assetId);
        if (cached?.extractedText) {
          return cached;
        }

        set((state) => {
          state.isLoadingDetail = true;
        });

        try {
          const asset = await apiInvoke<ContentAsset>("get_asset_detail", { assetId });
          set((state) => {
            state.assetCache.set(assetId, asset);
            // 同时更新 assets 列表中的对应项
            const idx = state.assets.findIndex((a) => a.id === assetId);
            if (idx >= 0) {
              state.assets[idx] = asset;
            }
            state.isLoadingDetail = false;
          });
          return asset;
        } catch (err) {
          set((state) => {
            state.error = err instanceof Error ? err.message : "加载资产详情失败";
            state.isLoadingDetail = false;
          });
          return null;
        }
      },

      // ─────────────────── 搜索与过滤 ───────────────────

      searchAssets: async (query: string, filter?: AssetFilter) => {
        set((state) => {
          state.searchQuery = query;
          state.isSearching = true;
          if (filter) {
            state.activeFilter = { ...state.activeFilter, ...filter, query };
          } else {
            state.activeFilter = { ...state.activeFilter, query };
          }
          state.page = 1;
        });

        await get().loadAssets({
          filter: get().activeFilter,
          sort: get().activeSort,
          pagination: { page: 1, pageSize: get().pageSize },
        });

        set((state) => {
          state.isSearching = false;
        });
      },

      setFilter: (filter: AssetFilter) => {
        set((state) => {
          state.activeFilter = { ...state.activeFilter, ...filter };
          state.page = 1;
        });
        get().loadAssets();
      },

      setSort: (field: AssetSortField, order: AssetSortOrder) => {
        set((state) => {
          state.activeSort = { field, order };
          state.page = 1;
        });
        get().loadAssets();
      },

      clearFilter: () => {
        set((state) => {
          state.activeFilter = DEFAULT_FILTER;
          state.searchQuery = "";
          state.page = 1;
        });
        get().loadAssets();
      },

      // ─────────────────── 资产选择 ───────────────────

      selectAsset: (assetId: string, mode?: "single" | "multiple") => {
        const effectiveMode = mode || get().selection.mode;
        set((state) => {
          if (effectiveMode === "single") {
            state.selection.selectedIds = [assetId];
          } else {
            if (!state.selection.selectedIds.includes(assetId)) {
              state.selection.selectedIds.push(assetId);
            }
          }
          state.selection.lastSelectedId = assetId;
          state.selection.mode = effectiveMode;
        });
      },

      deselectAsset: (assetId: string) => {
        set((state) => {
          state.selection.selectedIds = state.selection.selectedIds.filter((id) => id !== assetId);
          if (state.selection.lastSelectedId === assetId) {
            state.selection.lastSelectedId = state.selection.selectedIds[state.selection.selectedIds.length - 1];
          }
        });
      },

      toggleAssetSelection: (assetId: string) => {
        set((state) => {
          const idx = state.selection.selectedIds.indexOf(assetId);
          if (idx >= 0) {
            state.selection.selectedIds.splice(idx, 1);
          } else {
            state.selection.selectedIds.push(assetId);
          }
          state.selection.lastSelectedId = assetId;
        });
      },

      selectAll: () => {
        set((state) => {
          state.selection.selectedIds = state.assets.map((a) => a.id);
        });
      },

      deselectAll: () => {
        set((state) => {
          state.selection.selectedIds = [];
          state.selection.lastSelectedId = undefined;
        });
      },

      selectByGroup: (groupId: string) => {
        const group = get().groups.find((g) => g.id === groupId);
        if (!group) return;
        set((state) => {
          state.selection.selectedIds = group.assetIds;
          state.selection.lastSelectedId = group.assetIds[0];
        });
      },

      setSelectionMode: (mode: "single" | "multiple") => {
        set((state) => {
          state.selection.mode = mode;
          if (mode === "single" && state.selection.selectedIds.length > 1) {
            state.selection.selectedIds = state.selection.selectedIds.slice(0, 1);
          }
        });
      },

      // ─────────────────── 资产操作 ───────────────────

      deleteAsset: async (assetId: string) => {
        // 乐观更新
        const previousAssets = get().assets;
        const previousCache = new Map(get().assetCache);

        set((state) => {
          state.assets = state.assets.filter((a) => a.id !== assetId);
          state.assetCache.delete(assetId);
          state.selection.selectedIds = state.selection.selectedIds.filter((id) => id !== assetId);
        });

        try {
          await apiInvoke("delete_asset", { assetId });
        } catch (err) {
          // 回滚
          set((state) => {
            state.assets = previousAssets;
            state.assetCache = previousCache;
            state.error = err instanceof Error ? err.message : "删除资产失败";
          });
        }
      },

      updateAssetTags: async (assetId: string, tags: string[]) => {
        set((state) => {
          const asset = state.assetCache.get(assetId);
          if (asset) {
            asset.tags = tags;
            asset.updatedAt = now();
          }
          const listAsset = state.assets.find((a) => a.id === assetId);
          if (listAsset) {
            listAsset.tags = tags;
            listAsset.updatedAt = now();
          }
        });

        try {
          await apiInvoke("update_asset_tags", { assetId, tags });
        } catch (err) {
          set((state) => {
            state.error = err instanceof Error ? err.message : "更新标签失败";
          });
        }
      },

      addAssetToSession: async (assetId: string, sessionId: string) => {
        try {
          await apiInvoke("add_asset_to_session", { assetId, sessionId });
        } catch (err) {
          set((state) => {
            state.error = err instanceof Error ? err.message : "添加到会话失败";
          });
        }
      },

      // ─────────────────── 预览 ───────────────────

      setPreviewAsset: (assetId: string | null) => {
        set((state) => {
          state.previewAssetId = assetId;
        });
      },

      // ─────────────────── 分组 ───────────────────

      loadGroups: async () => {
        try {
          const response = await apiInvoke<{ groups: AssetGroup[] }>("get_asset_groups");
          set((state) => {
            state.groups = response.groups;
          });
        } catch {
          // 计算本地分组
          set((state) => {
            const typeGroups: Record<string, string[]> = {};
            const platformGroups: Record<string, string[]> = {};
            const statusGroups: Record<string, string[]> = {};

            state.assets.forEach((asset) => {
              // 按类型分组
              if (!typeGroups[asset.type]) typeGroups[asset.type] = [];
              typeGroups[asset.type].push(asset.id);

              // 按平台分组
              const platform = asset.source.platform;
              if (!platformGroups[platform]) platformGroups[platform] = [];
              platformGroups[platform].push(asset.id);

              // 按状态分组
              if (!statusGroups[asset.status]) statusGroups[asset.status] = [];
              statusGroups[asset.status].push(asset.id);
            });

            const groups: AssetGroup[] = [
              ...Object.entries(typeGroups).map(([type, ids]) => ({
                id: `type-${type}`,
                label: type,
                type: "type" as const,
                value: type,
                assetIds: ids,
                count: ids.length,
              })),
              ...Object.entries(platformGroups).map(([platform, ids]) => ({
                id: `platform-${platform}`,
                label: platform,
                type: "platform" as const,
                value: platform,
                assetIds: ids,
                count: ids.length,
              })),
              ...Object.entries(statusGroups).map(([status, ids]) => ({
                id: `status-${status}`,
                label: status,
                type: "status" as const,
                value: status,
                assetIds: ids,
                count: ids.length,
              })),
            ];

            state.groups = groups;
          });
        }
      },

      // ─────────────────── 状态 ───────────────────

      clearError: () => {
        set((state) => {
          state.error = null;
        });
      },

      reset: () => {
        set((state) => {
          state.assets = [];
          state.assetCache.clear();
          state.groups = [];
          state.selection = { selectedIds: [], mode: "multiple" };
          state.searchQuery = "";
          state.activeFilter = DEFAULT_FILTER;
          state.activeSort = DEFAULT_SORT;
          state.page = 1;
          state.hasMore = true;
          state.error = null;
        });
      },
    })),
    { name: "asset-store" }
  )
);

// ─────────────────────────── Selector Hooks ───────────────────────────

/** 获取选中的资产列表 */
export function useSelectedAssets(): ContentAsset[] {
  return useAssetStore((state) =>
    state.selection.selectedIds
      .map((id) => state.assetCache.get(id))
      .filter(Boolean) as ContentAsset[]
  );
}

/** 获取当前预览资产 */
export function usePreviewAsset(): ContentAsset | null {
  return useAssetStore((state) =>
    state.previewAssetId ? state.assetCache.get(state.previewAssetId) || null : null
  );
}

/** 获取按类型分组的资产 */
export function useAssetsByType(): Record<string, ContentAsset[]> {
  return useAssetStore((state) => {
    const grouped: Record<string, ContentAsset[]> = {};
    state.assets.forEach((asset) => {
      if (!grouped[asset.type]) grouped[asset.type] = [];
      grouped[asset.type].push(asset);
    });
    return grouped;
  });
}

/** 获取资产数量统计 */
export function useAssetStats(): { total: number; byType: Record<string, number> } {
  return useAssetStore((state) => {
    const byType: Record<string, number> = {};
    state.assets.forEach((a) => {
      byType[a.type] = (byType[a.type] || 0) + 1;
    });
    return { total: state.assets.length, byType };
  });
}

/** 获取资产预览列表 */
export function useAssetPreviews(): AssetPreview[] {
  return useAssetStore((state) =>
    state.assets.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      thumbnailUrl: a.thumbnailUrl,
      snippet: (a.extractedText || a.summary || a.description || "").slice(0, 200),
      source: a.source,
      durationSec: a.durationSec,
    }))
  );
}
