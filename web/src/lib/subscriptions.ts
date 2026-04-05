/**
 * Subscription helpers — server-side via issuer.
 */

export type ThemeSubscription = {
  creatorId: string;
  creatorDisplayName: string;
  themeId: string;
  themeName: string;
  coverUrl: string | null;
  nodeBase: string;
  subscribedAt: string;
  language?: string | null;
};

export type FavouriteCreator = {
  creatorId: string;
  creatorDisplayName: string;
  nodeBase: string;
  addedAt: string;
};

export type CollectionSubscription = {
  collectionTmdbId: string;
  collectionName: string;
  themeId: string;
  themeName: string;
  language: string | null;
  nodeBase: string;
  subscribedAt: string;
};

export type TvShowSubscription = {
  showTmdbId: string;
  showName: string;
  themeId: string;
  themeName: string;
  language: string | null;
  nodeBase: string;
  subscribedAt: string;
};

// ─── Theme subscriptions ──────────────────────────────────────────────────────

// Async — fetches from issuer
export async function getThemeSubscriptions(token: string): Promise<ThemeSubscription[]> {
  const { issuerGetThemeSubscriptions } = await import("@/lib/issuer");
  return issuerGetThemeSubscriptions(token);
}

// Async — posts to issuer (idempotent)
export async function subscribeTheme(
  token: string,
  sub: Omit<ThemeSubscription, "subscribedAt">
): Promise<void> {
  const { issuerSubscribeTheme } = await import("@/lib/issuer");
  return issuerSubscribeTheme(token, sub);
}

// Async — deletes from issuer
export async function unsubscribeTheme(token: string, themeId: string): Promise<void> {
  const { issuerUnsubscribeTheme } = await import("@/lib/issuer");
  return issuerUnsubscribeTheme(token, themeId);
}

// Sync check against a locally-held list (passed in, not re-fetched)
export function isSubscribed(subs: ThemeSubscription[], themeId: string): boolean {
  return subs.some((s) => s.themeId === themeId);
}

// ─── Favourite Creators ───────────────────────────────────────────────────────

export async function getFavouriteCreators(token: string): Promise<FavouriteCreator[]> {
  const { issuerGetFavouriteCreators } = await import("@/lib/issuer");
  return issuerGetFavouriteCreators(token);
}

export async function addFavouriteCreator(
  token: string,
  fav: Omit<FavouriteCreator, "addedAt">
): Promise<void> {
  const { issuerAddFavouriteCreator } = await import("@/lib/issuer");
  return issuerAddFavouriteCreator(token, fav);
}

export async function removeFavouriteCreator(token: string, creatorId: string): Promise<void> {
  const { issuerRemoveFavouriteCreator } = await import("@/lib/issuer");
  return issuerRemoveFavouriteCreator(token, creatorId);
}

// ─── Collection Subscriptions ─────────────────────────────────────────────────

export async function getCollectionSubscriptions(token: string): Promise<CollectionSubscription[]> {
  const { issuerGetCollectionSubscriptions } = await import("@/lib/issuer");
  return issuerGetCollectionSubscriptions(token);
}

export async function subscribeCollection(
  token: string,
  sub: Omit<CollectionSubscription, "subscribedAt">
): Promise<void> {
  const { issuerSubscribeCollection } = await import("@/lib/issuer");
  return issuerSubscribeCollection(token, sub);
}

export async function unsubscribeCollection(
  token: string,
  collectionTmdbId: string,
  themeId: string,
  language: string | null
): Promise<void> {
  const { issuerUnsubscribeCollection } = await import("@/lib/issuer");
  return issuerUnsubscribeCollection(token, collectionTmdbId, themeId, language);
}

// ─── TV Show Subscriptions ────────────────────────────────────────────────────

export async function getTvShowSubscriptions(token: string): Promise<TvShowSubscription[]> {
  const { issuerGetTvShowSubscriptions } = await import("@/lib/issuer");
  return issuerGetTvShowSubscriptions(token);
}

export async function subscribeTvShow(
  token: string,
  sub: Omit<TvShowSubscription, "subscribedAt">
): Promise<void> {
  const { issuerSubscribeTvShow } = await import("@/lib/issuer");
  return issuerSubscribeTvShow(token, sub);
}

export async function unsubscribeTvShow(
  token: string,
  showTmdbId: string,
  themeId: string,
  language: string | null
): Promise<void> {
  const { issuerUnsubscribeTvShow } = await import("@/lib/issuer");
  return issuerUnsubscribeTvShow(token, showTmdbId, themeId, language);
}

// ─── User Preferences ─────────────────────────────────────────────────────────

export async function getPreferredLanguage(token: string): Promise<string | null> {
  const { issuerGetPreference } = await import("@/lib/issuer");
  return issuerGetPreference(token, "preferred_language");
}

export async function savePreferredLanguage(token: string, language: string): Promise<void> {
  const { issuerSetPreference } = await import("@/lib/issuer");
  return issuerSetPreference(token, "preferred_language", language);
}
