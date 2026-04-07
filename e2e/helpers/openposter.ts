import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const TEST_NODE_URL = process.env.OPENPOSTER_TEST_NODE_URL ?? "http://localhost:8081";
export const TEST_NODE_B_URL = process.env.OPENPOSTER_TEST_NODE_B_URL ?? "http://localhost:8082";
export const TEST_DIRECTORY_URL = process.env.OPENPOSTER_TEST_DIRECTORY_URL ?? "http://localhost:8084";
export const TEST_WEB_URL = process.env.OPENPOSTER_WEB_BASE_URL ?? "http://localhost:3000";
export const TEST_WEB_B_URL = process.env.OPENPOSTER_WEB_B_BASE_URL ?? "http://localhost:3002";
export const TEST_DIAG_URL = process.env.OPENPOSTER_DIAG_BASE_URL ?? "http://localhost:3001";
export const TEST_INDEXER_URL = process.env.OPENPOSTER_INDEXER_BASE_URL ?? "http://localhost:8090";
export const TEST_ISSUER_URL = process.env.OPENPOSTER_ISSUER_BASE_URL ?? "http://localhost:8085";
export const TEST_ADMIN_TOKEN = process.env.OPENPOSTER_TEST_ADMIN_TOKEN ?? "dev-admin";
export const TEST_RESET_TOKEN = process.env.OPENPOSTER_TEST_RESET_TOKEN ?? "dev-reset";
export const TEST_CREATOR_ID = process.env.OPENPOSTER_TEST_CREATOR_ID ?? "mcfly";
export const TEST_CREATOR_DISPLAY_NAME =
  process.env.OPENPOSTER_TEST_CREATOR_DISPLAY_NAME ?? "Martin";
const TMDB_ENV_FLAG = process.env.OPENPOSTER_E2E_HAS_TMDB ?? "";
const PLEX_ENV_FLAG = process.env.OPENPOSTER_E2E_HAS_PLEX ?? "";
export const HAS_TMDB =
  /^(1|true|yes)$/i.test(TMDB_ENV_FLAG)
  || (!/^(0|false|no)$/i.test(TMDB_ENV_FLAG) && Boolean(process.env.TMDB_READ_ACCESS_TOKEN));
export const TMDB_SKIP_REASON =
  "TMDB-backed E2E coverage is disabled because TMDB_READ_ACCESS_TOKEN is not configured for this environment.";
export const PLEX_SKIP_REASON =
  "Plex-backed My Media E2E coverage is disabled because no Plex bootstrap configuration is available for this environment.";

export function skipIfTmdbUnavailable(test: { skip(condition: boolean, description?: string): void }): void {
  test.skip(!HAS_TMDB, TMDB_SKIP_REASON);
}

export function skipIfPlexUnavailable(test: { skip(condition: boolean, description?: string): void }): void {
  test.skip(!HAS_PLEX, PLEX_SKIP_REASON);
}

export const TED_POSTER_IMAGE = path.resolve(
  process.cwd(),
  "web/public/demo/ted-boxset/58d48c5d-7cc8-4a90-8684-ec8990af7df4.jpg",
);

export const TED_POSTER_IMAGE_ALT = path.resolve(
  process.cwd(),
  "web/public/demo/ted-boxset/564086cb-c416-4a52-910a-1e6245eecc64.jpg",
);

export const BOND_COLLECTION_ZIP = path.resolve(
  process.cwd(),
  "sample-data/collections/James Bond Collection.zip",
);

export const TED_SHOW_ZIP = path.resolve(
  process.cwd(),
  "sample-data/tv_shows/ted (2024).zip",
);

const PLEX_SETTINGS_FIXTURE = path.resolve(
  process.cwd(),
  "reference-node/data-a/plex_settings.json",
);

export const HAS_PLEX =
  /^(1|true|yes)$/i.test(PLEX_ENV_FLAG)
  || (
    !/^(0|false|no)$/i.test(PLEX_ENV_FLAG)
    && (
      (
        Boolean(process.env.OPENPOSTER_E2E_PLEX_BASE_URL)
        && Boolean(process.env.OPENPOSTER_E2E_PLEX_TOKEN)
      )
      || existsSync(PLEX_SETTINGS_FIXTURE)
      || existsSync(path.resolve(process.cwd(), "reference-node/data-a/media_servers.json"))
    )
  );

