import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TMDB not configured" }, { status: 503 });
  }
  const { id } = await params;
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${id}/images?include_image_language=en,null`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    }
  );
  if (!res.ok) {
    return NextResponse.json({ error: "TMDB request failed" }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
