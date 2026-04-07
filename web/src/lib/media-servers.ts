/**
 * Multi-server media integration helpers.
 *
 * Supports Plex and Jellyfin. Credentials are stored server-side; the token
 * is never returned to the browser from list/status endpoints.
 */

export type MediaServerType = "plex" | "jellyfin";

export type MediaServerConfig = {
  id: string;
  type: MediaServerType;
  name: string;
  base_url: string;
  tv_libraries: string[];
  movie_libraries: string[];
  // `token` is never present — the API redacts it on read
};

export type DetectResult = {
  type: MediaServerType;
  name: string;
};

function _headers(adminToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  };
}

function _base(nodeUrl: string) {
  return nodeUrl.replace(/\/+$/, "");
}

/** Detect the server type and name from a URL + token (does not save). */
export async function detectMediaServer(
  nodeUrl: string,
  adminToken: string,
  serverUrl: string,
  serverToken: string,
): Promise<DetectResult> {
  const r = await fetch(`${_base(nodeUrl)}/v1/admin/media-servers/detect`, {
    method: "POST",
    headers: _headers(adminToken),
    body: JSON.stringify({ url: serverUrl, token: serverToken }),
  });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      throw new Error("Node session expired — please reconnect your node in Settings.");
    }
    const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? `Detection failed: ${r.status}`);
  }
  return r.json() as Promise<DetectResult>;
}

/** List all configured media servers (token redacted). */
export async function listMediaServers(
  nodeUrl: string,
  adminToken: string,
): Promise<MediaServerConfig[]> {
  const r = await fetch(`${_base(nodeUrl)}/v1/admin/media-servers`, {
    headers: _headers(adminToken),
  });
  if (!r.ok) return [];
  return r.json() as Promise<MediaServerConfig[]>;
}

/** Add or update a media server (validates connection before saving). */
export async function addMediaServer(
  nodeUrl: string,
  adminToken: string,
  config: Omit<MediaServerConfig, "id"> & { id?: string; token: string },
): Promise<MediaServerConfig> {
  const target = `${_base(nodeUrl)}/v1/admin/media-servers`;
  console.debug("[MediaServerWizard] addMediaServer:start", {
    target,
    nodeUrl: _base(nodeUrl),
    config: {
      id: config.id ?? null,
      type: config.type,
      name: config.name,
      base_url: config.base_url,
      tv_libraries: config.tv_libraries,
      movie_libraries: config.movie_libraries,
    },
  });
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  let r: Response;
  try {
    r = await fetch(target, {
      method: "POST",
      headers: _headers(adminToken),
      body: JSON.stringify(config),
      signal: controller.signal,
    });
  } catch (e: unknown) {
    window.clearTimeout(timeoutId);
    console.error("[MediaServerWizard] addMediaServer:error", {
      target,
      error: e instanceof Error ? { name: e.name, message: e.message } : e,
    });
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`Saving the media server to ${_base(nodeUrl)} timed out. Please reconnect your node and try again.`);
    }
    throw e;
  }
  window.clearTimeout(timeoutId);
  console.debug("[MediaServerWizard] addMediaServer:response", {
    target,
    status: r.status,
    ok: r.ok,
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    console.error("[MediaServerWizard] addMediaServer:bad-response", {
      target,
      status: r.status,
      payload: j,
    });
    throw new Error(j?.error?.message ?? `Failed to add server: ${r.status}`);
  }
  const result = await r.json() as MediaServerConfig;
  console.debug("[MediaServerWizard] addMediaServer:success", {
    target,
    result,
  });
  return result;
}

/** Remove a media server by ID. */
export async function removeMediaServer(
  nodeUrl: string,
  adminToken: string,
  serverId: string,
): Promise<void> {
  await fetch(`${_base(nodeUrl)}/v1/admin/media-servers/${encodeURIComponent(serverId)}`, {
    method: "DELETE",
    headers: _headers(adminToken),
  });
}
