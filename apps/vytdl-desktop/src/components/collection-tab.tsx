"use client";

import { useState } from "react";
import { ClipboardList, Loader2, X, Film, Download } from "lucide-react";
import { Button } from "@vytdl/ui";
import { Input } from "@vytdl/ui";
import { Label } from "@vytdl/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { formatDuration } from "@vytdl/utils";
import { useSettingsStore } from "@/store/settingsStore";
import { useDownloadStore } from "@/store/downloadStore";
import { useTranslation } from "@/i18n";
import type { DownloadOptions, PlaylistInfo, ApiResponse } from "@/types";
import { apiInvoke } from "@/lib/api-client";
import { sanitizeFolderName } from "@/lib/download-paths";

// Dedicated tab for playlist / collection URLs: fetch the full entry list,
// let the user pick items, then enqueue each selection as its own download.
export function CollectionTab() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<PlaylistInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState({ submitted: 0, total: 0, failed: 0 });

  const settings = useSettingsStore((s) => s.settings);
  const { startDownload, clearError } = useDownloadStore();
  const { t } = useTranslation();

  const downloadable = (info?.entries ?? []).filter((e) => e.webpage_url);
  const allSelected = downloadable.length > 0 && selected.size === downloadable.length;

  const fetchList = async () => {
    const target = url.trim();
    if (!target || isLoading) return;

    setIsLoading(true);
    setError(null);
    setInfo(null);
    setSelected(new Set());

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(t("collectionTab.fetchFailed"))),
        60000
      );
    });

    try {
      const response = await Promise.race([
        apiInvoke<ApiResponse<PlaylistInfo>>("get_playlist_info", { url: target }),
        timeoutPromise,
      ]);
      if (response.success && response.data) {
        setInfo(response.data);
        // Default: every downloadable entry is selected
        setSelected(
          new Set(
            (response.data.entries ?? [])
              .filter((e) => e.webpage_url)
              .map((e) => e.webpage_url as string)
          )
        );
      } else {
        setError(response.error || t("collectionTab.fetchFailed"));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const toggle = (u: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(downloadable.map((e) => e.webpage_url as string)));
    }
  };

  const downloadSelected = async () => {
    if (selected.size === 0 || isSubmitting || !info) return;

    clearError();
    setIsSubmitting(true);
    setProgress({ submitted: 0, total: selected.size, failed: 0 });

    // Group the whole batch under <base download dir>/<collection title>/
    let collectionDir: string | undefined;
    try {
      const base = await apiInvoke<ApiResponse<string>>("get_default_output_dir");
      if (base.success && base.data) {
        collectionDir = `${base.data.replace(/\/+$/, "")}/${sanitizeFolderName(info.title)}`;
      }
    } catch {
      // Fall back to the default download dir
    }

    let failed = 0;
    const urls = [...selected];
    for (let i = 0; i < urls.length; i++) {
      const entry = downloadable.find((e) => e.webpage_url === urls[i]);
      const options: DownloadOptions = {
        url: urls[i],
        title: entry?.title,
        is_playlist: false,
        output_dir: collectionDir,
        quality: "best",
        format: "mp4",
        sub_langs: ["en", "zh"],
        write_subs: true,
        write_auto_subs: true,
        cookie: settings?.cookie ?? undefined,
        proxy: settings?.proxy ?? undefined,
        concurrent_fragments: settings?.concurrent_fragments ?? undefined,
        po_token: settings?.po_token ?? undefined,
        extractor_args: settings?.extractor_args ?? undefined,
      };
      const downloadId = await startDownload(options);
      if (!downloadId) failed++;
      setProgress({ submitted: i + 1, total: urls.length, failed });
    }

    setIsSubmitting(false);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          {t("collectionTab.title")}
        </CardTitle>
        <CardDescription>{t("collectionTab.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="collection-url">{t("collectionTab.urlLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="collection-url"
              placeholder={t("collectionTab.urlPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  fetchList();
                }
              }}
              disabled={isLoading || isSubmitting}
            />
            <Button
              type="button"
              onClick={fetchList}
              disabled={!url.trim() || isLoading || isSubmitting}
              className="shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("collectionTab.fetching")}
                </>
              ) : (
                t("collectionTab.fetch")
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive">
            <X className="h-4 w-4 shrink-0" />
            <span className="text-sm flex-1">{error}</span>
            <Button variant="ghost" size="sm" onClick={fetchList} className="h-7 px-2 text-xs">
              {t("downloadForm.retry")}
            </Button>
          </div>
        )}

        {info && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-medium text-sm truncate">{info.title}</h4>
                {info.uploader && (
                  <p className="text-xs text-muted-foreground truncate">{info.uploader}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {t("collectionTab.entriesCount", { count: String(downloadable.length) })}
                </Badge>
                <Button variant="outline" size="sm" onClick={toggleAll} className="h-7 text-xs">
                  {allSelected ? t("collectionTab.selectNone") : t("collectionTab.selectAll")}
                </Button>
              </div>
            </div>

            <div className="max-h-96 overflow-auto rounded-md border divide-y">
              {downloadable.map((entry, index) => {
                const u = entry.webpage_url as string;
                const checked = selected.has(u);
                return (
                  <label
                    key={`${entry.id}-${index}`}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(u)}
                      className="rounded border-gray-300 shrink-0"
                    />
                    <span className="text-xs text-muted-foreground w-6 shrink-0 text-right">
                      {index + 1}
                    </span>
                    {entry.thumbnail ? (
                      <img
                        src={entry.thumbnail}
                        alt={entry.title}
                        className="w-16 h-10 object-cover rounded bg-muted shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-10 bg-muted rounded flex items-center justify-center shrink-0">
                        <Film className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{entry.title || entry.id}</p>
                      {entry.duration != null && (
                        <p className="text-xs text-muted-foreground">
                          {formatDuration(entry.duration)}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {isSubmitting && progress.total > 0 && (
              <div className="text-sm text-muted-foreground text-center">
                {t("downloadForm.batchSubmitProgress", {
                  submitted: String(progress.submitted),
                  total: String(progress.total),
                })}
                {progress.failed > 0 && (
                  <span className="text-destructive ml-1">({progress.failed} failed)</span>
                )}
              </div>
            )}

            <Button
              type="button"
              className="w-full"
              onClick={downloadSelected}
              disabled={selected.size === 0 || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("collectionTab.submitting")}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {t("collectionTab.downloadSelected", { count: String(selected.size) })}
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
