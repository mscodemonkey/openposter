/**
 * Server-only API helpers. Uses the Docker-internal INDEXER_BASE_URL so
 * server components can reach the indexer without going through the host.
 */
import type { PosterEntry, SearchResponse } from "./types";

export const BASE = (
  process.env.INDEXER_BASE_URL ||
  process.env.NEXT_PUBLIC_INDEXER_BASE_URL ||
  "http://localhost:8090"
).replace(/\/+$/, "");

function hasArtwork(p: PosterEntry): boolean {
  return (
    typeof p.assets?.preview?.url === "string" &&
    p.assets.preview.url.length > 0 &&
    typeof p.assets?.full?.url === "string" &&
    p.assets.full.url.length > 0
  );
}

export type Creator = {
  creator_id: string;
  display_name: string | null;
  count: number;
  last_changed_at: string | null;
};

export type TvBoxsetResponse = {
  show_tmdb_id: string;
  show: PosterEntry[];
  seasons: PosterEntry[];
  episodes_by_season: Record<string, PosterEntry[]>;
  backdrops?: PosterEntry[];
};

// ── Posters ──────────────────────────────────────────────────────────────────

export async function fetchPosters(opts: { q?: string; limit?: number } = {}): Promise<PosterEntry[]> {
  const { q, limit = 200 } = opts;
  const trimQ = (q || "").trim();
  const isTmdbId = /^\d+$/.test(trimQ);
  const collected: PosterEntry[] = [];
  let cursor: string | null = null;

  do {
    const u = trimQ ? new URL(`${BASE}/v1/search`) : new URL(`${BASE}/v1/recent`);
    u.searchParams.set("limit", "100");
    if (trimQ) {
      if (isTmdbId) u.searchParams.set("tmdb_id", trimQ);
      else u.searchParams.set("q", trimQ);
    }
    if (cursor) u.searchParams.set("cursor", cursor);

    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) break;
    const json = (await r.json()) as { results: PosterEntry[]; next_cursor?: string | null };
    collected.push(...json.results.filter(hasArtwork));
    cursor = collected.length < limit ? (json.next_cursor ?? null) : null;
  } while (cursor);

  return collected.slice(0, limit);
}

export async function fetchPoster(posterId: string): Promise<PosterEntry | null> {
  const r = await fetch(`${BASE}/v1/posters/${encodeURIComponent(posterId)}`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json() as Promise<PosterEntry>;
}

export async function fetchSimilarByTmdb(poster: PosterEntry): Promise<PosterEntry[]> {
  if (!poster.media.tmdb_id) return [];
  const validTypes = ["movie", "show", "season", "episode"];
  if (!validTypes.includes(poster.media.type)) return [];

  const u = new URL(`${BASE}/v1/search`);
  u.searchParams.set("tmdb_id", String(poster.media.tmdb_id));
  u.searchParams.set("type", poster.media.type);
  u.searchParams.set("limit", poster.media.type === "episode" || poster.media.type === "season" ? "50" : "12");

  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) return [];
  const json = (await r.json()) as SearchResponse;

  let results = json.results.filter((x) => x.poster_id !== poster.poster_id);
  if ((poster.media.type === "episode" || poster.media.type === "season") && poster.media.season_number != null) {
    results = results.filter((x) => x.media.season_number === poster.media.season_number);
  }
  return results.slice(0, 20);
}

export async function fetchMoreByCreator(poster: PosterEntry, excludeIds: Set<string>): Promise<PosterEntry[]> {
  if (!poster.creator.creator_id) return [];
  const u = new URL(`${BASE}/v1/search`);
  u.searchParams.set("creator_id", String(poster.creator.creator_id));
  u.searchParams.set("limit", "12");

  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) return [];
  const json = (await r.json()) as SearchResponse;
  return json.results.filter((x) => x.poster_id !== poster.poster_id && !excludeIds.has(x.poster_id));
}

// ── Creators ─────────────────────────────────────────────────────────────────

export async function fetchCreators(limit = 200): Promise<Creator[]> {
  const u = new URL(`${BASE}/v1/creators`);
  u.searchParams.set("limit", String(limit));
  const r = await fetch(u.toString(), { next: { revalidate: 60 } });
  if (!r.ok) throw new Error(`creators failed: ${r.status}`);
  const json = (await r.json()) as { results: Creator[] };
  return json.results;
}

export async function fetchCreatorName(creatorId: string): Promise<string | null> {
  const creators = await fetchCreators(500);
  return creators.find((c) => c.creator_id === creatorId)?.display_name ?? null;
}

export async function fetchCreatorPosters(creatorId: string): Promise<PosterEntry[]> {
  const collected: PosterEntry[] = [];
  let cursor: string | null = null;

  do {
    const u = new URL(`${BASE}/v1/by_creator`);
    u.searchParams.set("creator_id", creatorId);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);

    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) break;
    const json = (await r.json()) as { results: PosterEntry[]; next_cursor?: string | null };
    collected.push(...json.results);
    cursor = json.next_cursor ?? null;
  } while (cursor);

  return collected;
}

// ── Box sets ──────────────────────────────────────────────────────────────────

export async function fetchMovieBoxset(
  collectionTmdbId: string
): Promise<{ collection: PosterEntry | null; movies: PosterEntry[] }> {
  const u = new URL(`${BASE}/v1/search`);
  u.searchParams.set("tmdb_id", collectionTmdbId);
  u.searchParams.set("type", "collection");
  u.searchParams.set("limit", "5");

  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) return { collection: null, movies: [] };
  const json = (await r.json()) as SearchResponse;
  const collection = json.results[0] ?? null;
  if (!collection?.links?.length) return { collection, movies: [] };

  const movieLinks = collection.links.filter(
    (l) => l.media?.type === "movie" && l.href.startsWith("/p/")
  );
  const posterIds = movieLinks
    .map((l) => decodeURIComponent(l.href.slice("/p/".length)))
    .filter(Boolean);

  const movies = await Promise.all(
    posterIds.map(async (pid) => {
      const pr = await fetch(`${BASE}/v1/posters/${encodeURIComponent(pid)}`, { cache: "no-store" });
      if (!pr.ok) return null;
      return pr.json() as Promise<PosterEntry>;
    })
  ).then((results) => results.filter((p): p is PosterEntry => p !== null));

  return { collection, movies };
}

export async function fetchTvBoxset(showTmdbId: string): Promise<TvBoxsetResponse | null> {
  const r = await fetch(`${BASE}/v1/tv_boxset/${encodeURIComponent(showTmdbId)}`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json() as Promise<TvBoxsetResponse>;
}

export async function fetchTvShowInfo(
  showTmdbId: number
): Promise<{ title: string | null; backdropUrl: string | null }> {
  const r = await fetch(`${BASE}/v1/tv_boxset/${encodeURIComponent(String(showTmdbId))}`, {
    cache: "no-store",
  });
  if (!r.ok) return { title: null, backdropUrl: null };
  const d = (await r.json()) as TvBoxsetResponse;
  const title = d.show?.[0]?.media?.title ?? null;
  const backdropUrl =
    d.backdrops?.[0]?.assets?.full?.url ?? d.show?.[0]?.assets?.full?.url ?? null;
  return { title, backdropUrl };
}