type Theme = {
  theme_id: string;
  name: string;
};

export type PosterEntry = {
  poster_id: string;
  media: {
    tmdb_id: number | null;
    show_tmdb_id?: number | null;
    season_number?: number | null;
    episode_number?: number | null;
    collection_tmdb_id?: number | null;
    theme_id?: string | null;
    type: string;
    title?: string | null;
  };
  kind?: string;
  language?: string | null;
  published?: boolean;
};

export type NodeEntry = {
  url: string;
  node_id?: string | null;
  name?: string | null;
  status: string;
  last_seen?: string | null;
  last_crawled_at?: string | null;
};

type PlexFixtureSettings = {
  base_url: string;
  token: string;
  tv_libraries: string[];
  movie_libraries: string[];
};

export type MediaLibraryItem = {
  id: string;
  title: string;
  year: number | null;
  type: string;
  tmdb_id: number | null;
  library_title?: string | null;
};

export type MediaLibrary = {
  movies: MediaLibraryItem[];
  shows: MediaLibraryItem[];
  collections: MediaLibraryItem[];
  synced_at: string | null;
  is_syncing: boolean;
};

type MediaSyncStatus = {
  is_syncing: boolean;
  last_synced_at: string | null;
  current_phase: string | null;
  error: string | null;
  item_count: number;
};

export type TrackedArtworkEntry = {
  media_item_id: string;
  tmdb_id: number | null;
  media_type: string;
  poster_id: string;
  asset_hash: string;
  creator_id: string | null;
  creator_display_name: string | null;
  theme_id: string | null;
  node_base: string | null;
  applied_at: string;
  auto_update: boolean;
  plex_label: string | null;
};

export type IssuerUser = {
  user_id: string;
  email: string;
  display_name: string | null;
  handle?: string | null;
};

export type FavouriteCreatorEntry = {
  creator_id: string;
  creator_display_name: string | null;
  node_base: string;
  added_at: string;
};

function authHeaders(creatorId = TEST_CREATOR_ID): Record<string, string> {
  return {
    Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
    "x-creator-id": creatorId,
  };
}

function authHeadersFor(creatorId = TEST_CREATOR_ID): Record<string, string> {
  return authHeaders(creatorId);
}

async function api<T>(
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${TEST_NODE_URL}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${pathname} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function apiAt<T>(
  baseUrl: string,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${pathname} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function issuerApi<T>(
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${TEST_ISSUER_URL}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${pathname} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function resetDevStack(): Promise<void> {
  const resetTargets = [
    `${TEST_DIRECTORY_URL}/dev/reset?token=${encodeURIComponent(TEST_RESET_TOKEN)}`,
    `${TEST_NODE_URL}/dev/reset?token=${encodeURIComponent(TEST_RESET_TOKEN)}`,
    `${process.env.OPENPOSTER_TEST_NODE_B_URL ?? "http://localhost:8082"}/dev/reset?token=${encodeURIComponent(TEST_RESET_TOKEN)}`,
    `${TEST_INDEXER_URL}/dev/reset?token=${encodeURIComponent(TEST_RESET_TOKEN)}`,
    `${process.env.OPENPOSTER_TEST_ISSUER_URL ?? "http://localhost:8085"}/dev/reset?token=${encodeURIComponent(TEST_RESET_TOKEN)}`,
  ];

  for (const url of resetTargets) {
    let success = false;
    let lastStatus: number | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url);
      if (response.ok) {
        success = true;
        break;
      }
      lastStatus = response.status;
      await sleep(250 * (attempt + 1));
    }
    if (!success) {
      throw new Error(`Reset failed for ${url}: ${lastStatus ?? "unknown"}`);
    }
  }
}

export async function ensureDefaultTheme(): Promise<Theme> {
  return ensureDefaultThemeAt(TEST_NODE_URL);
}

export async function ensureDefaultThemeAt(nodeUrl: string, creatorId = TEST_CREATOR_ID): Promise<Theme> {
  let listed: { themes: Theme[] } | null = null;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      listed = await apiAt<{ themes: Theme[] }>(nodeUrl, "/v1/admin/themes", {
        headers: authHeadersFor(creatorId),
      });
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!lastError.message.includes(" failed: 500") || attempt === 2) throw lastError;
      await sleep(250 * (attempt + 1));
    }
  }
  if (!listed) throw lastError ?? new Error("Failed to load themes.");
  const existing = listed.themes.find((theme) => theme.name === "Default theme");
  if (existing) return existing;

  return await apiAt<Theme>(nodeUrl, "/v1/admin/themes", {
    method: "POST",
    headers: {
      ...authHeadersFor(creatorId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Default theme", description: null }),
  });
}

export async function openPosterMenuForTitle(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: `Artwork actions for ${title}`, exact: true }).click();
}

