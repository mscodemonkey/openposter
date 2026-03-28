export type CreatorConnection = {
  nodeUrl: string;
  adminToken: string;
  creatorId: string;
};

const KEY_NODE = "openposter.creatorConnection.nodeUrl.v1";
const KEY_TOKEN = "openposter.creatorConnection.adminToken.v1";
const KEY_CREATOR_ID = "openposter.creatorConnection.creatorId.v1";

// NOTE:
// - nodeUrl and creatorId are persisted in localStorage (available across sessions)
// - adminToken is persisted in sessionStorage (reduces risk of long-lived tokens)
// - we still read legacy combined localStorage key for migration
const LEGACY_KEY = "openposter.creatorConnection.v1";

export function loadCreatorConnection(): CreatorConnection | null {
  if (typeof window === "undefined") return null;

  // legacy migration
  try {
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (typeof parsed?.nodeUrl === "string" && typeof parsed?.adminToken === "string") {
        window.localStorage.setItem(KEY_NODE, parsed.nodeUrl);
        window.sessionStorage.setItem(KEY_TOKEN, parsed.adminToken);
        window.localStorage.removeItem(LEGACY_KEY);
      }
    }
  } catch {
    // ignore
  }

  const nodeUrl = window.localStorage.getItem(KEY_NODE);
  const adminToken = window.sessionStorage.getItem(KEY_TOKEN);

  if (!nodeUrl || !adminToken) return null;
  return {
    nodeUrl,
    adminToken,
    creatorId: window.localStorage.getItem(KEY_CREATOR_ID) ?? "",
  };
}

export function saveCreatorConnection(conn: CreatorConnection): void {
  window.localStorage.setItem(KEY_NODE, conn.nodeUrl);
  window.sessionStorage.setItem(KEY_TOKEN, conn.adminToken);
  if (conn.creatorId) window.localStorage.setItem(KEY_CREATOR_ID, conn.creatorId);
}

export function clearCreatorConnection(): void {
  window.localStorage.removeItem(KEY_NODE);
  window.sessionStorage.removeItem(KEY_TOKEN);
  window.localStorage.removeItem(KEY_CREATOR_ID);
  window.localStorage.removeItem(LEGACY_KEY);
}

// ─── Poster display preference ───────────────────────────────────────────────

const KEY_SHOW_DETAILS = "openposter.showPosterDetails.v1";

export function loadShowPosterDetails(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(KEY_SHOW_DETAILS);
  return v === null ? true : v !== "false";
}

export function saveShowPosterDetails(show: boolean): void {
  window.localStorage.setItem(KEY_SHOW_DETAILS, show ? "true" : "false");
}
