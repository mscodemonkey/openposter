import { NextResponse } from "next/server";

const CLIENT_IDENTIFIER = "openposter-web";
const PLEX_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Plex-Product": "OpenPoster",
  "X-Plex-Client-Identifier": CLIENT_IDENTIFIER,
};

export async function POST() {
  let r: Response;
  try {
    r = await fetch("https://plex.tv/api/v2/pins?strong=true", {
      method: "POST",
      headers: PLEX_HEADERS,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach plex.tv" }, { status: 502 });
  }
  if (!r.ok) {
    return NextResponse.json({ error: "Plex PIN request failed" }, { status: 502 });
  }
  const data = (await r.json()) as { id: number; code: string };
  return NextResponse.json({ id: data.id, code: data.code, clientIdentifier: CLIENT_IDENTIFIER });
}