export async function saveCreatorSetting(key: string, value: unknown): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await api(`/v1/admin/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: JSON.stringify(value) }),
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!lastError.message.includes(" failed: 500") || attempt === 2) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

export async function pinShow(tmdbId: number, title: string): Promise<void> {
  await saveCreatorSetting("studio_pinned_tv_shows", [{ tmdbId, title }]);
}

export async function pinCollection(tmdbId: number, title: string): Promise<void> {
  await saveCreatorSetting("studio_pinned_collections", [{ tmdbId, title }]);
}

export async function setDefaultLanguage(language = "en"): Promise<void> {
  await saveCreatorSetting("studio_default_language", language);
}

type UploadPosterOptions = {
  filePath?: string;
  fileBuffer?: Buffer;
  fileName: string;
  mimeType?: string;
  mediaType: "show" | "collection" | "movie" | "backdrop" | "season" | "episode";
  tmdbId: number;
  title: string;
  year?: number;
  themeId: string;
  language?: string;
  published: boolean;
  collectionTmdbId?: number;
  showTmdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  kind?: "poster" | "background" | "logo" | "square" | "banner" | "thumb";
  creatorDisplayName?: string;
  creatorId?: string;
  nodeUrl?: string;
};

export async function uploadPoster(options: UploadPosterOptions): Promise<{ poster_id: string }> {
  const fileBuffer = options.fileBuffer ?? (await readFile(options.filePath!));
  const mimeType = options.mimeType ?? "image/jpeg";
  const preview = new Blob([fileBuffer], { type: mimeType });
  const full = new Blob([fileBuffer], { type: mimeType });
  const form = new FormData();

  form.set("tmdb_id", String(options.tmdbId));
  form.set("media_type", options.mediaType);
  form.set("title", options.title);
  form.set("creator_id", options.creatorId ?? TEST_CREATOR_ID);
  form.set("creator_display_name", options.creatorDisplayName ?? TEST_CREATOR_DISPLAY_NAME);
  form.set("theme_id", options.themeId);
  form.set("published", String(options.published));
  form.set("kind", options.kind ?? (options.mediaType === "backdrop" ? "background" : "poster"));
  if (options.language) form.set("language", options.language);
  if (typeof options.year === "number") form.set("year", String(options.year));
  if (typeof options.collectionTmdbId === "number") {
    form.set("collection_tmdb_id", String(options.collectionTmdbId));
  }
  if (typeof options.showTmdbId === "number") {
    form.set("show_tmdb_id", String(options.showTmdbId));
  }
  if (typeof options.seasonNumber === "number") {
    form.set("season_number", String(options.seasonNumber));
  }
  if (typeof options.episodeNumber === "number") {
    form.set("episode_number", String(options.episodeNumber));
  }
  form.set("attribution_license", "all-rights-reserved");
  form.set("attribution_redistribution", "mirrors-approved");
  form.append("preview", preview, `preview-${options.fileName}`);
  form.append("full", full, options.fileName);

  return await apiAt<{ poster_id: string }>(options.nodeUrl ?? TEST_NODE_URL, "/v1/admin/posters", {
    method: "POST",
    headers: authHeadersFor(options.creatorId ?? TEST_CREATOR_ID),
    body: form,
  });
}

export async function setPosterPublished(posterId: string, published: boolean): Promise<void> {
  await setPosterPublishedAt(TEST_NODE_URL, posterId, published);
}

export async function setPosterPublishedAt(nodeUrl: string, posterId: string, published: boolean): Promise<void> {
  await apiAt(nodeUrl, `/v1/admin/posters/${encodeURIComponent(posterId)}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ published }),
  });
}

