"use client";

import { useTranslation } from "@/i18n";
import { MainContent } from "@/components/layout/main-content";
import { useAssetStore } from "@/store/assetStore";
import { useState, useEffect } from "react";
import { Library, Search, Loader2, Filter, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AssetsPage() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    assets,
    isLoading,
    selection,
    loadAssets,
    searchAssets,
    toggleAssetSelection,
    selectAll,
    deselectAll,
  } = useAssetStore();

  useEffect(() => {
    setMounted(true);
    loadAssets();
  }, [loadAssets]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchAssets(searchQuery);
  };

  if (!mounted) {
    return (
      <MainContent>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </MainContent>
    );
  }

  return (
    <MainContent width="full" className="min-w-0 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t("assets.title")}</h1>
        <p className="text-muted-foreground">{t("assets.subtitle")}</p>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("assets.searchPlaceholder")}
              className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <button
            onClick={() => selection.selectedIds.length === assets.length ? deselectAll() : selectAll()}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors"
          >
            {selection.selectedIds.length === assets.length ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {selection.selectedIds.length > 0
              ? t("assets.selectedCount", { count: selection.selectedIds.length })
              : t("assets.selectAll")}
          </button>
        </div>
      </div>

      {/* Assets Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-96 border border-dashed border-border rounded-lg">
          <Library className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("assets.noAssets")}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t("assets.noAssetsDesc")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => toggleAssetSelection(asset.id)}
              className={cn(
                "p-4 border rounded-lg cursor-pointer transition-colors",
                selection.selectedIds.includes(asset.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Library className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{asset.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(`assets.platform${asset.source.platform.charAt(0).toUpperCase() + asset.source.platform.slice(1)}`)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      asset.status === "ready" && "bg-green-500/10 text-green-500",
                      asset.status === "processing" && "bg-yellow-500/10 text-yellow-500",
                      asset.status === "ingested" && "bg-blue-500/10 text-blue-500",
                      asset.status === "failed" && "bg-red-500/10 text-red-500",
                    )}>
                      {t(`assets.status${asset.status.charAt(0).toUpperCase() + asset.status.slice(1)}`)}
                    </span>
                    {asset.type && (
                      <span className="text-xs text-muted-foreground">
                        {asset.type}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </MainContent>
  );
}
