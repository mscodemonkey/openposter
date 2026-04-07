import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "TMDB not configured" }, { status: 503 });

  const res = await fetch("https://api.themoviedb.org/3/trending/movie/week", {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return NextResponse.json({ error: "TMDB request failed" }, { status: res.status });

  const data = await res.json() as {
    page?: number;
    results?: Array<{
      id: number;
      title?: string;
      poster_path?: string | null;
      release_date?: string;
    }>;
    total_pages?: number;
    total_results?: number;
  };

  const results = Array.isArray(data.results) ? data.results : [];
  const enrichedResults = await Promise.all(
    results.map(async (item, index) => {
      if (index >= 20) return item;

      try {
        const detailRes = await fetch(`https://api.themoviedb.org/3/movie/${item.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 3600 },
        });
        if (!detailRes.ok) return item;

        const detail = await detailRes.json() as {
          belongs_to_collection?: { id: number; name: string } | null;
        };

        return {
          ...item,
          belongs_to_collection: detail.belongs_to_collection
            ? {
                id: detail.belongs_to_collection.id,
                name: detail.belongs_to_collection.name,
              }
            : null,
        };
      } catch {
        return item;
      }
    })
  );

  return NextResponse.json({ ...data, results: enrichedResults });
}
