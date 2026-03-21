import { NextRequest } from "next/server";

const INDEXER = (
  process.env.INDEXER_BASE_URL ||
  process.env.NEXT_PUBLIC_INDEXER_BASE_URL ||
  "http://localhost:8090"
).replace(/\/+$/, "");

export async function GET(req: NextRequest) {
  const u = new URL(`${INDEXER}/v1/search`);
  for (const [k, v] of req.nextUrl.searchParams) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { cache: "no-store" });
  const body = await r.json() as unknown;
  return Response.json(body, { status: r.status });
}
