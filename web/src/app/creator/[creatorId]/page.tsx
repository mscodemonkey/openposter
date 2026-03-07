"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

type PagedResponse = {
  results: PosterEntry[];
  next_cursor?: string | null;
};

type CreatorsResponse = {
  results: Array<{ creator_id: string; display_name: string | null; count: number }>;
};

export default function CreatorPage({ params }: { params: { creatorId: string } }) {
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);
  const creatorId = params.creatorId;

  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCreatorInfo() {
    const r = await fetch(`${base}/v1/creators?limit=500`);
    if (!r.ok) throw new Error(`creators failed: ${r.status}`);
    const json = (await r.json()) as CreatorsResponse;
    const match = json.results.find((c) => c.creator_id === creatorId);
    setCreatorName(match?.display_name || null);
  }

  async function loadFirst() {
    setError(null);
    const u = new URL(`${base}/v1/by_creator`);
    u.searchParams.set("creator_id", creatorId);
    u.searchParams.set("limit", "40");

    const r = await fetch(u.toString());
    if (!r.ok) throw new Error(`by_creator failed: ${r.status}`);
    const json = (await r.json()) as PagedResponse;
    setItems(json.results);
    setNextCursor(json.next_cursor || null);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const u = new URL(`${base}/v1/by_creator`);
      u.searchParams.set("creator_id", creatorId);
      u.searchParams.set("limit", "40");
      u.searchParams.set("cursor", nextCursor);

      const r = await fetch(u.toString());
      if (!r.ok) throw new Error(`by_creator failed: ${r.status}`);
      const json = (await r.json()) as PagedResponse;
      setItems((prev) => ([...(prev || []), ...json.results]));
      setNextCursor(json.next_cursor || null);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadCreatorInfo(), loadFirst()]);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId]);

  return (
    <div className="op-container">
      <div className="op-row op-row--between">
        <div>
          <h1 className="op-title-lg">{creatorName || creatorId}</h1>
          <div className="op-subtle op-text-sm">
            Creator id: <code className="op-code">{creatorId}</code>
          </div>
        </div>
        <div>
          <a className="op-link op-text-sm" href={`/browse?creator_id=${encodeURIComponent(creatorId)}`}>
            Browse with filters →
          </a>
        </div>
      </div>

      {error && <div className="op-alert op-alert--error">{error}</div>}

      <section className="op-section">
        <h2 className="op-section-title">Posters</h2>

        {items === null ? (
          <p className="op-subtle op-mt-12">Loading…</p>
        ) : items.length === 0 ? (
          <p className="op-subtle op-mt-12">No posters.</p>
        ) : (
          <div className="op-grid op-grid--posters">
            {items.map((r) => (
              <div key={r.poster_id} className="op-card">
                <a href={r.assets.preview.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="op-img" src={r.assets.preview.url} alt={r.media.title || r.poster_id} />
                </a>
                <div className="op-poster-meta">
                  <div className="op-poster-title">{r.media.title || "(untitled)"}</div>
                  <div className="op-subtle op-text-sm">{r.media.type} · TMDB {r.media.tmdb_id}</div>
                  <div className="op-row op-mt-8">
                    <a className="op-link op-text-sm" href={r.assets.full.url} target="_blank" rel="noreferrer">
                      Download
                    </a>
                    <a className="op-link op-text-sm" href={r.creator.home_node} target="_blank" rel="noreferrer">
                      Node
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="op-mt-16">
          {nextCursor ? (
            <button className="op-btn" onClick={() => void loadMore().catch((e) => setError(e?.message || String(e)))} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : (
            <div className="op-faint op-text-sm">End of list.</div>
          )}
        </div>
      </section>
    </div>
  );
}
