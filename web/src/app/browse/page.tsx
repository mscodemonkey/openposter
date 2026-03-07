"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

type PagedResponse = {
  results: PosterEntry[];
  next_cursor?: string | null;
};

type CreatorsResponse = {
  results: Array<{ creator_id: string; display_name: string | null }>;
};

const MEDIA_TYPES = ["", "movie", "show", "season", "episode", "collection"];

export default function BrowsePage() {
  const [creatorId, setCreatorId] = useState<string>("");
  const [mediaType, setMediaType] = useState<string>("");

  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creators, setCreators] = useState<CreatorsResponse | null>(null);

  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  useEffect(() => {
    // parse query string on client
    try {
      const sp = new URLSearchParams(window.location.search);
      setCreatorId(sp.get("creator_id") || "");
      setMediaType(sp.get("media_type") || "");
    } catch {
      setCreatorId("");
      setMediaType("");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`${base}/v1/creators?limit=200`);
        if (!r.ok) throw new Error(`creators failed: ${r.status}`);
        setCreators((await r.json()) as CreatorsResponse);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, [base]);

  function buildUrl(cursor?: string | null) {
    const u = new URL(`${base}/v1/recent`);
    u.searchParams.set("limit", "40");
    if (mediaType) u.searchParams.set("media_type", mediaType);
    if (creatorId) u.searchParams.set("creator_id", creatorId);
    if (cursor) u.searchParams.set("cursor", cursor);
    return u.toString();
  }

  async function loadFirst() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(buildUrl(null));
      if (!r.ok) throw new Error(`browse failed: ${r.status}`);
      const json = (await r.json()) as PagedResponse;
      setItems(json.results);
      setNextCursor(json.next_cursor || null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const r = await fetch(buildUrl(nextCursor));
      if (!r.ok) throw new Error(`browse failed: ${r.status}`);
      const json = (await r.json()) as PagedResponse;
      setItems((prev) => ([...(prev || []), ...json.results]));
      setNextCursor(json.next_cursor || null);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    // once filters are set, load
    void loadFirst().catch((e) => setError(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, mediaType]);

  return (
    <div className="op-container">
      <h1 className="op-title-lg">Browse</h1>
      <p className="op-subtle op-mt-6">
        Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
      </p>

      <section className="op-section">
        <h2 className="op-section-title">Filters</h2>
        <div className="op-form-grid-2 op-mt-10">
          <label className="op-label">
            <div className="op-label-hint">Creator</div>
            <select
              className="op-select"
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
            >
              <option value="">(any)</option>
              {creators?.results.map((c) => (
                <option key={c.creator_id} value={c.creator_id}>
                  {c.display_name || c.creator_id}
                </option>
              ))}
            </select>
          </label>

          <label className="op-label">
            <div className="op-label-hint">Media type</div>
            <select
              className="op-select"
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value)}
            >
              {MEDIA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === "" ? "(any)" : t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && <div className="op-alert op-alert--error">{error}</div>}

      <section className="op-section">
        <h2 className="op-section-title">Results</h2>
        {loading || items === null ? (
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
                  <div className="op-subtle op-text-sm">{r.creator.display_name}</div>
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
