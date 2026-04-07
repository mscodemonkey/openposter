export const ISSUER_BASE_URL =
  process.env.NEXT_PUBLIC_ISSUER_BASE_URL || "http://localhost:8085";

export type IssuerUser = {
  user_id: string;
  email: string;
  display_name: string | null;
  handle: string | null;
};

export type SignupResponse = { user: IssuerUser; token: string };
export type LoginResponse = { user: IssuerUser; token: string };
export type InspectNodeResponse = {
  node: {
    node_id: string;
    status: "unclaimed" | "owned_by_you" | "owned_by_other";
    owner_user_id: string | null;
    owner_name: string | null;
  };
  node_info: {
    name?: string;
    operator?: { name?: string; display_name?: string | null };
  } | null;
};
export type ClaimNodeResponse = {
  node: {
    node_id: string;
    owner_user_id: string;
    owner_name: string | null;
  };
  node_info: unknown;
};
export type CheckPublicUrlResponse = {
  public_url: string;
  reachable: boolean;
  matches_node: boolean;
  details?: {
    url?: string;
    status?: number;
    fetched_node_id?: string;
    name?: string;
    error?: string;
  };
};

export function issuerBase(): string {
  return ISSUER_BASE_URL.replace(/\/+$/, "");
}

async function readErrorMessage(r: Response, fallback: string): Promise<string> {
  const j = (await r.json().catch(() => null)) as unknown;
  const msg = (j as { error?: { message?: string } } | null)?.error?.message;
  return msg || fallback;
}

export async function issuerSignup(params: {
  email: string;
  password: string;
  display_name?: string;
}): Promise<SignupResponse> {
  const r = await fetch(`${issuerBase()}/v1/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      display_name: params.display_name || null,
    }),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `signup failed: ${r.status}`));
  }
  return (await r.json()) as SignupResponse;
}

export async function issuerLogin(params: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  const r = await fetch(`${issuerBase()}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: params.email, password: params.password }),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `login failed: ${r.status}`));
  }
  return (await r.json()) as LoginResponse;
}

export async function issuerMe(token: string): Promise<IssuerUser> {
  const r = await fetch(`${issuerBase()}/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`me failed: ${r.status}`);
  const json = (await r.json()) as { user: IssuerUser };
  return json.user;
}

export async function issuerHandleAvailability(handle: string): Promise<boolean> {
  const u = new URL(`${issuerBase()}/v1/creator/availability`);
  u.searchParams.set("handle", handle);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`availability failed: ${r.status}`);
  const json = (await r.json()) as { available: boolean };
  return !!json.available;
}

export async function issuerClaimHandle(token: string, handle: string): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/creator/claim_handle`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ handle }),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `claim handle failed: ${r.status}`));
  }
}

export async function issuerClaimNode(
  token: string,
  params: { local_url: string; node_admin_token: string; owner_name?: string }
): Promise<ClaimNodeResponse> {
  const r = await fetch(`${issuerBase()}/v1/nodes/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `claim node failed: ${r.status}`));
  }
  return (await r.json()) as ClaimNodeResponse;
}

export async function issuerInspectNode(
  token: string,
  params: { local_url: string; node_admin_token: string }
): Promise<InspectNodeResponse> {
  const r = await fetch(`${issuerBase()}/v1/nodes/inspect`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `inspect node failed: ${r.status}`));
  }
  return (await r.json()) as InspectNodeResponse;
}

export async function issuerCheckPublicUrl(
  token: string,
  params: { node_id: string; public_url: string }
): Promise<CheckPublicUrlResponse> {
  const r = await fetch(`${issuerBase()}/v1/nodes/check_public_url`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `check public url failed: ${r.status}`));
  }
  return (await r.json()) as CheckPublicUrlResponse;
}

export async function issuerAttachUrl(
  token: string,
  params: { node_id: string; public_url: string }
): Promise<unknown> {
  const r = await fetch(`${issuerBase()}/v1/nodes/attach_url`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    throw new Error(await readErrorMessage(r, `attach url failed: ${r.status}`));
  }
  return (await r.json()) as unknown;
}

// ─── Theme subscriptions ──────────────────────────────────────────────────────

import type { ThemeSubscription, FavouriteCreator, CollectionSubscription, TvShowSubscription } from "@/lib/subscriptions";

export async function issuerGetThemeSubscriptions(token: string): Promise<ThemeSubscription[]> {
  const r = await fetch(`${issuerBase()}/v1/me/subscriptions/themes`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`get subscriptions failed: ${r.status}`);
  const json = (await r.json()) as { subscriptions: Array<{
    creator_id: string;
    creator_display_name: string | null;
    theme_id: string;
    theme_name: string | null;
    cover_url: string | null;
    node_base: string;
    subscribed_at: string;
  }> };
  return json.subscriptions.map((s) => ({
    creatorId: s.creator_id,
    creatorDisplayName: s.creator_display_name ?? "",
    themeId: s.theme_id,
    themeName: s.theme_name ?? "",
    coverUrl: s.cover_url,
    nodeBase: s.node_base,
    subscribedAt: s.subscribed_at,
  }));
}

export async function issuerSubscribeTheme(
  token: string,
  sub: Omit<ThemeSubscription, "subscribedAt">
): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/me/subscriptions/themes`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      creator_id: sub.creatorId,
      creator_display_name: sub.creatorDisplayName,
      theme_id: sub.themeId,
      theme_name: sub.themeName,
      cover_url: sub.coverUrl,
      node_base: sub.nodeBase,
    }),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r, `subscribe failed: ${r.status}`));
}

