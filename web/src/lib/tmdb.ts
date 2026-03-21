const IMG = "https://image.tmdb.org/t/p/w342";
const STILL = "https://image.tmdb.org/t/p/w400";

export type TmdbMovie = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
};

/** Full movie detail from TMDB — includes belongs_to_collection */
export type TmdbMovieDetail = TmdbMovie & {
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path?: string | null;
  } | null;
};

export type TmdbCollection = {
  id: number;
  name: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  parts: TmdbMovie[];
};

export type TmdbEpisode = {
  id: number;
  episode_number: number;
  name: string;
  still_path?: string | null;
};

export type TmdbTvSeason = {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  poster_path?: string | null;
  episodes?: TmdbEpisode[];
};

export type TmdbTvShow = {
  id: number;
  name: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string | null;
  seasons: TmdbTvSeason[];
};

export function tmdbImageUrl(path: string | null | undefined): string | null {
  return path ? `${IMG}${path}` : null;
}

export function tmdbStillUrl(path: string | null | undefined): string | null {
  return path ? `${STILL}${path}` : null;
}

export async function fetchTmdbCollection(
  collectionId: number
): Promise<TmdbCollection | null> {
  try {
    const res = await fetch(`/api/tmdb/collection/${collectionId}`);
    if (!res.ok) return null;
    return (await res.json()) as TmdbCollection;
  } catch {
    return null;
  }
}

export async function fetchTmdbTvShow(showId: number): Promise<TmdbTvShow | null> {
  try {
    const res = await fetch(`/api/tmdb/tv/${showId}`);
    if (!res.ok) return null;
    return (await res.json()) as TmdbTvShow;
  } catch {
    return null;
  }
}

export type TmdbSearchResult = {
  id: number;
  name: string;
  poster_path?: string | null;
  first_air_date?: string | null; // TV shows only
  release_date?: string | null;   // Collections / movies
};

export async function fetchTmdbSearchCollection(query: string): Promise<TmdbSearchResult[]> {
  try {
    const res = await fetch(`/api/tmdb/search/collection?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: TmdbSearchResult[] };
    return json.results ?? [];
  } catch { return []; }
}

export async function fetchTmdbSearchTv(query: string): Promise<TmdbSearchResult[]> {
  try {
    const res = await fetch(`/api/tmdb/search/tv?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: TmdbSearchResult[] };
    return json.results ?? [];
  } catch { return []; }
}

export async function fetchTmdbMovie(movieId: number): Promise<TmdbMovieDetail | null> {
  try {
    const res = await fetch(`/api/tmdb/movie/${movieId}`);
    if (!res.ok) return null;
    return (await res.json()) as TmdbMovieDetail;
  } catch {
    return null;
  }
}

export async function fetchTmdbSearchMovie(query: string): Promise<TmdbSearchResult[]> {
  try {
    const res = await fetch(`/api/tmdb/search/movie?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: TmdbSearchResult[] };
    return (json.results ?? []).map((r) => ({ ...r, name: r.name || (r as unknown as { title?: string }).title || "" }));
  } catch { return []; }
}

export async function fetchTmdbTvSeason(showId: number, seasonNumber: number): Promise<TmdbTvSeason | null> {
  try {
    const res = await fetch(`/api/tmdb/tv/${showId}/season/${seasonNumber}`);
    if (!res.ok) return null;
    return (await res.json()) as TmdbTvSeason;
  } catch {
    return null;
  }
}
