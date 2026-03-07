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
  const [tmdbId, setTmdbId] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const [copied, setCopied] = useState(false);

  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creators, setCreators] = useState<CreatorsResponse | null>(null);

  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  function syncUrl(next: {
    creatorId: string;
    mediaType: string;
    tmdbId: string;
    q: string;
  }) {
    const sp = new URLSearchParams();
    if (next.creatorId) sp.set("creator_id", next.creatorId);
    if (next.mediaType) sp.set("media_type", next.mediaType);
    if (next.tmdbId) sp.set("tmdb_id", next.tmdbId);
    if (next.q) sp.set("q", next.q);
    const qs = sp.toString();
    const newUrl = qs ? `/browse?${qs}` : "/browse";
    window.history.replaceState(null, "", newUrl);
  }

  useEffect(() => {
    // parse query string on client
    try {
      const sp = new URLSearchParams(window.location.search);
      setCreatorId(sp.get("creator_id") || "");
      setMediaType(sp.get("media_type") || "");
      setTmdbId(sp.get("tmdb_id") || "");
      setQ(sp.get("q") || "");
    } catch {
      setCreatorId("");
      setMediaType("");
      setTmdbId("");
      setQ("");
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

  function useSearchEndpoint() {
    return tmdbId.trim() !== "" || q.trim() !== "";
  }

  function buildUrl(cursor?: string | null) {
    if (useSearchEndpoint()) {
      const u = new URL(`${base}/v1/search`);
      u.searchParams.set("limit", "40");
      if (tmdbId) u.searchParams.set("tmdb_id", tmdbId);
      if (q) u.searchParams.set("q", q);
      if (mediaType) u.searchParams.set("type", mediaType);
      if (creatorId) u.searchParams.set("creator_id", creatorId);
      if (cursor) u.searchParams.set("cursor", cursor);
      return u.toString();
    }

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
    // keep URL shareable
    try {
      syncUrl({
        creatorId,
        mediaType,
        tmdbId: tmdbId.trim(),
        q: q.trim(),
      });
    } catch {
      // ignore
    }

    void loadFirst().catch((e) => setError(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, mediaType, tmdbId, q]);

  return (
    <div className="op-container">
      <h1 className="op-title-lg">Browse</h1>
      <p className="op-subtle op-mt-6">
        Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
      </p>

      <section className="op-section">
        <div className="op-row op-row--between">
          <h2 className="op-section-title">Filters</h2>
          <div className="op-row">
            <button
              className="op-btn op-btn--sm"
              onClick={() => {
                setCreatorId("");
                setMediaType("");
                setTmdbId("");
                setQ("");
              }}
            >
              Clear
            </button>
            <button
              className="op-btn op-btn--sm"
              onClick={() => {
                try {
                  void navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                } catch {
                  // ignore
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>

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

        <div className="op-form-grid-2 op-mt-10">
          <label className="op-label">
            <div className="op-label-hint">Title contains</div>
            <input className="op-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="optional" />
          </label>

          <label className="op-label">
            <div className="op-label-hint">TMDB id</div>
            <input className="op-input" value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} placeholder="optional" />
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
                <a className="op-link" href={`/p/${encodeURIComponent(r.poster_id)}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="op-img" src={r.assets.preview.url} alt={r.media.title || r.poster_id} />
                </a>
                <div className="op-poster-meta">
                  <div className="op-poster-title">{r.media.title || "(untitled)"}</div>
                  <div className="op-subtle op-text-sm">
                    <a className="op-link" href={`/creator/${encodeURIComponent(r.creator.creator_id)}`}>
                      {r.creator.display_name}
                    </a>
                  </div>
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
