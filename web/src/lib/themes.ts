/**
 * Admin-only theme management helpers.
 * All calls require nodeUrl + adminToken from the creator connection.
 */

import type { CreatorTheme } from "./types";

function authHeaders(token: string, creatorId: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "x-creator-id": creatorId,
  };
}

export async function adminListThemes(
  nodeUrl: string,
  adminToken: string,
  creatorId: string
): Promise<CreatorTheme[]> {
  const r = await fetch(`${nodeUrl}/v1/admin/themes`, {
    headers: authHeaders(adminToken, creatorId),
  });
  if (!r.ok) throw new Error(`Failed to list themes: ${r.status}`);
  const json = (await r.json()) as { themes: CreatorTheme[] };
  return json.themes;
}

export async function adminCreateTheme(
  nodeUrl: string,
  adminToken: string,
  creatorId: string,
  name: string,
  description?: string
): Promise<CreatorTheme> {
  const r = await fetch(`${nodeUrl}/v1/admin/themes`, {
    method: "POST",
    headers: authHeaders(adminToken, creatorId),
    body: JSON.stringify({ name, description: description ?? null }),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Create theme failed: ${r.status}`);
  }
  return r.json() as Promise<CreatorTheme>;
}

export async function adminUpdateTheme(
  nodeUrl: string,
  adminToken: string,
  creatorId: string,
  themeId: string,
  updates: { name?: string; description?: string }
): Promise<void> {
  const r = await fetch(`${nodeUrl}/v1/admin/themes/${encodeURIComponent(themeId)}`, {
    method: "PUT",
    headers: authHeaders(adminToken, creatorId),
    body: JSON.stringify(updates),
  });
  if (!r.ok) throw new Error(`Update theme failed: ${r.status}`);
}

export async function adminDeleteTheme(
  nodeUrl: string,
  adminToken: string,
  creatorId: string,
  themeId: string
): Promise<void> {
  const r = await fetch(`${nodeUrl}/v1/admin/themes/${encodeURIComponent(themeId)}`, {
    method: "DELETE",
    headers: authHeaders(adminToken, creatorId),
  });
  if (!r.ok) throw new Error(`Delete theme failed: ${r.status}`);
}

export async function adminUploadThemeCover(
  nodeUrl: string,
  adminToken: string,
  creatorId: string,
  themeId: string,
  file: File
): Promise<{ cover_hash: string; cover_url: string }> {
  const fd = new FormData();
  fd.append("cover", file);
  const r = await fetch(`${nodeUrl}/v1/admin/themes/${encodeURIComponent(themeId)}/cover`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "x-creator-id": creatorId },
    body: fd,
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Upload cover failed: ${r.status}`);
  }
  return r.json() as Promise<{ cover_hash: string; cover_url: string }>;
}

export async function adminUploadCreatorBackdrop(
  nodeUrl: string,
  adminToken: string,
  creatorId: string,
  file: File
): Promise<{ backdrop_hash: string; backdrop_url: string }> {
  const fd = new FormData();
  fd.append("backdrop", file);
  const r = await fetch(`${nodeUrl}/v1/admin/creator_profile/backdrop`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "x-creator-id": creatorId },
    body: fd,
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Upload backdrop failed: ${r.status}`);
  }
  return r.json() as Promise<{ backdrop_hash: string; backdrop_url: string }>;
}

export async function adminSetPosterTheme(
  nodeUrl: string,
  adminToken: string,
  posterId: string,
  themeId: string | null
): Promise<void> {
  const r = await fetch(`${nodeUrl}/v1/admin/posters/${encodeURIComponent(posterId)}/theme`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ theme_id: themeId }),
  });
  if (!r.ok) throw new Error(`Set poster theme failed: ${r.status}`);
}
