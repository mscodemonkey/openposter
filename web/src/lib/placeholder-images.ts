const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/original";

type TmdbLogoEntry = {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
};

type FanartEntry = { url: string; lang: string };

function pickBestLogo(logos: TmdbLogoEntry[]): string | null {
  if (!logos?.length) return null;
  const filtered = logos.filter((l) => l.iso_639_1 === "en" || l.iso_639_1 === null);
  const pool = filtered.length > 0 ? filtered : logos;
  const best = [...pool].sort((a, b) => b.vote_average - a.vote_average)[0];
  return best ? `${TMDB_LOGO_BASE}${best.file_path}` : null;
}

function pickBestFanart(entries: FanartEntry[]): string | null {
  if (!entries?.length) return null;
  const enEntry = entries.find((e) => e.lang === "en" || e.lang === "00");
  return (enEntry ?? entries[0]).url;
}

export async function fetchMovieLogo(tmdbId: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/tmdb/movie/${tmdbId}/images`);
    if (!res.ok) return null;
    const data = (await res.json()) as { logos?: TmdbLogoEntry[] };
    return pickBestLogo(data.logos ?? []);
  } catch { return null; }
}

export async function fetchTvLogo(tmdbId: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/tmdb/tv/${tmdbId}/images`);
    if (!res.ok) return null;
    const data = (await res.json()) as { logos?: TmdbLogoEntry[] };
    return pickBestLogo(data.logos ?? []);
  } catch { return null; }
}

export async function fetchMovieSquare(tmdbId: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/fanart/movie/${tmdbId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, FanartEntry[]>;
    // moviedisc is 1000×1000 (truly square disc art) — the only 1:1 type fanart.tv provides for movies
    const entries = data.moviedisc ?? [];
    return pickBestFanart(entries);
  } catch { return null; }
}

export async function fetchTvSquare(_tmdbId: number): Promise<string | null> {
  // fanart.tv has no 1:1 square type for TV shows (tvthumb is 500×281)
  return null;
}
