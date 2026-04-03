import { NextResponse } from "next/server";

const CLIENT_IDENTIFIER = "openposter-web";
const PLEX_HEADERS = {
  Accept: "application/json",
  "X-Plex-Product": "OpenPoster",
  "X-Plex-Client-Identifier": CLIENT_IDENTIFIER,
};

type PlexConnection = { uri: string; local: boolean };

type PlexResource = {
  name: string;
  provides: string;
  connections: PlexConnection[];
};

export type PlexServer = {
  name: string;
  /** Suggested URL — local connection preferred for self-hosted nodes */
  url: string;
  /** All available connection URIs so the user can override if needed */
  connections: { uri: string; local: boolean }[];
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pinId: string }> },
) {
  const { pinId } = await params;

  let pinRes: Response;
  try {
    pinRes = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: PLEX_HEADERS,
    });
  } catch {
    return NextResponse.json({ done: false });
  }

  if (!pinRes.ok) return NextResponse.json({ done: false });
  const pin = (await pinRes.json()) as { authToken?: string | null };
  if (!pin.authToken) return NextResponse.json({ done: false });

  // Fetch the user's Plex Media Servers so the UI can offer a picker
  let servers: PlexServer[] = [];
  try {
    const resRes = await fetch(
      "https://plex.tv/api/v2/resources?includeHttps=1&includeIPv6=1",
      { headers: { ...PLEX_HEADERS, "X-Plex-Token": pin.authToken } },
    );
    if (resRes.ok) {
      const resources = (await resRes.json()) as PlexResource[];
      servers = resources
        .filter((r) => r.provides?.includes("server"))
        .map((r) => {
          // Prefer local connections — the OpenPoster node is typically on the
          // same network as the Plex server, so the LAN IP is most reliable.
          const suggested =
            r.connections.find((c) => c.local)?.uri ??
            r.connections.find((c) => !c.local && c.uri.startsWith("https"))?.uri ??
            r.connections[0]?.uri ??
            "";
          return {
            name: r.name,
            url: suggested,
            connections: r.connections,
          };
        })
        .filter((s) => s.url);
    }
  } catch {
    // non-fatal — caller can still fall back to manual URL entry
  }

  return NextResponse.json({ done: true, token: pin.authToken, servers });
}