export async function issuerUnsubscribeTheme(token: string, themeId: string): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/me/subscriptions/themes/${encodeURIComponent(themeId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404) throw new Error(`unsubscribe failed: ${r.status}`);
}

// ─── Favourite Creators ───────────────────────────────────────────────────────

export async function issuerGetFavouriteCreators(token: string): Promise<FavouriteCreator[]> {
  const r = await fetch(`${issuerBase()}/v1/me/favourites/creators`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`get favourites failed: ${r.status}`);
  const json = (await r.json()) as { favourites: Array<{
    creator_id: string;
    creator_display_name: string | null;
    node_base: string;
    added_at: string;
  }> };
  return json.favourites.map((f) => ({
    creatorId: f.creator_id,
    creatorDisplayName: f.creator_display_name ?? "",
    nodeBase: f.node_base,
    addedAt: f.added_at,
  }));
}

export async function issuerAddFavouriteCreator(
  token: string,
  fav: Omit<FavouriteCreator, "addedAt">
): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/me/favourites/creators`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      creator_id: fav.creatorId,
      creator_display_name: fav.creatorDisplayName,
      node_base: fav.nodeBase,
    }),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r, `add favourite failed: ${r.status}`));
}

export async function issuerRemoveFavouriteCreator(token: string, creatorId: string): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/me/favourites/creators/${encodeURIComponent(creatorId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404) throw new Error(`remove favourite failed: ${r.status}`);
}

// ─── Collection Subscriptions ─────────────────────────────────────────────────

export async function issuerGetCollectionSubscriptions(token: string): Promise<CollectionSubscription[]> {
  const r = await fetch(`${issuerBase()}/v1/me/subscriptions/collections`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`get collection subscriptions failed: ${r.status}`);
  const json = (await r.json()) as { subscriptions: Array<{
    collection_tmdb_id: string;
    collection_name: string | null;
    theme_id: string;
    theme_name: string | null;
    language: string | null;
    node_base: string;
    subscribed_at: string;
  }> };
  return json.subscriptions.map((s) => ({
    collectionTmdbId: s.collection_tmdb_id,
    collectionName: s.collection_name ?? "",
    themeId: s.theme_id,
    themeName: s.theme_name ?? "",
    language: s.language,
    nodeBase: s.node_base,
    subscribedAt: s.subscribed_at,
  }));
}

export async function issuerSubscribeCollection(
  token: string,
  sub: Omit<CollectionSubscription, "subscribedAt">
): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/me/subscriptions/collections`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      collection_tmdb_id: sub.collectionTmdbId,
      collection_name: sub.collectionName,
      theme_id: sub.themeId,
      theme_name: sub.themeName,
      language: sub.language,
      node_base: sub.nodeBase,
    }),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r, `subscribe collection failed: ${r.status}`));
}

export async function issuerUnsubscribeCollection(
  token: string,
  collectionTmdbId: string,
  themeId: string,
  language: string | null
): Promise<void> {
  const u = new URL(`${issuerBase()}/v1/me/subscriptions/collections/${encodeURIComponent(collectionTmdbId)}`);
  u.searchParams.set("theme_id", themeId);
  if (language !== null) u.searchParams.set("language", language);
  const r = await fetch(u.toString(), {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404) throw new Error(`unsubscribe collection failed: ${r.status}`);
}

// ─── TV Show Subscriptions ────────────────────────────────────────────────────

export async function issuerGetTvShowSubscriptions(token: string): Promise<TvShowSubscription[]> {
  const r = await fetch(`${issuerBase()}/v1/me/subscriptions/tv`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`get tv subscriptions failed: ${r.status}`);
  const json = (await r.json()) as { subscriptions: Array<{
    show_tmdb_id: string;
    show_name: string | null;
    theme_id: string;
    theme_name: string | null;
    language: string | null;
    node_base: string;
    subscribed_at: string;
  }> };
  return json.subscriptions.map((s) => ({
    showTmdbId: s.show_tmdb_id,
    showName: s.show_name ?? "",
    themeId: s.theme_id,
    themeName: s.theme_name ?? "",
    language: s.language,
    nodeBase: s.node_base,
    subscribedAt: s.subscribed_at,
  }));
}

export async function issuerSubscribeTvShow(
  token: string,
  sub: Omit<TvShowSubscription, "subscribedAt">
): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/me/subscriptions/tv`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      show_tmdb_id: sub.showTmdbId,
      show_name: sub.showName,
      theme_id: sub.themeId,
      theme_name: sub.themeName,
      language: sub.language,
      node_base: sub.nodeBase,
    }),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r, `subscribe tv show failed: ${r.status}`));
}

export async function issuerUnsubscribeTvShow(
  token: string,
  showTmdbId: string,
  themeId: string,
  language: string | null
): Promise<void> {
  const u = new URL(`${issuerBase()}/v1/me/subscriptions/tv/${encodeURIComponent(showTmdbId)}`);
  u.searchParams.set("theme_id", themeId);
  if (language !== null) u.searchParams.set("language", language);
  const r = await fetch(u.toString(), {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404) throw new Error(`unsubscribe tv show failed: ${r.status}`);
}

// ─── User Preferences ─────────────────────────────────────────────────────────

export async function issuerGetPreference(token: string, key: string): Promise<string | null> {
  const r = await fetch(`${issuerBase()}/v1/me/preferences/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`get preference failed: ${r.status}`);
  const json = (await r.json()) as { key: string; value: string | null };
  return json.value;
}

export async function issuerSetPreference(token: string, key: string, value: string): Promise<void> {
  const r = await fetch(`${issuerBase()}/v1/me/preferences/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ value }),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r, `set preference failed: ${r.status}`));
}
