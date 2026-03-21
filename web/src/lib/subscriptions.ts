/**
 * Theme subscription helpers — localStorage MVP.
 * Consumers can subscribe to a creator's theme to bookmark it and track updates.
 */

const STORAGE_KEY = "openposter_subscriptions";

export type ThemeSubscription = {
  creatorId: string;
  creatorDisplayName: string;
  themeId: string;
  themeName: string;
  coverUrl: string | null;
  nodeBase: string;
  subscribedAt: string;
};

export function getSubscriptions(): ThemeSubscription[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ThemeSubscription[];
  } catch {
    return [];
  }
}

export function isSubscribed(themeId: string): boolean {
  return getSubscriptions().some((s) => s.themeId === themeId);
}

export function subscribe(sub: ThemeSubscription): void {
  const existing = getSubscriptions().filter((s) => s.themeId !== sub.themeId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, sub]));
}

export function unsubscribe(themeId: string): void {
  const existing = getSubscriptions().filter((s) => s.themeId !== themeId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

// ─── Creator subscriptions ────────────────────────────────────────────────────

const CREATOR_STORAGE_KEY = "openposter_creator_subscriptions";

export type CreatorSubscription = {
  creatorId: string;
  creatorDisplayName: string;
  nodeBase: string;
  subscribedAt: string;
};

export function getCreatorSubscriptions(): CreatorSubscription[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CREATOR_STORAGE_KEY) ?? "[]") as CreatorSubscription[];
  } catch { return []; }
}

export function isSubscribedToCreator(creatorId: string): boolean {
  return getCreatorSubscriptions().some((s) => s.creatorId === creatorId);
}

export function subscribeCreator(sub: Omit<CreatorSubscription, "subscribedAt">): void {
  const existing = getCreatorSubscriptions().filter((s) => s.creatorId !== sub.creatorId);
  localStorage.setItem(CREATOR_STORAGE_KEY, JSON.stringify([
    ...existing,
    { ...sub, subscribedAt: new Date().toISOString() },
  ]));
}

export function unsubscribeCreator(creatorId: string): void {
  const existing = getCreatorSubscriptions().filter((s) => s.creatorId !== creatorId);
  localStorage.setItem(CREATOR_STORAGE_KEY, JSON.stringify(existing));
}
