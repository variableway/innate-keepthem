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
import type { DownloadOptions, VideoInfo, PlaylistInfo, ApiResponse } from "@/types";

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

// Supported platforms, shared by URL validation and the platform badge UI.
const PLATFORM_PATTERNS: { key: string; labelKey: string; pattern: RegExp }[] = [
  { key: "youtube", labelKey: "platform.youtube", pattern: /youtube\.com|youtu\.be/ },
  { key: "bilibili", labelKey: "platform.bilibili", pattern: /bilibili\.com|b23\.tv/ },
  { key: "xiaohongshu", labelKey: "platform.xiaohongshu", pattern: /xiaohongshu\.com|xhslink\.com/ },
  { key: "twitter", labelKey: "platform.twitter", pattern: /twitter\.com|x\.com/ },
  { key: "tiktok", labelKey: "platform.tiktok", pattern: /tiktok\.com/ },
  { key: "vimeo", labelKey: "platform.vimeo", pattern: /vimeo\.com/ },
  { key: "twitch", labelKey: "platform.twitch", pattern: /twitch\.tv/ },
  { key: "facebook", labelKey: "platform.facebook", pattern: /facebook\.com|fb\.watch/ },
  { key: "instagram", labelKey: "platform.instagram", pattern: /instagram\.com/ },
  { key: "dailymotion", labelKey: "platform.dailymotion", pattern: /dailymotion\.com|dai\.ly/ },
  { key: "nicovideo", labelKey: "platform.nicovideo", pattern: /nicovideo\.jp/ },
];

function detectPlatform(url: string): { key: string; labelKey: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return PLATFORM_PATTERNS.find((p) => p.pattern.test(trimmed)) ?? null;
}

function isValidVideoUrl(url: string): boolean {
  if (!url.trim()) return false;
  return detectPlatform(url) !== null;
}

