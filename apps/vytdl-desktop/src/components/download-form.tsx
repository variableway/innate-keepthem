"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Download, Loader2, Clock, User, Film, History, X, FileUp } from "lucide-react";
import { Button } from "@vytdl/ui";
import { Input } from "@vytdl/ui";
import { Label } from "@vytdl/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
import { useSettingsStore } from "@/store/settingsStore";
import { useDownloadStore } from "@/store/downloadStore";
import { formatDuration } from "@vytdl/utils";
import { useTranslation } from "@/i18n";
import type { DownloadOptions, VideoInfo, ApiResponse } from "@/types";

const QUALITY_OPTIONS = [
  { value: "best", labelKey: "downloadForm.bestQuality" },
  { value: "2160", labelKey: "downloadForm.quality4k" },
  { value: "1440", labelKey: "downloadForm.quality2k" },
  { value: "1080", labelKey: "downloadForm.quality1080" },
  { value: "720", labelKey: "downloadForm.quality720" },
  { value: "480", labelKey: "downloadForm.quality480" },
  { value: "360", labelKey: "downloadForm.quality360" },
];

const FORMAT_OPTIONS = [
  { value: "mp4", labelKey: "downloadForm.formatMp4" },
  { value: "webm", labelKey: "downloadForm.formatWebm" },
  { value: "mkv", labelKey: "downloadForm.formatMkv" },
  { value: "mov", labelKey: "downloadForm.formatMov" },
];

import { apiInvoke } from "@/lib/api-client";

function isValidVideoUrl(url: string): boolean {
  if (!url.trim()) return false;
  const patterns = [
    /youtube\.com|youtu\.be/,
    /bilibili\.com|b23\.tv/,
    /xiaohongshu\.com|xhslink\.com/,
    /vimeo\.com/,
    /twitter\.com|x\.com/,
    /tiktok\.com/,
    /dailymotion\.com|dai\.ly/,
    /twitch\.tv/,
    /facebook\.com|fb\.watch/,
    /instagram\.com/,
    /nicovideo\.jp/,
  ];
  return patterns.some((p) => p.test(url));
}

interface DownloadFormProps {
  mode: "single" | "batch" | "smart";
}

