export type PlexConfig = {
  baseUrl: string;
  token: string;
  tvLibraries: string[];
  movieLibraries: string[];
};

export type PlexStatus = {
  connected: boolean;
  baseUrl?: string;
  tvLibraries?: string[];
  movieLibraries?: string[];
};

export type PlexApplyRequest = {
  imageUrl: string;
  tmdbId?: number;
  mediaType: string;
  /** When provided, skip TMDB-based item search and apply directly to this Plex ratingKey. */
  plexRatingKey?: string;
  showTmdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  // Tracking fields (present when applied via OpenPoster UI):
  posterId?: string;
  assetHash?: string;
  creatorId?: string;
  creatorDisplayName?: string;
  themeId?: string;
  nodeBase?: string;
  autoUpdate?: boolean;
  isBackdrop?: boolean;
  isSquare?: boolean;
  isLogo?: boolean;
};

function _nodeRequest(nodeUrl: string, adminToken: string, path: string, options?: RequestInit) {
  const base = nodeUrl.replace(/\/+$/, "");
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken}`,
      ...(options?.headers ?? {}),
    },
  });
}

export async function testPlexConnection(
  nodeUrl: string,
  adminToken: string,
  config: PlexConfig,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await _nodeRequest(nodeUrl, adminToken, "/v1/admin/plex/connect", {
      method: "POST",
      body: JSON.stringify({
        base_url: config.baseUrl,
        token: config.token,
        tv_libraries: config.tvLibraries,
        movie_libraries: config.movieLibraries,
        test_only: true,
      }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: j?.error?.message ?? `failed: ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function savePlexConnection(
  nodeUrl: string,
  adminToken: string,
  config: PlexConfig,
): Promise<void> {
  const r = await _nodeRequest(nodeUrl, adminToken, "/v1/admin/plex/connect", {
    method: "POST",
    body: JSON.stringify({
      base_url: config.baseUrl,
      token: config.token,
      tv_libraries: config.tvLibraries,
      movie_libraries: config.movieLibraries,
    }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? `save failed: ${r.status}`);
  }
}

export async function getPlexStatus(nodeUrl: string, adminToken: string): Promise<PlexStatus> {
  try {
    const r = await _nodeRequest(nodeUrl, adminToken, "/v1/admin/plex/status");
    if (!r.ok) return { connected: false };
    const j = await r.json() as Record<string, unknown>;
    if (!j.connected) return { connected: false };
    return {
      connected: true,
      baseUrl: j.base_url as string | undefined,
      tvLibraries: j.tv_libraries as string[] | undefined,
      movieLibraries: j.movie_libraries as string[] | undefined,
    };
  } catch {
    return { connected: false };
  }
}

export async function applyToPlexPoster(
  nodeUrl: string,
  adminToken: string,
  req: PlexApplyRequest,
): Promise<{ media_item_id: string }> {
  const r = await _nodeRequest(nodeUrl, adminToken, "/v1/admin/plex/apply", {
    method: "POST",
    body: JSON.stringify({
      image_url: req.imageUrl,
      tmdb_id: req.tmdbId ?? null,
      media_type: req.mediaType,
      plex_rating_key: req.plexRatingKey ?? null,
      show_tmdb_id: req.showTmdbId ?? null,
      season_number: req.seasonNumber ?? null,
      episode_number: req.episodeNumber ?? null,
      poster_id: req.posterId ?? null,
      asset_hash: req.assetHash ?? null,
      creator_id: req.creatorId ?? null,
      creator_display_name: req.creatorDisplayName ?? null,
      theme_id: req.themeId ?? null,
      node_base: req.nodeBase ?? null,
      auto_update: req.autoUpdate ?? false,
      is_backdrop: req.isBackdrop ?? false,
      is_square: req.isSquare ?? false,
      is_logo: req.isLogo ?? false,
    }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? `apply failed: ${r.status}`);
  }
  return r.json() as Promise<{ media_item_id: string }>;
}

export async function disconnectPlex(nodeUrl: string, adminToken: string): Promise<void> {
  await _nodeRequest(nodeUrl, adminToken, "/v1/admin/plex/disconnect", { method: "DELETE" });
}
