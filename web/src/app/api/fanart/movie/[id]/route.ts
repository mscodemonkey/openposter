import { NextRequest, NextResponse } from "next/server";

const FANART_KEY = "5f06d3e70ee151b9b7984a0372e36d2d";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await fetch(
    `https://webservice.fanart.tv/v3/movies/${id}?api_key=${FANART_KEY}`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) {
    return NextResponse.json({ error: "fanart.tv request failed" }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
