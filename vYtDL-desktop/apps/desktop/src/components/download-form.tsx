"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Download, Loader2, Clock, User, Film, History, X } from "lucide-react";
import { Button } from "@vytdl/ui";
import { Input } from "@vytdl/ui";
import { Label } from "@vytdl/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@vytdl/ui";
import { Badge } from "@vytdl/ui";
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    clearError();
    setIsSubmitting(true);

    const options: DownloadOptions = {
      url: url.trim(),
      is_playlist: isPlaylist,
      quality,
      format,
      sub_langs: subLangs,
      write_subs: writeSubs,
      write_auto_subs: writeAutoSubs,
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
            <Label htmlFor="url">{t("downloadForm.urlLabel")}</Label>
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
          </div>

          {(isLoadingInfo || videoInfo || infoError) && url && isValidVideoUrl(url) && (
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
            </div>
          )}

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

          <Button
            type="submit"
            className="w-full"
            disabled={!url.trim() || isSubmitting || !isValidVideoUrl(url)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("downloadForm.starting")}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t("downloadForm.downloadBtn")}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
