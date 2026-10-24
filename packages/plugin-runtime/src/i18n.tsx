"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

import en from "../locales/en.json";
import zh from "../locales/zh.json";
import ja from "../locales/ja.json";

export type Locale = "en" | "zh" | "ja";

const translations: Record<Locale, Record<string, unknown>> = {
  en,
  zh,
  ja,
};

/** Deep-merge a plugin's locale tree into the global translation table.
 *  Call before first render (plugin activate time) so t() picks it up. */
export function registerTranslations(locale: string, tree: Record<string, unknown>): void {
  const key = (locale in translations ? locale : "en") as Locale;
  deepMerge(translations[key], tree);
}

function deepMerge(target: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      deepMerge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else if (!(k in target)) {
      target[k] = v;
    }
  }
}

const STORAGE_KEY = "vytdl-language";
const DEFAULT_LOCALE: Locale = "zh";

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  if (!path || typeof path !== "string") return undefined;
  const keys = path.split(".");
  let value: unknown = obj;
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return typeof value === "string" ? value : undefined;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved && saved in translations) {
        return saved;
      }
    }
    return DEFAULT_LOCALE;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.documentElement.lang = newLocale;
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      if (!key || typeof key !== "string") return String(key ?? "");
      const messages = translations[locale] as Record<string, unknown>;
      let value = getNestedValue(messages, key);
      if (value && vars) {
        value = value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
      }
      return value ?? key;
    },
    [locale]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}