type ReplacePosterAssetsOptions = {
  posterId: string;
  filePath?: string;
  fileBuffer?: Buffer;
  fileName: string;
  mimeType?: string;
  nodeUrl?: string;
  creatorId?: string;
};

export async function replacePosterAssets(
  options: ReplacePosterAssetsOptions,
): Promise<{ poster_id: string; preview_hash: string; full_hash: string; updated_at: string }> {
  const fileBuffer = options.fileBuffer ?? (await readFile(options.filePath!));
  const mimeType = options.mimeType ?? "image/jpeg";
  const preview = new Blob([fileBuffer], { type: mimeType });
  const full = new Blob([fileBuffer], { type: mimeType });
  const form = new FormData();

  form.append("preview", preview, `preview-${options.fileName}`);
  form.append("full", full, options.fileName);

  return await apiAt<{ poster_id: string; preview_hash: string; full_hash: string; updated_at: string }>(
    options.nodeUrl ?? TEST_NODE_URL,
    `/v1/admin/posters/${encodeURIComponent(options.posterId)}/assets`,
    {
      method: "PUT",
      headers: authHeadersFor(options.creatorId ?? TEST_CREATOR_ID),
      body: form,
    },
  );
}

export async function setArtworkAutoUpdate(enabled: boolean, nodeUrl = TEST_NODE_URL): Promise<void> {
  await apiAt(nodeUrl, "/v1/admin/artwork/settings", {
    method: "PUT",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ auto_update_artwork: enabled }),
  });
}

export async function listPosters(): Promise<PosterEntry[]> {
  return listPostersAt(TEST_NODE_URL);
}

export async function listPostersAt(nodeUrl: string): Promise<PosterEntry[]> {
  const posters: PosterEntry[] = [];
  let cursor: string | null = null;

  for (;;) {
    const url = new URL(`${nodeUrl}/v1/posters`);
    url.searchParams.set("include_drafts", "true");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
      },
    });
    if (!response.ok) {
      throw new Error(`GET /v1/posters failed: ${response.status}`);
    }
    const json = (await response.json()) as { results?: PosterEntry[]; next_cursor?: string | null };
    posters.push(...(json.results ?? []));
    cursor = json.next_cursor ?? null;
    if (!cursor) break;
  }

  return posters;
}

export async function listNodePeersAt(nodeUrl: string): Promise<NodeEntry[]> {
  const response = await fetch(`${nodeUrl}/v1/nodes`);
  if (!response.ok) {
    throw new Error(`GET /v1/nodes failed: ${response.status}`);
  }
  const json = (await response.json()) as { nodes?: NodeEntry[] };
  return json.nodes ?? [];
}

export async function getTrackedArtwork(): Promise<TrackedArtworkEntry[]> {
  return getTrackedArtworkAt(TEST_NODE_URL);
}

export async function getTrackedArtworkAt(nodeUrl: string): Promise<TrackedArtworkEntry[]> {
  const json = await apiAt<{ items?: TrackedArtworkEntry[] }>(nodeUrl, "/v1/admin/artwork/tracked", {
    headers: authHeaders(),
  });
  return json.items ?? [];
}

async function loadPlexFixtureSettings(): Promise<PlexFixtureSettings> {
  if (process.env.OPENPOSTER_E2E_PLEX_BASE_URL && process.env.OPENPOSTER_E2E_PLEX_TOKEN) {
    return {
      base_url: process.env.OPENPOSTER_E2E_PLEX_BASE_URL,
      token: process.env.OPENPOSTER_E2E_PLEX_TOKEN,
      tv_libraries: (process.env.OPENPOSTER_E2E_PLEX_TV_LIBRARIES ?? "TV Shows")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      movie_libraries: (process.env.OPENPOSTER_E2E_PLEX_MOVIE_LIBRARIES ?? "Movies")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  const raw = await readFile(PLEX_SETTINGS_FIXTURE, "utf8");
  return JSON.parse(raw) as PlexFixtureSettings;
}

export async function reconnectDefaultPlexServerAt(nodeUrl: string): Promise<void> {
  const settings = await loadPlexFixtureSettings();
  await apiAt(nodeUrl, "/v1/admin/plex/connect", {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base_url: settings.base_url,
      token: settings.token,
      tv_libraries: settings.tv_libraries,
      movie_libraries: settings.movie_libraries,
    }),
  });
}

