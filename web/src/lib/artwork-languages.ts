/** BCP-47 codes for artwork languages supported in the Studio. */
export const ARTWORK_LANGUAGE_CODES = [
  "en", "ja", "fr", "de", "es", "pt", "zh", "ko",
  "it", "ru", "nl", "sv", "pl", "tr", "ar", "da", "hi",
] as const;

export type ArtworkLanguageCode = typeof ARTWORK_LANGUAGE_CODES[number];

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
