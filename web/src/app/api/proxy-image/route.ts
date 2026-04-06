import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side image proxy. Fetches an image from any URL and returns the
 * bytes to the browser. Used when the browser can't fetch a cross-origin
 * blob directly (CORS) but the Next.js server can reach it on the host
 * network (e.g. another node at localhost:808x).
 *
 * GET /api/proxy-image?url=<encoded-url>
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  // Only allow http/https to prevent SSRF against internal non-HTTP services.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "unsupported protocol" }, { status: 400 });
  }

  // When running inside Docker (e.g. docker compose), localhost in the URL
  // refers to the host machine's loopback — not accessible from within the
  // container. Rewrite to host.docker.internal, which Docker Desktop (macOS
  // and Windows) maps to the host machine. On production the URL won't be
  // localhost anyway, so this only affects local dev.
  let fetchUrl = url;
  if (parsed.hostname === "localhost") {
    const rewritten = new URL(url);
    rewritten.hostname = "host.docker.internal";
    fetchUrl = rewritten.toString();
  }

  let upstream: Response;
  try {
    upstream = await fetch(fetchUrl, { cache: "no-store" });
  } catch (e) {
    return NextResponse.json({ error: `fetch failed: ${e}` }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: `upstream returned ${upstream.status}` }, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": contentType },
  });
}
