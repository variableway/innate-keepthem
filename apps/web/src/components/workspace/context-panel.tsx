"use client";

import { FileText, Film, Search, Subtitles } from "lucide-react";
import { Badge, Checkbox, Input, Spinner } from "@vytdl/ui";
import { useTranslation } from "@/i18n";
import { useChatStore } from "@/store/chatStore";
import type { MediaAsset, MediaAssetType } from "@/types";
import { useMemo, useState } from "react";

function assetIcon(type: MediaAssetType) {
  switch (type) {
    case "vtt_report":
      return FileText;
    case "subtitle":
      return Subtitles;
    default:
      return Film;
  }
}

function AssetRow({ asset }: { asset: MediaAsset }) {
  const { t } = useTranslation();
  const selectedAssetIds = useChatStore((s) => s.selectedAssetIds);
  const toggleAsset = useChatStore((s) => s.toggleAsset);
  const Icon = assetIcon(asset.type);
  const checked = selectedAssetIds.includes(asset.id);

  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 transition-colors ${
        checked ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted/60"
      }`}
    >
      <Checkbox checked={checked} onCheckedChange={() => toggleAsset(asset.id)} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{asset.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {t(`workspace.assetType.${asset.type}`)}
          </Badge>
          {asset.metadata.language && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {asset.metadata.language}
            </Badge>
          )}
          {asset.transcript && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {t("workspace.hasTranscript")}
            </Badge>
          )}
        </div>
      </div>
    </label>
  );
}

export function ContextPanel() {
  const { t } = useTranslation();
  const assets = useChatStore((s) => s.assets);
  const selectedAssetIds = useChatStore((s) => s.selectedAssetIds);
  const isLoadingAssets = useChatStore((s) => s.isLoadingAssets);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.source_url?.toLowerCase().includes(q) ||
        a.type.includes(q),
    );
  }, [assets, query]);

  const grouped = useMemo(() => {
    const reports = filtered.filter((a) => a.type === "vtt_report");
    const videos = filtered.filter((a) => a.type === "video");
    const subs = filtered.filter((a) => a.type === "subtitle");
    return { reports, videos, subs };
  }, [filtered]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/10">
      <div className="border-b p-3 space-y-2">
        <h2 className="text-sm font-semibold">{t("workspace.contextTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("workspace.contextHint")}</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("workspace.searchAssets")}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("workspace.selectedCount", { count: selectedAssetIds.length })}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-3">
        {isLoadingAssets ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t("workspace.noAssets")}
          </p>
        ) : (
          <>
            {grouped.reports.length > 0 && (
              <section>
                <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("workspace.groupReports")}
                </p>
                <div className="space-y-1">
                  {grouped.reports.map((a) => (
                    <AssetRow key={a.id} asset={a} />
                  ))}
                </div>
              </section>
            )}
            {grouped.videos.length > 0 && (
              <section>
                <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("workspace.groupVideos")}
                </p>
                <div className="space-y-1">
                  {grouped.videos.map((a) => (
                    <AssetRow key={a.id} asset={a} />
                  ))}
                </div>
              </section>
            )}
            {grouped.subs.length > 0 && (
              <section>
                <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("workspace.groupSubtitles")}
                </p>
                <div className="space-y-1">
                  {grouped.subs.map((a) => (
                    <AssetRow key={a.id} asset={a} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
