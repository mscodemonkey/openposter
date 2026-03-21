/**
 * Admin-only creator settings helpers.
 * Stores arbitrary JSON values on the node, keyed by (creator_id, key).
 */

function authHeaders(token: string, creatorId: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "x-creator-id": creatorId,
  };
}

export async function fetchSetting<T>(
  nodeUrl: string,
  adminToken: string,
  creatorId: string,
  key: string
): Promise<T | null> {
  try {
    const r = await fetch(`${nodeUrl}/v1/admin/settings/${encodeURIComponent(key)}`, {
      headers: authHeaders(adminToken, creatorId),
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { value: string | null };
    if (json.value == null) return null;
    return JSON.parse(json.value) as T;
  } catch {
    return null;
  }
}

export async function saveSetting(
  nodeUrl: string,
  adminToken: string,
  creatorId: string,
  key: string,
  value: unknown
): Promise<void> {
  await fetch(`${nodeUrl}/v1/admin/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: authHeaders(adminToken, creatorId),
    body: JSON.stringify({ value: JSON.stringify(value) }),
  });
}
