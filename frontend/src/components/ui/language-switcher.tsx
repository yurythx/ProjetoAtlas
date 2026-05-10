"use client";

import { useLocale, useTranslations } from "next-intl";
import { LOCALE_COOKIE, locales, type Locale } from "@/i18n/config";

const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
};

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Language");

  function switchLocale(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div className={className}>
      <label className="sr-only">{t("label")}</label>
      <select
        value={locale}
        onChange={(e) => switchLocale(e.target.value as Locale)}
        className="text-sm bg-transparent border border-input rounded-md px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={t("label")}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
