import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "TMDB not configured" }, { status: 503 });

  const res = await fetch("https://api.themoviedb.org/3/trending/movie/week", {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return NextResponse.json({ error: "TMDB request failed" }, { status: res.status });
  return NextResponse.json(await res.json());
}
