"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry, SearchResponse } from "@/lib/types";

import CreatorPicker from "@/components/CreatorPicker";

type FacetsResponse = {
  media_types: Array<{ type: string; count: number }>;
  creators: Array<{ creator_id: string; display_name: string | null; count: number }>;
};

export default function SearchPage() {
  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  const [tmdbId, setTmdbId] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [creatorId, setCreatorId] = useState("");

  const [facets, setFacets] = useState<FacetsResponse | null>(null);

  const [results, setResults] = useState<PosterEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildUrl(cursor?: string | null) {
    const u = new URL(base + "/v1/search");
    u.searchParams.set("limit", "40");
    if (tmdbId.trim() !== "") u.searchParams.set("tmdb_id", tmdbId.trim());
    if (q.trim() !== "") u.searchParams.set("q", q.trim());
    if (type.trim() !== "") u.searchParams.set("type", type.trim());
    if (creatorId.trim() !== "") u.searchParams.set("creator_id", creatorId.trim());
    if (cursor) u.searchParams.set("cursor", cursor);
    return u.toString();
  }

  function syncUrl() {
    const sp = new URLSearchParams();
    if (tmdbId.trim() !== "") sp.set("tmdb_id", tmdbId.trim());
    if (q.trim() !== "") sp.set("q", q.trim());
    if (type.trim() !== "") sp.set("type", type.trim());
    if (creatorId.trim() !== "") sp.set("creator_id", creatorId.trim());
    const qs = sp.toString();
    const next = qs ? `/search?${qs}` : "/search";
    window.history.replaceState(null, "", next);
  }

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      syncUrl();
      const r = await fetch(buildUrl(null));
      if (!r.ok) throw new Error(`search failed: ${r.status}`);
      const json = (await r.json()) as SearchResponse;
      setResults(json.results || []);
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
      if (!r.ok) throw new Error(`search failed: ${r.status}`);
      const json = (await r.json()) as SearchResponse;
      setResults((prev) => [...prev, ...(json.results || [])]);
      setNextCursor(json.next_cursor || null);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    // hydrate from URL on first load
    try {
      const sp = new URLSearchParams(window.location.search);
      setTmdbId(sp.get("tmdb_id") || "");
      setQ(sp.get("q") || "");
      setType(sp.get("type") || "");
      setCreatorId(sp.get("creator_id") || "");
    } catch {
      // ignore
    }

    void (async () => {
      try {
        const r = await fetch(`${base}/v1/facets`);
        if (!r.ok) throw new Error(`facets failed: ${r.status}`);
        setFacets((await r.json()) as FacetsResponse);
      } catch {
        // non-fatal
      }
    })();
  }, [base]);

  return (
    <div className="op-container">
      <h1 className="op-title-lg">Search</h1>
      <p className="op-subtle op-mt-6">
        Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
      </p>

      {error && <div className="op-alert op-alert--error">{error}</div>}

      <section className="op-section">
        <h2 className="op-section-title">Query</h2>

        <div className="op-form-grid-2 op-mt-10">
          <label className="op-label">
            <div className="op-label-hint">Title contains</div>
            <input className="op-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. office" />
          </label>
          <label className="op-label">
            <div className="op-label-hint">Media type</div>
            <select className="op-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">(any)</option>
              {(facets?.media_types || []).map((t) => (
                <option key={t.type} value={t.type}>
                  {t.type} ({t.count})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="op-form-grid-2 op-mt-10">
          <label className="op-label">
            <CreatorPicker
              indexerBaseUrl={INDEXER_BASE_URL}
              value={creatorId}
              onChange={(v) => setCreatorId(v)}
              initialOptions={facets?.creators || []}
              label="Creator"
            />
          </label>

          <label className="op-label">
            <div className="op-label-hint">TMDB id</div>
            <input className="op-input" value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} placeholder="optional" />
          </label>
        </div>

        <div className="op-row op-justify-end op-mt-10">
          <button className="op-btn" onClick={() => void runSearch().catch((e) => setError(e?.message || String(e)))} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <p className="op-subtle op-text-sm op-mt-10">
          Tip: results are ordered by most recently changed posters.
        </p>
      </section>

      <section className="op-section">
        <div className="op-row op-row--between">
          <h2 className="op-section-title">Results</h2>
          <div className="op-subtle op-text-sm">{results.length} loaded</div>
        </div>

        {loading ? (
          <p className="op-subtle op-mt-12">Searching…</p>
        ) : results.length === 0 ? (
          <p className="op-subtle op-mt-12">No results (yet).</p>
        ) : (
          <div className="op-grid op-grid--posters">
            {results.map((r) => (
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
