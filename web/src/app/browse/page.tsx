"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

type PagedResponse = {
  results: PosterEntry[];
  next_cursor?: string | null;
};

export default function BrowsePage() {
  const [creatorId, setCreatorId] = useState<string>("");
  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  useEffect(() => {
    // parse query string on client
    try {
      const sp = new URLSearchParams(window.location.search);
      const cid = sp.get("creator_id") || "";
      setCreatorId(cid);
    } catch {
      setCreatorId("");
    }
  }, []);

  async function loadFirst() {
    setError(null);

    const url = creatorId
      ? `${base}/v1/by_creator?creator_id=${encodeURIComponent(creatorId)}&limit=40`
      : `${base}/v1/recent?limit=40`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`browse failed: ${r.status}`);
    const json = (await r.json()) as PagedResponse;
    setItems(json.results);
    setNextCursor(json.next_cursor || null);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const url = creatorId
        ? `${base}/v1/by_creator?creator_id=${encodeURIComponent(creatorId)}&limit=40&cursor=${encodeURIComponent(nextCursor)}`
        : `${base}/v1/recent?limit=40&cursor=${encodeURIComponent(nextCursor)}`;

      const r = await fetch(url);
      if (!r.ok) throw new Error(`browse failed: ${r.status}`);
      const json = (await r.json()) as PagedResponse;
      setItems((prev) => ([...(prev || []), ...json.results]));
      setNextCursor(json.next_cursor || null);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    // once creatorId is set, load
    if (creatorId === "" && items !== null) return;
    void loadFirst().catch((e) => setError(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>
        Browse {creatorId ? `creator ${creatorId}` : "recent"}
      </h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Indexer: <code>{INDEXER_BASE_URL}</code>
      </p>

      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #633", borderRadius: 10 }}>
          {error}
        </div>
      )}

      {items === null ? (
        <p style={{ opacity: 0.8, marginTop: 12 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ opacity: 0.8, marginTop: 12 }}>No posters.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 12 }}>
          {items.map((r) => (
            <div key={r.poster_id} style={{ border: "1px solid #333", borderRadius: 10, overflow: "hidden" }}>
              <a href={r.assets.preview.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.assets.preview.url} alt={r.media.title || r.poster_id} style={{ width: "100%", display: "block" }} />
              </a>
              <div style={{ padding: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, lineHeight: "16px" }}>{r.media.title || "(untitled)"}</div>
                <div style={{ opacity: 0.8, fontSize: 12 }}>{r.creator.display_name}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <a href={r.assets.full.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    Download
                  </a>
                  <a href={r.creator.home_node} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    Node
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {nextCursor ? (
          <button
            onClick={() => void loadMore().catch((e) => setError(e?.message || String(e)))}
            disabled={loadingMore}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #333" }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : (
          <div style={{ opacity: 0.7, fontSize: 12 }}>End of list.</div>
        )}
      </div>
    </div>
  );
}
