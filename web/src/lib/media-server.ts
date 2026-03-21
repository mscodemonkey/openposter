import { loadCreatorConnection } from "./storage";

export type MediaItem = {
  id: string;
  title: string;
  year: number | null;
  type: string; // movie | show | collection | season | episode
  index: number | null;
  tmdb_id: number | null;
  leaf_count: number | null;
  child_count: number | null; // season count for shows; null for movies/collections
};

export type MediaLibrary = {
  movies: MediaItem[];
  shows: MediaItem[];
  collections: MediaItem[];
};

function _conn() {
  const conn = loadCreatorConnection();
  if (!conn) throw new Error("No node connected");
  return conn;
}

function _headers(adminToken: string) {
  return { Authorization: `Bearer ${adminToken}` };
}

export function thumbUrl(nodeUrl: string, adminToken: string, itemId: string): string {
  return `${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/thumb/${encodeURIComponent(itemId)}?t=${encodeURIComponent(adminToken)}`;
}

export function artUrl(nodeUrl: string, adminToken: string, itemId: string): string {
  return `${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/art/${encodeURIComponent(itemId)}?t=${encodeURIComponent(adminToken)}`;
}

export async function fetchMediaLibrary(): Promise<MediaLibrary> {
  const { nodeUrl, adminToken } = _conn();
  const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/library`, {
    headers: _headers(adminToken),
  });
  if (!r.ok) throw new Error(`Failed to fetch library: ${r.status}`);
  return r.json() as Promise<MediaLibrary>;
}

export async function fetchMediaChildren(nodeUrl: string, adminToken: string, itemId: string): Promise<MediaItem[]> {
  const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/items/${encodeURIComponent(itemId)}/children`, {
    headers: _headers(adminToken),
  });
  if (!r.ok) throw new Error(`Failed to fetch children: ${r.status}`);
  const json = await r.json() as { items: MediaItem[] };
  return json.items;
}
