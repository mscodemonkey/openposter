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
  const res = await fetch(`https://api.themoviedb.org/3/collection/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 86400 }, // cache for 24h — collection lists rarely change
  });

  if (!res.ok) {
    return NextResponse.json({ error: "TMDB request failed" }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