function hostnameOf(url: string): string {
  try {
    const withScheme = url.includes("://") ? url : `https://${url}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Detect playlist/collection URLs per platform.
// - YouTube keeps the original heuristic (playlist pages, list=, channel/user/handle tabs)
//   plus the channel "playlists" tab (a collection of playlists)
// - Bilibili: bangumi season/media list, favorites, collections and series
// - multi-P (watch) URLs stay single-download unless the playlist checkbox is forced
function isPlaylistUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be") {
    return /playlist|list=|\/channel\/|\/user\/|\/c\/|\/@[^/]+|\/playlists\b/.test(url);
  }
  if (/(^|\.)bilibili\.com$/.test(host)) {
    return /\/bangumi\/play\/(ss|md)|favlist|medialist|collectiondetail|seriesdetail/.test(url);
  }
  return /playlist|list=/.test(url);
}

// A pure collection URL shows the collection preview card and auto-enables
// playlist mode. watch?v=X&list=Y is ambiguous (usually "this video from a
// playlist"), so it keeps the single-video preview.
function isCollectionUrl(url: string): boolean {
  if (/[?&]v=[^&]*/.test(url) && /[?&]list=/.test(url)) return false;
  return isPlaylistUrl(url);
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

  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const playlistAbortRef = useRef<AbortController | null>(null);

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

    // Frontend timeout must exceed the backend caps (web 40s / Tauri 30s) so
    // slow-but-successful yt-dlp extractions are not reported as failures.
    const timeoutMs = 45000;
    const maxRetries = 2;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        // Cancel the underlying HTTP request (web mode); Tauri IPC cannot be
        // cancelled, but stale responses are ignored via the abort flag.
        abortController.abort();
        const err = new Error(t("downloadForm.requestTimeout")) as Error & { isTimeout?: boolean };
        err.isTimeout = true;
        reject(err);
      }, timeoutMs);
    });

    let willRetry = false;
    try {
      console.log("[DownloadForm] Fetching video info for:", url, "retry:", retryAttempt);
      const response = await Promise.race([
        apiInvoke<ApiResponse<VideoInfo>>("get_video_info", { url }, { signal: abortController.signal }),
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
      const isTimeout = Boolean((err as { isTimeout?: boolean }).isTimeout);
      // Timeout errors carry a language-independent tag, so retry detection
      // works in every locale (the message itself is translated).
      if (isTimeout && retryAttempt < maxRetries) {
        willRetry = true;
        setInfoRetryCount(retryAttempt + 1);
        setTimeout(() => fetchVideoInfo(retryAttempt + 1), 1500);
      } else if (!abortController.signal.aborted) {
        setInfoError(String(err));
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (!willRetry) done();
    }
  }, [url, t]);

  // Fetch collection metadata (get_playlist_info) for collection URLs
  const fetchPlaylistInfo = useCallback(async () => {
    const abortController = new AbortController();
    playlistAbortRef.current = abortController;

    setIsLoadingPlaylist(true);
    setPlaylistError(null);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error(t("downloadForm.collectionLoadFailed")));
      }, 60000);
    });

    try {
      const response = await Promise.race([
        apiInvoke<ApiResponse<PlaylistInfo>>(
          "get_playlist_info",
          { url },
          { signal: abortController.signal }
        ),
        timeoutPromise,
      ]);
      if (!abortController.signal.aborted) {
        if (response.success && response.data) {
          setPlaylistInfo(response.data);
        } else {
          setPlaylistError(response.error || t("downloadForm.collectionLoadFailed"));
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        setPlaylistError(String(err));
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (!abortController.signal.aborted) setIsLoadingPlaylist(false);
    }
  }, [url, t]);

  // Pure collection URLs (playlist pages, channels, Bilibili 合集/番剧/收藏夹,
  // the YouTube "playlists" tab) show a collection preview and auto-enable
  // playlist mode instead of the single-video info card.
  const collectionDetected = mode === "single" && isValidVideoUrl(url) && isCollectionUrl(url);

  useEffect(() => {
    setVideoInfo(null);
    setInfoError(null);
    setInfoRetryCount(0);

    if (infoAbortRef.current) {
      infoAbortRef.current.abort();
    }

    if (!isValidVideoUrl(url) || isCollectionUrl(url)) {
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
    setPlaylistInfo(null);
    setPlaylistError(null);

    if (playlistAbortRef.current) {
      playlistAbortRef.current.abort();
    }

    if (!collectionDetected) {
      setIsLoadingPlaylist(false);
      return;
    }

    const timer = setTimeout(() => {
      fetchPlaylistInfo();
    }, 500);

    return () => {
      clearTimeout(timer);
      if (playlistAbortRef.current) {
        playlistAbortRef.current.abort();
      }
    };
  }, [collectionDetected, fetchPlaylistInfo]);

  // Auto-enable playlist mode for collections; users can still uncheck it
  useEffect(() => {
    if (collectionDetected) {
      setIsPlaylist(true);
    }
  }, [collectionDetected]);

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

  // Summarize detected platforms for a batch of URLs
  const platformSummary = (urls: string[]): { key: string; labelKey: string; count: number }[] => {
    const counts = new Map<string, { labelKey: string; count: number }>();
    for (const u of urls) {
      const p = detectPlatform(u);
      if (!p) continue;
      const entry = counts.get(p.key);
      if (entry) entry.count++;
      else counts.set(p.key, { labelKey: p.labelKey, count: 1 });
    }
    return [...counts.entries()].map(([key, v]) => ({ key, ...v }));
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
            <div className="flex items-center gap-2">
              <Label htmlFor="url">
                {mode === "batch" || mode === "smart"
                  ? t("downloadForm.batchUrlLabel")
                  : t("downloadForm.urlLabel")}
              </Label>
              {mode === "single" && detectPlatform(url) && (
                <Badge variant="outline" className="text-[11px] px-2 py-0">
                  {t(detectPlatform(url)!.labelKey)}
                </Badge>
              )}
            </div>

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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {t("downloadForm.validUrlsCount", { count: String(parseBatchUrls(url).length) })}
                    </span>
                    {platformSummary(parseBatchUrls(url)).map((p) => (
                      <Badge key={p.key} variant="outline" className="text-[10px] px-1.5 py-0">
                        {t(p.labelKey)}×{p.count}
                      </Badge>
                    ))}
                  </div>
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

          {collectionDetected && (
            <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-medium text-sm truncate">
                    {playlistInfo?.title || t("downloadForm.collectionDetected")}
                  </h4>
                  {playlistInfo?.uploader && (
                    <p className="text-xs text-muted-foreground truncate">{playlistInfo.uploader}</p>
                  )}
                </div>
                {playlistInfo && (
                  <Badge variant="secondary" className="shrink-0">
                    {t("downloadForm.collectionItems", { count: String(playlistInfo.entries.length) })}
                  </Badge>
                )}
              </div>

              {isLoadingPlaylist && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{t("downloadForm.collectionLoading")}</span>
                </div>
              )}

              {playlistError && (
                <div className="flex items-center gap-2 text-destructive">
                  <X className="h-4 w-4 shrink-0" />
                  <span className="text-sm flex-1">{playlistError}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchPlaylistInfo()}
                    className="h-7 px-2 text-xs"
                  >
                    {t("downloadForm.retry")}
                  </Button>
                </div>
              )}

              {playlistInfo && playlistInfo.entries.length > 0 && (
                <div className="max-h-60 overflow-auto rounded-md border divide-y">
                  {playlistInfo.entries.slice(0, 100).map((entry, index) => (
                    <div key={`${entry.id}-${index}`} className="flex items-center gap-3 px-3 py-2">
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
                          <p className="text-xs text-muted-foreground">{formatDuration(entry.duration)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">{t("downloadForm.collectionModeHint")}</p>
            </div>
          )}

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

          <div className="flex flex-wrap items-center gap-4">
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
            {mode === "smart" && (
              <span className="text-xs text-muted-foreground">
                {t("downloadForm.playlistForceHint")}
              </span>
            )}
          </div>

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