export async function reconnectDefaultPlexServer(): Promise<void> {
  await reconnectDefaultPlexServerAt(TEST_NODE_URL);
}

export async function triggerMediaLibrarySyncAt(nodeUrl: string): Promise<void> {
  await apiAt(nodeUrl, "/v1/admin/media-server/sync/trigger", {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ server_id: null }),
  });
}

export async function triggerMediaLibrarySync(): Promise<void> {
  await triggerMediaLibrarySyncAt(TEST_NODE_URL);
}

export async function getMediaSyncStatus(): Promise<MediaSyncStatus> {
  return await getMediaSyncStatusAt(TEST_NODE_URL);
}

export async function getMediaSyncStatusAt(nodeUrl: string): Promise<MediaSyncStatus> {
  return await apiAt<MediaSyncStatus>(nodeUrl, "/v1/admin/media-server/sync/status", {
    headers: authHeaders(),
  });
}

export async function getMediaLibrary(): Promise<MediaLibrary> {
  return await getMediaLibraryAt(TEST_NODE_URL);
}

export async function getMediaLibraryAt(nodeUrl: string): Promise<MediaLibrary> {
  return await apiAt<MediaLibrary>(nodeUrl, "/v1/admin/media-server/library", {
    headers: authHeaders(),
  });
}

export async function getMediaChildren(itemId: string): Promise<MediaLibraryItem[]> {
  const json = await api<{ items?: MediaLibraryItem[] }>(
    `/v1/admin/media-server/items/${encodeURIComponent(itemId)}/children?server_id=default`,
    {
      headers: authHeaders(),
    },
  );
  return json.items ?? [];
}

export async function ensureMediaLibrarySynced(timeoutMs = 180_000): Promise<MediaLibrary> {
  await reconnectDefaultPlexServer();
  await triggerMediaLibrarySync();

  const startedAt = Date.now();
  let lastError: string | null = null;

  for (;;) {
    const [status, library] = await Promise.all([
      getMediaSyncStatus(),
      getMediaLibrary(),
    ]);

    if (status.error) {
      lastError = status.error;
    }

    const hasItems =
      library.movies.length > 0 || library.shows.length > 0 || library.collections.length > 0;
    if (!status.is_syncing && hasItems) {
      return library;
    }

    if (Date.now() - startedAt > timeoutMs) {
      const detail = lastError ? ` Last error: ${lastError}` : "";
      throw new Error(`Timed out waiting for media library sync.${detail}`);
    }

    await sleep(1_000);
  }
}

export async function ensureMediaLibrarySyncedAt(
  nodeUrl: string,
  timeoutMs = 180_000,
): Promise<MediaLibrary> {
  await reconnectDefaultPlexServerAt(nodeUrl);
  await triggerMediaLibrarySyncAt(nodeUrl);

  const startedAt = Date.now();
  let lastError: string | null = null;

  for (;;) {
    const [status, library] = await Promise.all([
      getMediaSyncStatusAt(nodeUrl),
      getMediaLibraryAt(nodeUrl),
    ]);

    if (status.error) {
      lastError = status.error;
    }

    const hasItems =
      library.movies.length > 0 || library.shows.length > 0 || library.collections.length > 0;
    if (!status.is_syncing && hasItems) {
      return library;
    }

    if (Date.now() - startedAt > timeoutMs) {
      const detail = lastError ? ` Last error: ${lastError}` : "";
      throw new Error(`Timed out waiting for media library sync.${detail}`);
    }

    await sleep(1_000);
  }
}

