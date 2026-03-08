"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { PosterEntry } from "@/lib/types";

import CreatorPicker from "@/components/CreatorPicker";

type PagedResponse = {
  results: PosterEntry[];
  next_cursor?: string | null;
};

type FacetsResponse = {
  media_types: Array<{ type: string; count: number }>;
  creators: Array<{ creator_id: string; display_name: string | null; count: number }>;
};

export default function BrowsePage() {
  const [creatorId, setCreatorId] = useState<string>("");
  const [creatorQ, setCreatorQ] = useState<string>("");
  const [mediaType, setMediaType] = useState<string>("");
  const [tmdbId, setTmdbId] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const [copied, setCopied] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [facets, setFacets] = useState<FacetsResponse | null>(null);

  const base = useMemo(() => INDEXER_BASE_URL.replace(/\/+$/, ""), []);

  function syncUrl(next: {
    creatorId: string;
    creatorQ: string;
    mediaType: string;
    tmdbId: string;
    q: string;
  }) {
    const sp = new URLSearchParams();
    if (next.creatorId) sp.set("creator_id", next.creatorId);
    if (next.creatorQ) sp.set("creator_q", next.creatorQ);
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
      const nextCreatorId = sp.get("creator_id") || "";
      const nextCreatorQ = sp.get("creator_q") || "";
      const nextMediaType = sp.get("media_type") || "";
      const nextTmdbId = sp.get("tmdb_id") || "";
      const nextQ = sp.get("q") || "";

      setCreatorId(nextCreatorId);
      setCreatorQ(nextCreatorQ);
      setMediaType(nextMediaType);
      setTmdbId(nextTmdbId);
      setQ(nextQ);

      // UX: keep filters tucked away unless the user is already filtering.
      const hasAnyFilter =
        !!nextCreatorId || !!nextCreatorQ || !!nextMediaType || !!nextTmdbId || !!nextQ;
      setFiltersOpen(hasAnyFilter);
    } catch {
      setCreatorId("");
      setCreatorQ("");
      setMediaType("");
      setTmdbId("");
      setQ("");
      setFiltersOpen(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const fc = await fetch(`${base}/v1/facets`);
        if (!fc.ok) throw new Error(`facets failed: ${fc.status}`);
        setFacets((await fc.json()) as FacetsResponse);
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

  function hasArtwork(r: PosterEntry): boolean {
    const preview = r?.assets?.preview?.url;
    const full = r?.assets?.full?.url;
    return typeof preview === "string" && preview.length > 0 && typeof full === "string" && full.length > 0;
  }

  async function loadFirst() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(buildUrl(null));
      if (!r.ok) throw new Error(`browse failed: ${r.status}`);
      const json = (await r.json()) as PagedResponse;

      // UX: Browse should only show posters that actually have artwork to view/download.
      setItems(json.results.filter(hasArtwork));
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
      setItems((prev) => ([...(prev || []), ...json.results.filter(hasArtwork)]));
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
        creatorQ: creatorQ.trim(),
        mediaType,
        tmdbId: tmdbId.trim(),
        q: q.trim(),
      });
    } catch {
      // ignore
    }

    void loadFirst().catch((e) => setError(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, creatorQ, mediaType, tmdbId, q]);

  return (
    <div className="op-container">
      <h1 className="op-title-lg">Browse</h1>
      <p className="op-subtle op-mt-6">
        Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
      </p>

      <section className="op-section">
        <div className="op-row op-row--between">
          <div className="op-row" style={{ gap: 10 }}>
            <h2 className="op-section-title" style={{ margin: 0 }}>
              Results
            </h2>
            <button
              type="button"
              className="op-link op-text-sm"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              {filtersOpen ? "Hide filters" : "Show filters"}
            </button>
          </div>

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

        {filtersOpen && (
          <div className="op-card op-card--padded op-mt-12">
            <div className="op-row op-row--between">
              <div className="op-subtle">Filter results</div>
              <button
                className="op-btn op-btn--sm"
                onClick={() => {
                  setCreatorId("");
                  setCreatorQ("");
                  setMediaType("");
                  setTmdbId("");
                  setQ("");
                }}
              >
                Clear
              </button>
            </div>

            <div className="op-form-grid-2 op-mt-10">
              <label className="op-label">
                <CreatorPicker
                  indexerBaseUrl={INDEXER_BASE_URL}
                  value={creatorId}
                  onChange={(v) => setCreatorId(v)}
                  query={creatorQ}
                  onQueryChange={(v) => setCreatorQ(v)}
                  initialOptions={facets?.creators || []}
                  label="Creator"
                />
              </label>

              <label className="op-label">
                <div className="op-label-hint">Media type</div>
                <select
                  className="op-select"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value)}
                >
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
                <div className="op-label-hint">Title contains</div>
                <input className="op-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="optional" />
              </label>

              <label className="op-label">
                <div className="op-label-hint">TMDB id</div>
                <input className="op-input" value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} placeholder="optional" />
              </label>
            </div>
          </div>
        )}

        {error && <div className="op-alert op-alert--error">{error}</div>}

      {loading || items === null ? (
        <p className="op-subtle op-mt-12">Loading…</p>
      ) : items.length === 0 ? (
        <p className="op-subtle op-mt-12">No posters.</p>
      ) : (
        <div className="op-grid op-grid--posters op-mt-12">
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
