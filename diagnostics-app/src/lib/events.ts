export type DiagEventType = "upload" | "delete" | "indexed" | "applied";

export type DiagEvent = {
  id: string;
  type: DiagEventType;
  service: string;
  posterId: string;
  title: string | null;
  detail: string | null;
  at: string; // ISO timestamp
};

export function makeEventId(type: DiagEventType, service: string, posterId: string, at: string): string {
  return `${type}:${service}:${posterId}:${at}`;
}

export function mergeEvents(existing: DiagEvent[], incoming: DiagEvent[], cap = 200): DiagEvent[] {
  const seen = new Set(existing.map((e) => e.id));
  const next = [...existing];
  for (const e of incoming) {
    if (!seen.has(e.id)) {
      next.push(e);
      seen.add(e.id);
    }
  }
  // Sort descending by timestamp, cap at `cap`
  next.sort((a, b) => b.at.localeCompare(a.at));
  return next.slice(0, cap);
}
