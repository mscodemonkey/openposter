import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; season: string }> }
) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TMDB not configured" }, { status: 503 });
  }

  const { id, season } = await params;
  const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "TMDB request failed" }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
