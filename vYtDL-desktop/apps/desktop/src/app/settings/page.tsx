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
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const { t, locale, setLocale } = useTranslation();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
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
    // Ensure locale is synced before saving
    setLocale(localSettings.language as Locale);
    await updateSettings(localSettings);
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
      <div className="p-6">
        <p className="text-muted-foreground">{t("settings.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("settings.title")}</h1>
        <p className="text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
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

            <div className="grid grid-cols-2 gap-4">
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
                value={localSettings.max_concurrent_downloads}
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

        <Card>
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
    </div>
  );
}