export async function waitForIndexedPoster(
  tmdbId: number,
  type: string,
  predicate: (poster: PosterEntry) => boolean,
  timeoutMs = 120_000,
  kind?: string,
): Promise<PosterEntry> {
  const startedAt = Date.now();

  for (;;) {
    const url = new URL(`${TEST_WEB_URL}/api/search`);
    url.searchParams.set("tmdb_id", String(tmdbId));
    url.searchParams.set("type", type);
    if (kind) url.searchParams.set("kind", kind);
    url.searchParams.set("limit", "50");

    const response = await fetch(url.toString());
    if (response.ok) {
      const json = (await response.json()) as { results?: PosterEntry[] };
      const match = (json.results ?? []).find(predicate);
      if (match) return match;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for indexed ${type} artwork for TMDB ${tmdbId}.`);
    }

    await sleep(1_000);
  }
}

export async function reindexIndexer(): Promise<void> {
  const response = await fetch(`${TEST_INDEXER_URL}/v1/admin/reindex`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`POST /v1/admin/reindex failed: ${response.status}`);
  }
}

export async function registerNodePeer(nodeUrl: string, peerUrl: string): Promise<void> {
  const response = await fetch(`${nodeUrl}/v1/nodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: peerUrl }),
  });
  if (!response.ok) {
    throw new Error(`POST /v1/nodes failed: ${response.status}`);
  }
}

export async function waitForIndexerNode(
  predicate: (node: {
    url: string;
    status: string;
    last_crawled_at: string | null;
  }) => boolean,
  timeoutMs = 60_000,
): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    const response = await fetch(`${TEST_INDEXER_URL}/v1/nodes`);
    if (response.ok) {
      const json = (await response.json()) as {
        nodes?: Array<{ url: string; status: string; last_crawled_at: string | null }>;
      };
      if ((json.nodes ?? []).some(predicate)) return;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for indexer node discovery.");
    }
    await sleep(1_000);
  }
}

export async function searchIndexer(params: {
  tmdbId?: number;
  type?: string;
  kind?: string;
  limit?: number;
  q?: string;
}): Promise<PosterEntry[]> {
  const url = new URL(`${TEST_INDEXER_URL}/v1/search`);
  if (typeof params.tmdbId === "number") url.searchParams.set("tmdb_id", String(params.tmdbId));
  if (params.type) url.searchParams.set("type", params.type);
  if (params.kind) url.searchParams.set("kind", params.kind);
  if (params.q) url.searchParams.set("q", params.q);
  url.searchParams.set("limit", String(params.limit ?? 50));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`GET /v1/search failed: ${response.status}`);
  }
  const json = (await response.json()) as { results?: PosterEntry[] };
  return json.results ?? [];
}

export async function expectPosterAbsentFromIndexer(
  tmdbId: number,
  type: string,
  predicate: (poster: PosterEntry) => boolean,
  kind?: string,
): Promise<void> {
  const results = await searchIndexer({ tmdbId, type, kind, limit: 50 });
  if (results.some(predicate)) {
    throw new Error(`Unexpected indexed poster found for TMDB ${tmdbId} / ${type}.`);
  }
}

export async function seedConfirmedCollectionTmdbMatch(
  page: Page,
  collectionId: string,
  tmdbId: number,
  tmdbName: string,
): Promise<void> {
  await page.addInitScript(
    ({ seededCollectionId, seededTmdbId, seededTmdbName }) => {
      const key = "openposter_tmdb_collection_map";
      const map = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      map[seededCollectionId] = {
        tmdbId: seededTmdbId,
        tmdbName: seededTmdbName,
        source: "confirmed",
      };
      window.localStorage.setItem(key, JSON.stringify(map));
    },
    {
      seededCollectionId: collectionId,
      seededTmdbId: tmdbId,
      seededTmdbName: tmdbName,
    },
  );
}

export async function createIssuerSession(params?: {
  email?: string;
  password?: string;
  displayName?: string;
}): Promise<{ token: string; user: IssuerUser }> {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = params?.email ?? `e2e-${nonce}@openposter.local`;
  const password = params?.password ?? "openposter-e2e";
  const displayName = params?.displayName ?? "OpenPoster E2E";

  return await issuerApi<{ token: string; user: IssuerUser }>("/v1/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      display_name: displayName,
    }),
  });
}

export async function primeIssuerSession(
  page: Page,
  session: { token: string; user: IssuerUser },
): Promise<void> {
  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem("openposter.issuer.token.v1", token);
      window.localStorage.setItem("openposter.issuer.user.v1", JSON.stringify(user));
    },
    session,
  );
}

