import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ genres: [] });

  const [movieRes, tvRes] = await Promise.all([
    fetch("https://api.themoviedb.org/3/genre/movie/list", {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    }),
    fetch("https://api.themoviedb.org/3/genre/tv/list", {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    }),
  ]);

  const [movieData, tvData] = await Promise.all([
    movieRes.ok ? (movieRes.json() as Promise<{ genres?: Array<{ id: number; name: string }> }>) : Promise.resolve({ genres: [] }),
    tvRes.ok ? (tvRes.json() as Promise<{ genres?: Array<{ id: number; name: string }> }>) : Promise.resolve({ genres: [] }),
  ]);

  // Merge movie + TV genres, deduplicate by ID, sort alphabetically
  const seen = new Set<number>();
  const merged: Array<{ id: number; name: string }> = [];
  for (const g of [...(movieData.genres ?? []), ...(tvData.genres ?? [])]) {
    if (!seen.has(g.id)) {
      seen.add(g.id);
      merged.push({ id: g.id, name: g.name });
    }
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ genres: merged });
}
