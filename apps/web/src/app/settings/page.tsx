"use client";

import { useEffect, useState } from "react";
import { Save, FolderOpen, Key, Wrench, Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@vytdl/ui";
import { Button } from "@vytdl/ui";
import { Input } from "@vytdl/ui";
import { Label } from "@vytdl/ui";
import { Alert, AlertDescription } from "@vytdl/ui";
import { useSettingsStore } from "@/store/settingsStore";
import { useTranslation, type Locale } from "@/i18n";
import { MainContent } from "@/components/layout/main-content";
import { AgentCliSettings } from "@/components/settings/agent-cli-settings";
import type { Settings } from "@/types";

const QUALITY_OPTIONS = [
  { value: "best", labelKey: "downloadForm.bestQuality" },
  { value: "2160", labelKey: "downloadForm.quality4k" },
  { value: "1440", labelKey: "downloadForm.quality2k" },
  { value: "1080", labelKey: "downloadForm.quality1080" },
  { value: "720", labelKey: "downloadForm.quality720" },
  { value: "480", labelKey: "downloadForm.quality480" },
];

const FORMAT_OPTIONS = [
  { value: "mp4", labelKey: "downloadForm.formatMp4" },
  { value: "webm", labelKey: "downloadForm.formatWebm" },
  { value: "mkv", labelKey: "downloadForm.formatMkv" },
];

const AI_PROVIDERS = [
  { value: "", labelKey: "settings.aiDisabled" },
  { value: "openai", labelKey: "settings.aiOpenAI" },
  { value: "anthropic", labelKey: "settings.aiAnthropic" },
  { value: "gemini", labelKey: "settings.aiGemini" },
];

export default function SettingsPage() {
  const { settings, fetchSettings, updateSettings, isLoading } = useSettingsStore();
  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  const [cookieMode, setCookieMode] = useState<"none" | "text" | "file" | "browser">("none");
  const [cookieText, setCookieText] = useState("");
  const [cookieFile, setCookieFile] = useState("");
  const [cookieBrowser, setCookieBrowser] = useState("chrome");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const { t, locale, setLocale } = useTranslation();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (!localSettings || typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(`section-${hash}`)?.scrollIntoView({ behavior: "smooth" });
    });
  }, [localSettings]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      const c = settings.cookie;
      if (c && c.mode !== "none") {
        setCookieMode(c.mode);
        if (c.mode === "text") setCookieText(c.content);
        if (c.mode === "file") setCookieFile(c.path);
        if (c.mode === "browser") setCookieBrowser(c.browser);
      }
    }
  }, [settings]);

  // Sync i18n locale once when settings are first loaded from backend
  const [localeSynced, setLocaleSynced] = useState(false);
  useEffect(() => {
    if (!localeSynced && settings?.language) {
      setLocale(settings.language as Locale);
      setLocaleSynced(true);
    }
  }, [settings, localeSynced, setLocale]);

  const handleSave = async () => {
    if (!localSettings) return;
    setSaveStatus("idle");
    // 组装 Cookie 配置
    const cookie =
      cookieMode === "none" ? null :
      cookieMode === "text" ? { mode: "text", content: cookieText } :
      cookieMode === "file" ? { mode: "file", path: cookieFile } :
      { mode: "browser", browser: cookieBrowser };
    const merged = { ...localSettings, cookie };
    // Ensure locale is synced before saving
    setLocale(localSettings.language as Locale);
    await updateSettings(merged);
    if (useSettingsStore.getState().error) {
      setSaveStatus("error");
    } else {
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const updateField = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setLocalSettings((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  if (!localSettings) {
    return (
      <MainContent width="wide">
        <p className="text-muted-foreground">{t("settings.loading")}</p>
      </MainContent>
    );
  }

  return (
    <MainContent width="wide">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("settings.title")}</h1>
        <p className="text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      <div className="space-y-6">
        <Card id="section-download" className="scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              {t("settings.downloadSettings")}
            </CardTitle>
            <CardDescription>
              {t("settings.downloadDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="yt-dlp-path">{t("settings.ytdlpPathLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="yt-dlp-path"
                  value={localSettings.yt_dlp_path || ""}
                  onChange={(e) => updateField("yt_dlp_path", e.target.value || null)}
                  placeholder={t("settings.ytdlpPathPlaceholder")}
                />
                <Button variant="outline" size="icon">
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.ytdlpHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="output-dir">{t("settings.outputDirLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="output-dir"
                  value={localSettings.default_output_dir || ""}
                  onChange={(e) => updateField("default_output_dir", e.target.value || null)}
                  placeholder={t("settings.outputDirPlaceholder")}
                />
                <Button variant="outline" size="icon">
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">{t("settings.language")}</Label>
              <select
                id="language"
                value={locale}
                onChange={(e) => {
                  const lang = e.target.value as Locale;
                  setLocale(lang);
                  updateField("language", lang);
                }}
                className="w-full h-10 rounded-md border border-input bg-background px-3"
              >
                <option value="en">{t("settings.languageEn")}</option>
                <option value="zh">{t("settings.languageZh")}</option>
                <option value="ja">{t("settings.languageJa")}</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="default-quality">{t("settings.defaultQuality")}</Label>
                <select
                  id="default-quality"
                  value={localSettings.default_quality}
                  onChange={(e) => updateField("default_quality", e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3"
                >
                  {QUALITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-format">{t("settings.defaultFormat")}</Label>
                <select
                  id="default-format"
                  value={localSettings.default_format}
                  onChange={(e) => updateField("default_format", e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3"
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
              <Label htmlFor="max-concurrent">{t("settings.maxConcurrentDownloads")}</Label>
              <select
                id="max-concurrent"
                value={localSettings.max_concurrent_downloads ?? 3}
                onChange={(e) => updateField("max_concurrent_downloads", parseInt(e.target.value, 10))}
                className="w-full h-10 rounded-md border border-input bg-background px-3"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {t("settings.maxConcurrentHint")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card id="section-ai" className="scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("settings.aiSettings")}
            </CardTitle>
            <CardDescription>
              {t("settings.aiDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-provider">{t("settings.aiProvider")}</Label>
              <select
                id="ai-provider"
                value={localSettings.ai_provider || ""}
                onChange={(e) => updateField("ai_provider", e.target.value || null)}
                className="w-full h-10 rounded-md border border-input bg-background px-3"
              >
                {AI_PROVIDERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {localSettings.ai_provider && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ai-api-key">{t("settings.apiKeyLabel")}</Label>
                  <Input
                    id="ai-api-key"
                    type="password"
                    value={localSettings.ai_api_key || ""}
                    onChange={(e) => updateField("ai_api_key", e.target.value || null)}
                    placeholder={t("settings.apiKeyPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings.apiKeyHint")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-model">{t("settings.modelLabel")}</Label>
                  <Input
                    id="ai-model"
                    value={localSettings.ai_model || ""}
                    onChange={(e) => updateField("ai_model", e.target.value || null)}
                    placeholder={t("settings.modelPlaceholder")}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <AgentCliSettings settings={localSettings} onChange={updateField} />

        {saveStatus === "success" && (
          <Alert className="bg-green-500/10 text-green-600 border-green-500/20">
            <AlertDescription>{t("settings.saveSuccess")}</AlertDescription>
          </Alert>
        )}

        {saveStatus === "error" && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("settings.saveError")}
            </AlertDescription>
          </Alert>
        )}

        {/* ── 网络与高级（借鉴清单 #3/#6/#9）── */}
        <Card id="section-network">
          <CardHeader>
            <CardTitle>网络与高级 / Network &amp; Advanced</CardTitle>
            <CardDescription>Cookie、代理、下载引擎与后处理（借鉴 yt-dlp-gui / v2）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Cookie 模式</Label>
                <select
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={cookieMode}
                  onChange={(e) => setCookieMode(e.target.value as typeof cookieMode)}
                >
                  <option value="none">不使用</option>
                  <option value="text">粘贴 Cookie 文本</option>
                  <option value="file">cookies.txt 文件</option>
                  <option value="browser">从浏览器读取</option>
                </select>
              </div>
              {cookieMode === "browser" && (
                <div className="space-y-1">
                  <Label>浏览器</Label>
                  <select
                    className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                    value={cookieBrowser}
                    onChange={(e) => setCookieBrowser(e.target.value)}
                  >
                    {["chrome", "firefox", "edge", "brave", "chromium", "opera", "safari", "vivaldi"].map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}
              {cookieMode === "file" && (
                <div className="space-y-1">
                  <Label>cookies.txt 路径</Label>
                  <input
                    className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                    value={cookieFile}
                    onChange={(e) => setCookieFile(e.target.value)}
                    placeholder="/path/to/cookies.txt"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label>代理（如 http://127.0.0.1:7890，留空不使用）</Label>
                <input
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={localSettings?.proxy ?? ""}
                  onChange={(e) => localSettings && setLocalSettings({ ...localSettings, proxy: e.target.value || null })}
                  placeholder="http://127.0.0.1:7890"
                />
              </div>
              <div className="space-y-1">
                <Label>限速（如 2M）</Label>
                <input
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={localSettings?.rate_limit ?? ""}
                  onChange={(e) => localSettings && setLocalSettings({ ...localSettings, rate_limit: e.target.value || null })}
                  placeholder="2M"
                />
              </div>
              <div className="space-y-1">
                <Label>并发分片（1-16）</Label>
                <input
                  type="number" min={1} max={16}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={localSettings?.concurrent_fragments ?? ""}
                  onChange={(e) => localSettings && setLocalSettings({ ...localSettings, concurrent_fragments: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="space-y-1">
                <Label>文件名模板（留空用默认）</Label>
                <input
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={localSettings?.filename_template ?? ""}
                  onChange={(e) => localSettings && setLocalSettings({ ...localSettings, filename_template: e.target.value || null })}
                  placeholder="%(title).200s [%(id)s].%(ext)s"
                />
              </div>
              <div className="space-y-1">
                <Label>YouTube PO Token（可选）</Label>
                <input
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={localSettings?.po_token ?? ""}
                  onChange={(e) => localSettings && setLocalSettings({ ...localSettings, po_token: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label>extractor-args（可选，如 youtube:visitor_data=xxx）</Label>
                <input
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={localSettings?.extractor_args ?? ""}
                  onChange={(e) => localSettings && setLocalSettings({ ...localSettings, extractor_args: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label>yt-dlp 配置文件（可选；不填则强制 --ignore-config）</Label>
                <input
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={localSettings?.config_location ?? ""}
                  onChange={(e) => localSettings && setLocalSettings({ ...localSettings, config_location: e.target.value || null })}
                />
              </div>
            </div>
            {cookieMode === "text" && (
              <div className="space-y-1">
                <Label>Netscape Cookie 文本（明文保存在应用数据目录）</Label>
                <textarea
                  className="w-full h-20 rounded-md border bg-transparent px-3 py-2 text-xs font-mono"
                  value={cookieText}
                  onChange={(e) => setCookieText(e.target.value)}
                  placeholder="# Netscape HTTP Cookie File ..."
                />
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              {([
                ["embed_thumbnail", "下载后嵌入缩略图"],
                ["embed_metadata", "嵌入元数据"],
                ["embed_chapters", "嵌入章节"],
                ["sponsorblock_remove", "SponsorBlock 跳过广告段"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={(localSettings?.[key] as boolean) ?? false}
                    onChange={(e) => localSettings && setLocalSettings({ ...localSettings, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading} className="min-w-[120px]">
            {isLoading ? (
              t("common.saving")
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t("common.save")}
              </>
            )}
          </Button>
        </div>
        </div>
    </MainContent>
  );
}
