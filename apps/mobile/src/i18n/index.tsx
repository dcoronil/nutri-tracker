import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getItem as getStoredItem, setItem as setStoredItem } from "../platform/storage";

import { enTranslations } from "./locales/en";
import { esOverrides } from "./locales/es";

export type AppLanguage = "es" | "en";

type TranslateVars = Record<string, string | number | null | undefined>;

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  t: (key: string, vars?: TranslateVars) => string;
};

const LANGUAGE_STORAGE_KEY = "nutri_tracker_language";

const dictionaries: Record<AppLanguage, Record<string, string>> = {
  es: esOverrides,
  en: enTranslations,
};

let runtimeLanguage: AppLanguage = "es";

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, rawKey: string) => {
    const value = vars[rawKey];
    return value === null || value === undefined ? "" : String(value);
  });
}

function translateForLanguage(language: AppLanguage, key: string, vars?: TranslateVars): string {
  if (!key) {
    return "";
  }
  const template = dictionaries[language][key] ?? key;
  return interpolate(template, vars);
}

export function tGlobal(key: string, vars?: TranslateVars): string {
  return translateForLanguage(runtimeLanguage, key, vars);
}

const i18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: import("react").ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("es");

  useEffect(() => {
    runtimeLanguage = language;
  }, [language]);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await getStoredItem(LANGUAGE_STORAGE_KEY);
        if (stored === "es" || stored === "en") {
          setLanguageState(stored);
        }
      } catch {
        // no-op: keep default language
      }
    })();
  }, []);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    runtimeLanguage = nextLanguage;
    try {
      await setStoredItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // no-op: language still applies in-memory
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key: string, vars?: TranslateVars) => translateForLanguage(language, key, vars),
    }),
    [language, setLanguage],
  );

  return <i18nContext.Provider value={value}>{children}</i18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(i18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
