/** BCP-47 codes for artwork languages supported in the Studio. */
export const ARTWORK_LANGUAGE_CODES = [
  "en", "ja", "fr", "de", "es", "pt", "zh", "ko",
  "it", "ru", "nl", "sv", "pl", "tr", "ar", "da", "hi",
] as const;

export type ArtworkLanguageCode = typeof ARTWORK_LANGUAGE_CODES[number];

/** Maps BCP-47 language codes to the most representative ISO 3166-1 country code for flag emoji. */
const LANGUAGE_COUNTRY: Record<string, string> = {
  en: "GB", ja: "JP", fr: "FR", de: "DE", es: "ES", pt: "PT",
  zh: "CN", ko: "KR", it: "IT", ru: "RU", nl: "NL", sv: "SE",
  pl: "PL", tr: "TR", ar: "SA", da: "DK", hi: "IN",
};

/**
 * Returns the flag emoji for a BCP-47 language code, or "" if unknown.
 * Uses Unicode Regional Indicator Symbols to build the flag from the country code.
 */
export function getLanguageFlag(code: string): string {
  const cc = LANGUAGE_COUNTRY[code.toLowerCase()];
  if (!cc) return "";
  return [...cc.toUpperCase()].map((c) => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
}

/**
 * Returns the localised display name for a BCP-47 language code in the given
 * UI locale (e.g. getLanguageLabel("en", "fr") → "anglais").
 * Falls back to the raw code if Intl.DisplayNames is unavailable.
 */
export function getLanguageLabel(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
