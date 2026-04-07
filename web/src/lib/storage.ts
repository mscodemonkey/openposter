export type CreatorConnection = {
  nodeUrl: string;
  adminToken: string;
  creatorId: string;
};

const KEY_NODE = "openposter.creatorConnection.nodeUrl.v1";
const KEY_TOKEN = "openposter.creatorConnection.adminToken.v1";
const KEY_CREATOR_ID = "openposter.creatorConnection.creatorId.v1";
const LEGACY_SESSION_TOKEN_KEY = "openposter.creatorConnection.adminToken.session.v1";
const CONNECTION_EVENT = "openposter:creator-connection-changed";

// NOTE:
// - nodeUrl, creatorId, and adminToken are persisted in localStorage so the
//   connection survives new tabs/windows.
// - we still read the old sessionStorage token key for migration
// - we still read legacy combined localStorage key for migration
const LEGACY_KEY = "openposter.creatorConnection.v1";

function emitCreatorConnectionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONNECTION_EVENT));
}

export function onCreatorConnectionChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CONNECTION_EVENT, listener);
  return () => window.removeEventListener(CONNECTION_EVENT, listener);
}

export function loadCreatorConnection(): CreatorConnection | null {
  if (typeof window === "undefined") return null;

  // legacy migration
  try {
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (typeof parsed?.nodeUrl === "string" && typeof parsed?.adminToken === "string") {
        window.localStorage.setItem(KEY_NODE, parsed.nodeUrl);
        window.localStorage.setItem(KEY_TOKEN, parsed.adminToken);
        window.localStorage.removeItem(LEGACY_KEY);
      }
    }
  } catch {
    // ignore
  }

  const nodeUrl = window.localStorage.getItem(KEY_NODE);
  let adminToken = window.localStorage.getItem(KEY_TOKEN);
  if (!adminToken) {
    adminToken = window.sessionStorage.getItem(KEY_TOKEN)
      ?? window.sessionStorage.getItem(LEGACY_SESSION_TOKEN_KEY);
    if (adminToken) {
      window.localStorage.setItem(KEY_TOKEN, adminToken);
      window.sessionStorage.removeItem(KEY_TOKEN);
      window.sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
    }
  }

  if (!nodeUrl || !adminToken) return null;
  return {
    nodeUrl,
    adminToken,
    creatorId: window.localStorage.getItem(KEY_CREATOR_ID) ?? "",
  };
}

export function saveCreatorConnection(conn: CreatorConnection): void {
  window.localStorage.setItem(KEY_NODE, conn.nodeUrl);
  window.localStorage.setItem(KEY_TOKEN, conn.adminToken);
  window.sessionStorage.removeItem(KEY_TOKEN);
  window.sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
  if (conn.creatorId) window.localStorage.setItem(KEY_CREATOR_ID, conn.creatorId);
  emitCreatorConnectionChanged();
}

export function clearCreatorConnection(): void {
  window.localStorage.removeItem(KEY_NODE);
  window.localStorage.removeItem(KEY_TOKEN);
  window.sessionStorage.removeItem(KEY_TOKEN);
  window.sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
  window.localStorage.removeItem(KEY_CREATOR_ID);
  window.localStorage.removeItem(LEGACY_KEY);
  emitCreatorConnectionChanged();
}

export async function validateCreatorConnection(): Promise<CreatorConnection | null> {
  const conn = loadCreatorConnection();
  if (!conn) return null;

  try {
    const r = await fetch(`${conn.nodeUrl.replace(/\/+$/, "")}/v1/admin/whoami`, {
      headers: { Authorization: `Bearer ${conn.adminToken}` },
    });
    if (r.ok) return conn;
    if (r.status === 401 || r.status === 403) {
      clearCreatorConnection();
      return null;
    }
    return conn;
  } catch {
    // Preserve the local session when the node is temporarily unreachable.
    return conn;
  }
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
