import { loadCreatorConnection } from "./storage";

export type MediaItem = {
  id: string;
  server_id?: string | null;
  title: string;
  year: number | null;
  type: string; // movie | show | collection | season | episode
  index: number | null;
  tmdb_id: number | null;
  leaf_count: number | null;
  child_count: number | null; // season count for shows; null for movies/collections
  collection_ids?: string[]; // ratingKeys of collections this movie belongs to (movies only)
  library_title?: string | null; // Plex section title (e.g. "Movies", "4K Movies")
};

export type MediaLibrary = {
  movies: MediaItem[];
  shows: MediaItem[];
  collections: MediaItem[];
  synced_at: string | null;
  is_syncing: boolean;
};

export type SyncStatus = {
  is_syncing: boolean;
  last_synced_at: string | null;
  current_phase: string | null;
  error: string | null;
  item_count: number;
};

function _conn() {
  const conn = loadCreatorConnection();
  if (!conn) throw new Error("No node connected");
  return conn;
}

function _headers(adminToken: string) {
  return { Authorization: `Bearer ${adminToken}` };
}

// Module-level bust key — incremented by bustThumbs() to force fresh URLs after cache clear.
let _thumbBustKey = 0;
export function bustThumbs(): void { _thumbBustKey++; }

export function thumbUrl(nodeUrl: string, adminToken: string, itemId: string): string {
  const base = `${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/thumb/${encodeURIComponent(itemId)}?t=${encodeURIComponent(adminToken)}`;
  return _thumbBustKey > 0 ? `${base}&v=${_thumbBustKey}` : base;
}

export async function clearThumbCache(nodeUrl: string, adminToken: string): Promise<void> {
  await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/thumbs/cache`, {
    method: "DELETE",
    headers: _headers(adminToken),
  });
}

export function artUrl(nodeUrl: string, adminToken: string, itemId: string): string {
  return `${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/art/${encodeURIComponent(itemId)}?t=${encodeURIComponent(adminToken)}`;
}

export function logoUrl(nodeUrl: string, adminToken: string, itemId: string): string {
  return `${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/logo/${encodeURIComponent(itemId)}?t=${encodeURIComponent(adminToken)}`;
}

export function squareUrl(nodeUrl: string, adminToken: string, itemId: string): string {
  return `${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/square/${encodeURIComponent(itemId)}?t=${encodeURIComponent(adminToken)}`;
}

export async function fetchMediaLibrary(serverId?: string | null): Promise<MediaLibrary> {
  const { nodeUrl, adminToken } = _conn();
  const params = new URLSearchParams();
  if (serverId) params.set("server_id", serverId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/library${suffix}`, {
    headers: _headers(adminToken),
  });
  if (!r.ok) throw new Error(`Failed to fetch library: ${r.status}`);
  return r.json() as Promise<MediaLibrary>;
}

export async function fetchMediaChildren(nodeUrl: string, adminToken: string, itemId: string, serverId?: string | null): Promise<MediaItem[]> {
  const params = new URLSearchParams();
  if (serverId) params.set("server_id", serverId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/items/${encodeURIComponent(itemId)}/children${suffix}`, {
    headers: _headers(adminToken),
  });
  if (!r.ok) throw new Error(`Failed to fetch children: ${r.status}`);
  const json = await r.json() as { items: MediaItem[] };
  return json.items;
}

export async function fetchSyncStatus(nodeUrl: string, adminToken: string, serverId?: string | null): Promise<SyncStatus> {
  const params = new URLSearchParams();
  if (serverId) params.set("server_id", serverId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/sync/status${suffix}`, {
    headers: _headers(adminToken),
  });
  if (!r.ok) throw new Error(`Failed to fetch sync status: ${r.status}`);
  return r.json() as Promise<SyncStatus>;
}

export async function triggerSync(nodeUrl: string, adminToken: string, serverId?: string | null): Promise<{ started: boolean; reason?: string }> {
  const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/media-server/sync/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ..._headers(adminToken),
    },
    body: JSON.stringify(serverId ? { server_id: serverId } : {}),
  });
  if (!r.ok) throw new Error(`Failed to trigger sync: ${r.status}`);
  return r.json() as Promise<{ started: boolean; reason?: string }>;
}
