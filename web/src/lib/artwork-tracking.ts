import type { PosterEntry } from "./types";

export type TrackedArtwork = {
  media_item_id: string;
  tmdb_id: number | null;
  media_type: string;
  poster_id: string;
  asset_hash: string;
  creator_id: string | null;
  theme_id: string | null;
  node_base: string | null;
  applied_at: string;
  auto_update: boolean;
  plex_label: string | null;
  creator_display_name: string | null;
};

export type AutoUpdateSettings = {
  auto_update_artwork: boolean;
  add_plex_labels: boolean;
};

export type UpdateProgress = {
  total: number;
  checked: number;
  updated: number;
};

function _headers(adminToken: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` };
}

export async function getArtworkSettings(
  nodeUrl: string,
  adminToken: string,
): Promise<AutoUpdateSettings> {
  try {
    const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/artwork/settings`, {
      headers: _headers(adminToken),
    });
    if (!r.ok) return { auto_update_artwork: false, add_plex_labels: true };
    return r.json() as Promise<AutoUpdateSettings>;
  } catch {
    return { auto_update_artwork: false, add_plex_labels: true };
  }
}

export async function saveArtworkSettings(
  nodeUrl: string,
  adminToken: string,
  settings: Partial<AutoUpdateSettings>,
): Promise<void> {
  await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/artwork/settings`, {
    method: "PUT",
    headers: _headers(adminToken),
    body: JSON.stringify(settings),
  });
}

export async function getTrackedArtwork(
  nodeUrl: string,
  adminToken: string,
): Promise<TrackedArtwork[]> {
  try {
    const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/artwork/tracked`, {
      headers: _headers(adminToken),
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { items: TrackedArtwork[] };
    return d.items;
  } catch {
    return [];
  }
}

export async function removeAllPlexLabels(
  nodeUrl: string,
  adminToken: string,
): Promise<number> {
  try {
    const r = await fetch(`${nodeUrl.replace(/\/+$/, "")}/v1/admin/artwork/remove-labels`, {
      method: "POST",
      headers: _headers(adminToken),
    });
    if (!r.ok) return 0;
    const d = (await r.json()) as { removed: number };
    return d.removed;
  } catch {
    return 0;
  }
}

export async function untrackArtwork(
  nodeUrl: string,
  adminToken: string,
  mediaItemId: string,
): Promise<void> {
  const r = await fetch(
    `${nodeUrl.replace(/\/+$/, "")}/v1/admin/artwork/tracked/${encodeURIComponent(mediaItemId)}`,
    { method: "DELETE", headers: _headers(adminToken) },
  );
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? `reset failed: ${r.status}`);
  }
}

/** Fetch a single poster directly from the creator's home node (public endpoint, no auth). */
export async function fetchPosterFromNode(
  nodeBase: string,
  posterId: string,
): Promise<PosterEntry | null> {
  try {
    const r = await fetch(
      `${nodeBase.replace(/\/+$/, "")}/v1/posters/${encodeURIComponent(posterId)}`,
    );
    if (!r.ok) return null;
    return r.json() as Promise<PosterEntry>;
  } catch {
    return null;
  }
}

/**
 * Check all auto_update tracked items against their source node.
 * Calls onProgress after each item, calls onApply when a re-apply is needed.
 * Returns count of items updated.
 */
export async function runArtworkUpdateCheck(
  nodeUrl: string,
  adminToken: string,
  onProgress: (p: UpdateProgress) => void,
  onApply: (item: TrackedArtwork, poster: PosterEntry) => Promise<void>,
): Promise<number> {
  const [tracked, settings] = await Promise.all([
    getTrackedArtwork(nodeUrl, adminToken),
    getArtworkSettings(nodeUrl, adminToken),
  ]);

  if (!settings.auto_update_artwork) return 0;

  const items = tracked.filter((t) => t.auto_update && t.node_base);
  let checked = 0;
  let updated = 0;

  for (const item of items) {
    try {
      const poster = await fetchPosterFromNode(item.node_base!, item.poster_id);
      if (poster && poster.assets.full.hash !== item.asset_hash) {
        await onApply(item, poster);
        updated++;
      }
    } catch {
      // individual failures are silent
    }
    checked++;
    onProgress({ total: items.length, checked, updated });
  }

  return updated;
}
