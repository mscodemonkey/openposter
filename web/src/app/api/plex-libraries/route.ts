import { NextResponse } from "next/server";

const PLEX_HEADERS = {
  Accept: "application/json",
  "X-Plex-Product": "OpenPoster",
  "X-Plex-Client-Identifier": "openposter-web",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const plexUrl = searchParams.get("url");
  const token = searchParams.get("token");
  if (!plexUrl || !token) {
    return NextResponse.json({ error: "Missing url or token" }, { status: 400 });
  }

  try {
    const r = await fetch(`${plexUrl.replace(/\/+$/, "")}/library/sections`, {
      headers: { ...PLEX_HEADERS, "X-Plex-Token": token },
    });
    if (!r.ok) {
      return NextResponse.json({ error: `Plex returned ${r.status}` }, { status: 502 });
    }
    const data = (await r.json()) as {
      MediaContainer?: { Directory?: { key: string; title: string; type: string }[] };
    };
    const sections = data.MediaContainer?.Directory ?? [];
    return NextResponse.json({
      libraries: sections.map((s) => ({ id: s.key, title: s.title, type: s.type })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
