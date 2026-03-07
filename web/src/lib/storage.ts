export type CreatorConnection = {
  nodeUrl: string;
  adminToken: string;
};

const KEY = "openposter.creatorConnection.v1";

export function loadCreatorConnection(): CreatorConnection | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.nodeUrl === "string" &&
      typeof parsed?.adminToken === "string"
    ) {
      return {
        nodeUrl: parsed.nodeUrl,
        adminToken: parsed.adminToken,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCreatorConnection(conn: CreatorConnection): void {
  window.localStorage.setItem(KEY, JSON.stringify(conn));
}

export function clearCreatorConnection(): void {
  window.localStorage.removeItem(KEY);
}
