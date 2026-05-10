export const locales = ['pt', 'en'] as const;
export const defaultLocale = 'pt' as const;
export const LOCALE_COOKIE = 'ATLAS_LOCALE';

export type Locale = (typeof locales)[number];