export function DownloadForm({ mode }: DownloadFormProps) {
  const [url, setUrl] = useState("");
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [quality, setQuality] = useState("best");
  const [format, setFormat] = useState("mp4");
  const [subLangs, setSubLangs] = useState(["en", "zh"]);
  const [writeSubs, setWriteSubs] = useState(true);
  const [writeAutoSubs, setWriteAutoSubs] = useState(true);
  // ── Format Picker 与高级选项（借鉴清单 #5/#9）──
  const [formatId, setFormatId] = useState<string>("");
  const [showFormats, setShowFormats] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [embedThumbnail, setEmbedThumbnail] = useState(false);
  const [embedMetadata, setEmbedMetadata] = useState(false);
  const [embedChapters, setEmbedChapters] = useState(false);
  const [sponsorblock, setSponsorblock] = useState(false);
  const [rateLimit, setRateLimit] = useState("");
  const settings = useSettingsStore((s) => s.settings);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ submitted: 0, total: 0, failed: 0 });

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoRetryCount, setInfoRetryCount] = useState(0);
  const infoAbortRef = useRef<AbortController | null>(null);

  const [history, setHistory] = useState<{ url: string; title?: string; date: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { startDownload, error, clearError } = useDownloadStore();
  const { t } = useTranslation();

  useEffect(() => {
    const saved = localStorage.getItem("vytdl-url-history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  // Fetch video info with auto-retry on timeout
  const fetchVideoInfo = useCallback(async (retryAttempt = 0) => {
    const abortController = new AbortController();
    infoAbortRef.current = abortController;

    setIsLoadingInfo(true);
    setInfoError(null);

    const done = () => {
      if (!abortController.signal.aborted) {
        setIsLoadingInfo(false);
      }
    };

    // Frontend timeout: 25s to accommodate slow YouTube responses
    const timeoutMs = 25000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(t("downloadForm.requestTimeout"))), timeoutMs);
    });

    let willRetry = false;
    try {
      console.log("[DownloadForm] Fetching video info for:", url, "retry:", retryAttempt);
      const response = await Promise.race([
        apiInvoke<ApiResponse<VideoInfo>>("get_video_info", { url }),
        timeoutPromise,
      ]);
      console.log("[DownloadForm] Video info response:", response);
      if (!abortController.signal.aborted) {
        if (response.success && response.data) {
          setVideoInfo(response.data);
          setInfoRetryCount(0);
        } else {
          setInfoError(response.error || t("downloadForm.fetchFailed"));
        }
      }
    } catch (err) {
      console.error("[DownloadForm] Video info error:", err);
      if (!abortController.signal.aborted) {
        const errStr = String(err);
        // Auto-retry once on timeout
        if (errStr.includes("timed out") && retryAttempt < 1) {
          willRetry = true;
          setInfoRetryCount(retryAttempt + 1);
          setTimeout(() => fetchVideoInfo(retryAttempt + 1), 1500);
        } else {
          setInfoError(errStr);
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (!willRetry) done();
    }
  }, [url, t]);

  useEffect(() => {
    setVideoInfo(null);
    setInfoError(null);
    setInfoRetryCount(0);

    if (infoAbortRef.current) {
      infoAbortRef.current.abort();
    }

    if (!isValidVideoUrl(url)) {
      return;
    }

    const timer = setTimeout(() => {
      fetchVideoInfo(0);
    }, 500);

    return () => {
      clearTimeout(timer);
      if (infoAbortRef.current) {
        infoAbortRef.current.abort();
      }
    };
  }, [url, fetchVideoInfo]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addToHistory = (url: string, title?: string) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.url !== url);
      const next = [{ url, title, date: new Date().toISOString() }, ...filtered].slice(0, 20);
      localStorage.setItem("vytdl-url-history", JSON.stringify(next));
      return next;
    });
  };

  // Parse multiple URLs from textarea content (one per line)
  const parseBatchUrls = (text: string): string[] => {
    const lines = text.split(/\r?\n/);
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (!isValidVideoUrl(trimmed)) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      urls.push(trimmed);
    }
    return urls;
  };

  // Detect if URL is a playlist
  const isPlaylistUrl = (url: string): boolean => {
    return /playlist|list=|\/channel\/|\/user\/|\/c\//.test(url);
  };

  // Handle file import for batch URLs
  const handleFileImport = (file: File) => {
    if (!file.name.endsWith(".txt")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string || "";
      const importedUrls = parseBatchUrls(text);
      if (importedUrls.length > 0) {
        const currentUrls = parseBatchUrls(url);
        const combined = [...new Set([...currentUrls, ...importedUrls])];
        setUrl(combined.join("\n"));
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    clearError();
    setIsSubmitting(true);

    // Batch / Smart mode: submit multiple URLs
    if (mode === "batch" || mode === "smart") {
      const urls = parseBatchUrls(url);
      if (urls.length === 0) {
        setIsSubmitting(false);
        return;
      }

      setBatchProgress({ submitted: 0, total: urls.length, failed: 0 });
      let failed = 0;

      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        const autoPlaylist = mode === "smart" && isPlaylistUrl(u);
        const options: DownloadOptions = {
          url: u,
          is_playlist: autoPlaylist || isPlaylist,
          quality,
          format,
          sub_langs: subLangs,
          write_subs: writeSubs,
          write_auto_subs: writeAutoSubs,
          format_id: formatId || undefined,
          embed_thumbnail: embedThumbnail || undefined,
          embed_metadata: embedMetadata || undefined,
          embed_chapters: embedChapters || undefined,
          sponsorblock_remove: sponsorblock || undefined,
          rate_limit: rateLimit || undefined,
          cookie: settings?.cookie ?? undefined,
          proxy: settings?.proxy ?? undefined,
          concurrent_fragments: settings?.concurrent_fragments ?? undefined,
          po_token: settings?.po_token ?? undefined,
          extractor_args: settings?.extractor_args ?? undefined,
        };
        const downloadId = await startDownload(options);
        if (!downloadId) failed++;
        setBatchProgress({ submitted: i + 1, total: urls.length, failed });
      }

      if (failed === 0) {
        setUrl("");
      }
      setIsSubmitting(false);
      return;
    }

    // Single mode
    const options: DownloadOptions = {
      url: url.trim(),
      is_playlist: isPlaylist,
      quality,
      format,
      sub_langs: subLangs,
      write_subs: writeSubs,
      write_auto_subs: writeAutoSubs,
      format_id: formatId || undefined,
      embed_thumbnail: embedThumbnail || undefined,
      embed_metadata: embedMetadata || undefined,
      embed_chapters: embedChapters || undefined,
      sponsorblock_remove: sponsorblock || undefined,
      rate_limit: rateLimit || undefined,
      cookie: settings?.cookie ?? undefined,
      proxy: settings?.proxy ?? undefined,
      concurrent_fragments: settings?.concurrent_fragments ?? undefined,
      po_token: settings?.po_token ?? undefined,
      extractor_args: settings?.extractor_args ?? undefined,
    };

    const downloadId = await startDownload(options);

    if (downloadId) {
      addToHistory(url.trim(), videoInfo?.title || undefined);
      setUrl("");
      setVideoInfo(null);
    }

    setIsSubmitting(false);
  };

  const toggleLang = (lang: string) => {
    setSubLangs((prev) =>
      prev.includes(lang)
        ? prev.filter((l) => l !== lang)
        : [...prev, lang]
    );
  };

  const filteredHistory = history.filter((h) =>
    h.url.toLowerCase().includes(url.toLowerCase())
  );

  const titleKey = mode === "batch" ? "downloadForm.batchDownload" :
    mode === "smart" ? "downloadForm.smartDownload" : "downloadForm.newDownload";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          {t(titleKey)}
        </CardTitle>
        <CardDescription>
          {t("downloadForm.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2" ref={historyRef}>
            <Label htmlFor="url">
              {mode === "batch" || mode === "smart"
                ? t("downloadForm.batchUrlLabel")
                : t("downloadForm.urlLabel")}
            </Label>

            {mode === "batch" || mode === "smart" ? (
              <div className="space-y-2">
                <textarea
                  id="url"
                  placeholder={t("downloadForm.batchUrlPlaceholder")}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t("downloadForm.validUrlsCount", { count: String(parseBatchUrls(url).length) })}
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer text-xs text-primary hover:underline">
                    <FileUp className="h-3 w-3" />
                    <span>{t("downloadForm.importFromFile")}</span>
                    <input
                      type="file"
                      accept=".txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileImport(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Input
                  ref={inputRef}
                  id="url"
                  placeholder={t("downloadForm.urlPlaceholder")}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setShowHistory(true);
                  }}
                  onFocus={() => setShowHistory(true)}
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <History className="h-4 w-4" />
                </button>

                {showHistory && filteredHistory.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                    <div className="p-2 text-xs text-muted-foreground border-b">
                      {t("downloadForm.recentUrls")}
                    </div>
                    {filteredHistory.map((item) => (
                      <button
                        key={item.url}
                        type="button"
                        onClick={() => {
                          setUrl(item.url);
                          setShowHistory(false);
                          inputRef.current?.focus();
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-start gap-2"
                      >
                        <History className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{item.url}</p>
                          {item.title && (
                            <p className="text-xs text-muted-foreground truncate">{item.title}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {mode === "single" && (isLoadingInfo || videoInfo || infoError) && url && isValidVideoUrl(url) && (
            <div className="border rounded-lg p-4 bg-muted/50">
              {isLoadingInfo && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">
                    {infoRetryCount > 0
                      ? t("downloadForm.fetchingInfoRetry", { count: infoRetryCount })
                      : t("downloadForm.fetchingInfo")}
                  </span>
                </div>
              )}

              {infoError && (
                <div className="flex items-center gap-2 text-destructive">
                  <X className="h-4 w-4" />
                  <span className="text-sm flex-1">{infoError}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInfoError(null);
                      setInfoRetryCount(0);
                      fetchVideoInfo(0);
                    }}
                    className="h-7 px-2 text-xs"
                  >
                    {t("downloadForm.retry")}
                  </Button>
                </div>
              )}

              {videoInfo && (
                <div className="flex gap-4">
                  <div className="shrink-0">
                    {videoInfo.thumbnail ? (
                      <img
                        src={videoInfo.thumbnail}
                        alt={videoInfo.title}
                        className="w-32 h-20 object-cover rounded-md bg-muted"
                      />
                    ) : (
                      <div className="w-32 h-20 bg-muted rounded-md flex items-center justify-center">
                        <Film className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium line-clamp-2 text-sm">{videoInfo.title}</h4>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {videoInfo.uploader && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {videoInfo.uploader}
                        </span>
                      )}
                      {videoInfo.duration !== null && videoInfo.duration !== undefined && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(videoInfo.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Format Picker：视频/音频分轨精确选择（借鉴 #5）── */}
              {videoInfo && videoInfo.formats && videoInfo.formats.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowFormats((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {showFormats ? "▼" : "▶"} 高级格式选择 (Format Picker)
                    {formatId && <span className="text-primary">已选: {formatId}</span>}
                  </button>
                  {showFormats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormatGroup
                        title="视频轨"
                        formats={videoInfo.formats.filter((f) => f.resolution)}
                        selected={formatId}
                        onSelect={setFormatId}
                      />
                      <FormatGroup
                        title="音频轨"
                        formats={videoInfo.formats.filter((f) => !f.resolution)}
                        selected={formatId}
                        onSelect={setFormatId}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── 高级选项折叠区（借鉴 #9 后处理 + #6 限速）── */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {showAdvanced ? "▼" : "▶"} 高级选项 (Advanced)
                </button>
                {showAdvanced && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={embedThumbnail} onChange={(e) => setEmbedThumbnail(e.target.checked)} />
                      嵌入缩略图
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={embedMetadata} onChange={(e) => setEmbedMetadata(e.target.checked)} />
                      嵌入元数据
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={embedChapters} onChange={(e) => setEmbedChapters(e.target.checked)} />
                      嵌入章节
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={sponsorblock} onChange={(e) => setSponsorblock(e.target.checked)} />
                      SponsorBlock 跳过广告段
                    </label>
                    <label className="col-span-2 text-xs">
                      限速（如 2M，留空不限）
                      <input
                        className="ml-2 w-24 rounded border bg-transparent px-2 py-1"
                        placeholder="2M"
                        value={rateLimit}
                        onChange={(e) => setRateLimit(e.target.value)}
                      />
                    </label>
                    <p className="col-span-2 text-[11px] text-muted-foreground">
                      Cookie / 代理 / 并发分片等全局项在 设置 → 网络与高级 中配置
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode !== "smart" && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPlaylist}
                  onChange={(e) => setIsPlaylist(e.target.checked)}
                  className="rounded border-gray-300"
                  disabled={isSubmitting}
                />
                <span className="text-sm">{t("downloadForm.playlistCheckbox")}</span>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quality">{t("downloadForm.qualityLabel")}</Label>
              <select
                id="quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3"
                disabled={isSubmitting}
              >
                {QUALITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="format">{t("downloadForm.formatLabel")}</Label>
              <select
                id="format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3"
                disabled={isSubmitting}
              >
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("downloadForm.subtitleLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {["en", "zh", "ja", "ko", "de", "fr", "es", "ru"].map((lang) => (
                <Badge
                  key={lang}
                  variant={subLangs.includes(lang) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleLang(lang)}
                >
                  {lang.toUpperCase()}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={writeSubs}
                onChange={(e) => setWriteSubs(e.target.checked)}
                className="rounded border-gray-300"
                disabled={isSubmitting}
              />
              <span className="text-sm">{t("downloadForm.downloadSubs")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={writeAutoSubs}
                onChange={(e) => setWriteAutoSubs(e.target.checked)}
                className="rounded border-gray-300"
                disabled={isSubmitting || !writeSubs}
              />
              <span className="text-sm">{t("downloadForm.autoSubs")}</span>
            </label>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          {(mode === "batch" || mode === "smart") && isSubmitting && batchProgress.total > 0 && (
            <div className="text-sm text-muted-foreground text-center">
              {t("downloadForm.batchSubmitProgress", {
                submitted: String(batchProgress.submitted),
                total: String(batchProgress.total),
              })}
              {batchProgress.failed > 0 && (
                <span className="text-destructive ml-1">
                  ({batchProgress.failed} failed)
                </span>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              !url.trim() ||
              isSubmitting ||
              (mode === "single" ? !isValidVideoUrl(url) : parseBatchUrls(url).length === 0)
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "batch" || mode === "smart"
                  ? t("downloadForm.batchStarting")
                  : t("downloadForm.starting")}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {mode === "batch" || mode === "smart"
                  ? t("downloadForm.batchDownloadBtn", { count: String(parseBatchUrls(url).length) })
                  : t("downloadForm.downloadBtn")}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Format Picker 小组件：按 v1 的纯视频/纯音频分离展示（借鉴 #5）──
function FormatGroup({
  title,
  formats,
  selected,
  onSelect,
}: {
  title: string;
  formats: { format_id: string; quality?: string; resolution?: string | null; filesize?: number | null }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (formats.length === 0) return null;
  const humanSize = (b?: number | null) =>
    b ? (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)}G` : `${(b / 1024 ** 2).toFixed(0)}M`) : "";
  return (
    <div className="rounded-md border p-2 max-h-44 overflow-auto">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">{title}</p>
      {formats.map((f) => (
        <button
          key={f.format_id}
          type="button"
          onClick={() => onSelect(f.format_id)}
          className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-accent ${
            selected === f.format_id ? "bg-accent text-accent-foreground" : ""
          }`}
        >
          <span className="truncate">
            {f.resolution || f.quality || f.format_id}
            <span className="ml-1 text-muted-foreground">{f.format_id}</span>
          </span>
          <span className="text-muted-foreground">{humanSize(f.filesize)}</span>
        </button>
      ))}
    </div>
  );
}
