import { NextRequest, NextResponse } from "next/server";

const FANART_KEY = "5f06d3e70ee151b9b7984a0372e36d2d";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const { id } = await params; // TMDB show ID

  // Resolve TVDB ID via TMDB external IDs (fanart.tv TV uses TVDB IDs)
  let tvdbId: number | null = null;
  if (token) {
    try {
      const extRes = await fetch(
        `https://api.themoviedb.org/3/tv/${id}/external_ids`,
        {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 86400 },
        }
      );
      if (extRes.ok) {
        const extData = (await extRes.json()) as { tvdb_id?: number | null };
        tvdbId = extData.tvdb_id ?? null;
      }
    } catch { /* ignore */ }
  }

  if (!tvdbId) {
    return NextResponse.json({ error: "TVDB ID not found" }, { status: 404 });
  }

  const res = await fetch(
    `https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${FANART_KEY}`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) {
    return NextResponse.json({ error: "fanart.tv request failed" }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