export async function listFavouriteCreators(token: string): Promise<FavouriteCreatorEntry[]> {
  const json = await issuerApi<{ favourites?: FavouriteCreatorEntry[] }>("/v1/me/favourites/creators", {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  return json.favourites ?? [];
}

export function extractZipEntry(zipPath: string, entryName: string): Buffer {
  return execFileSync("unzip", ["-p", zipPath, entryName]);
}

export async function primeStudioSession(page: Page): Promise<void> {
  await primeStudioSessionAt(page, {
    nodeUrl: TEST_NODE_URL,
    adminToken: TEST_ADMIN_TOKEN,
    creatorId: TEST_CREATOR_ID,
  });
}

export async function primeStudioSessionAt(
  page: Page,
  params: { nodeUrl: string; adminToken: string; creatorId: string },
): Promise<void> {
  await page.addInitScript(
    ({ nodeUrl, adminToken, creatorId }) => {
      window.localStorage.setItem("openposter.creatorConnection.nodeUrl.v1", nodeUrl);
      window.localStorage.setItem("openposter.creatorConnection.creatorId.v1", creatorId);
      window.sessionStorage.setItem("openposter.creatorConnection.adminToken.v1", adminToken);
    },
    params,
  );
}

export async function openMyMediaShow(
  page: Page,
  item: MediaLibraryItem,
): Promise<void> {
  await primeStudioSession(page);
  const params = new URLSearchParams({
    view: "show",
    id: item.id,
    title: item.title,
  });
  if (item.library_title) params.set("library", item.library_title);
  await page.goto(`${TEST_WEB_URL}/my-media?${params.toString()}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
}

export async function openMyMediaCollection(
  page: Page,
  item: MediaLibraryItem,
): Promise<void> {
  await primeStudioSession(page);
  const params = new URLSearchParams({
    view: "collection",
    id: item.id,
    title: item.title,
  });
  if (item.library_title) params.set("library", item.library_title);
  await page.goto(`${TEST_WEB_URL}/my-media?${params.toString()}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
}

export async function openMyMediaMovie(
  page: Page,
  item: MediaLibraryItem,
): Promise<void> {
  await openMyMediaMovieAt(page, item, {
    webUrl: TEST_WEB_URL,
    nodeUrl: TEST_NODE_URL,
    adminToken: TEST_ADMIN_TOKEN,
    creatorId: TEST_CREATOR_ID,
  });
}

export async function openMyMediaMovieAt(
  page: Page,
  item: MediaLibraryItem,
  options: {
    webUrl: string;
    nodeUrl: string;
    adminToken?: string;
    creatorId?: string;
  },
): Promise<void> {
  await primeStudioSessionAt(page, {
    nodeUrl: options.nodeUrl,
    adminToken: options.adminToken ?? TEST_ADMIN_TOKEN,
    creatorId: options.creatorId ?? TEST_CREATOR_ID,
  });
  const search = new URLSearchParams({
    view: "movie",
    id: item.id,
    title: item.title,
  });
  if (typeof item.year === "number") search.set("year", String(item.year));
  if (typeof item.tmdb_id === "number") search.set("tmdbId", String(item.tmdb_id));
  if (item.library_title) search.set("library", item.library_title);
  await page.goto(`${options.webUrl}/my-media?${search.toString()}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
}

export async function openMyMediaSeason(
  page: Page,
  options: {
    show: MediaLibraryItem;
    season: MediaLibraryItem;
  },
): Promise<void> {
  await primeStudioSession(page);
  const params = new URLSearchParams({
    view: "season",
    showId: options.show.id,
    showTitle: options.show.title,
    seasonId: options.season.id,
    title: options.season.title,
  });
  if (typeof options.show.tmdb_id === "number") params.set("showTmdbId", String(options.show.tmdb_id));
  if (typeof options.season.index === "number") params.set("seasonIndex", String(options.season.index));
  if (options.show.library_title) params.set("library", options.show.library_title);
  await page.goto(`${TEST_WEB_URL}/my-media?${params.toString()}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
}

export async function openStudioMedia(
  page: Page,
  mediaKey: string,
  themeId: string,
): Promise<void> {
  await primeStudioSession(page);
  await page.goto(
    `${TEST_WEB_URL}/studio?view=media&key=${encodeURIComponent(mediaKey)}&themeFilter=${encodeURIComponent(themeId)}`,
  );
  await expect(page.getByRole("heading").first()).toBeVisible();
}
