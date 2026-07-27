"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/i18n";
import { MainContent } from "@/components/layout/main-content";
import { Settings, Languages, Palette, Brain, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
type Locale = "zh" | "en";

export default function SettingsPage() {
  const { t, locale, setLocale } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load theme from localStorage or system preference
    const savedTheme = localStorage.getItem("contentforge-theme") as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("contentforge-theme", newTheme);

    // Apply theme
    const root = document.documentElement;
    if (newTheme === "dark") {
      root.classList.add("dark");
    } else if (newTheme === "light") {
      root.classList.remove("dark");
    } else {
      // System preference
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate saving
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
    <MainContent width="wide" className="min-w-0 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      {/* General Settings */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("settings.generalSettings")}</h2>
        </div>

        <div className="p-6 border border-border rounded-lg space-y-6">
          {/* Language */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Languages className="w-4 h-4 text-muted-foreground" />
              {t("settings.language")}
            </label>
            <div className="flex gap-2">
              {(["zh", "en"] as Locale[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLocale(lang)}
                  className={cn(
                    "px-4 py-2 text-sm rounded-md border transition-colors",
                    locale === lang
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  {t(`settings.language${lang === "zh" ? "Zh" : "En"}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Appearance Settings */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("settings.appearanceSettings")}</h2>
        </div>

        <div className="p-6 border border-border rounded-lg space-y-6">
          {/* Theme */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("settings.theme")}</label>
            <div className="flex gap-2">
              {(["light", "dark", "system"] as Theme[]).map((tOption) => (
                <button
                  key={tOption}
                  onClick={() => handleThemeChange(tOption)}
                  className={cn(
                    "px-4 py-2 text-sm rounded-md border transition-colors capitalize",
                    theme === tOption
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  {t(`settings.theme${tOption.charAt(0).toUpperCase() + tOption.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI Settings */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("settings.aiSettings")}</h2>
        </div>

        <div className="p-6 border border-border rounded-lg space-y-6">
          {/* API Key */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("settings.apiKeyLabel")}</label>
            <input
              type="password"
              placeholder={t("settings.apiKeyPlaceholder")}
              className="w-full max-w-md px-3 py-2 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t("settings.apiKeyHint")}</p>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-colors",
            saving
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("common.saving")}
            </>
          ) : saved ? (
            <>
              <Check className="w-4 h-4" />
              {t("settings.saveSuccess")}
            </>
          ) : (
            t("common.save")
          )}
        </button>
      </div>
    </MainContent>
  );
}
