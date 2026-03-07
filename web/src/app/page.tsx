"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { IndexerNodesResponse, PosterEntry, SearchResponse } from "@/lib/types";

type RecentResponse = { results: PosterEntry[]; next_cursor?: string | null };

export default function Home() {
  const [tmdbId, setTmdbId] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<RecentResponse | null>(null);
  const [recentCursor, setRecentCursor] = useState<string | null>(null);
  const [loadingMoreRecent, setLoadingMoreRecent] = useState(false);
  const [nodes, setNodes] = useState<IndexerNodesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchUrl = useMemo(() => {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const u = new URL(base + "/v1/search");
    if (tmdbId.trim() !== "") u.searchParams.set("tmdb_id", tmdbId.trim());
    if (q.trim() !== "") u.searchParams.set("q", q.trim());
    if (type.trim() !== "") u.searchParams.set("type", type.trim());
    return u.toString();
  }, [tmdbId, q, type]);

  async function runSearch() {
    setError(null);
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    setSearch((await res.json()) as SearchResponse);
  }

  async function loadNodes() {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const res = await fetch(base + "/v1/nodes");
    if (!res.ok) throw new Error(`nodes failed: ${res.status}`);
    setNodes((await res.json()) as IndexerNodesResponse);
  }

  async function loadRecent() {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const res = await fetch(base + "/v1/recent?limit=40");
    if (!res.ok) throw new Error(`recent failed: ${res.status}`);
    const json = (await res.json()) as RecentResponse;
    setRecent(json);
    setRecentCursor(json.next_cursor || null);
  }

  async function loadMoreRecent() {
    if (!recentCursor) return;
    setLoadingMoreRecent(true);
    setError(null);
    try {
      const base = INDEXER_BASE_URL.replace(/\/+$/, "");
      const res = await fetch(
        base + "/v1/recent?limit=40&cursor=" + encodeURIComponent(recentCursor)
      );
      if (!res.ok) throw new Error(`recent failed: ${res.status}`);
      const json = (await res.json()) as RecentResponse;
      setRecent((prev) => ({
        results: [...(prev?.results || []), ...(json.results || [])],
        next_cursor: json.next_cursor || null,
      }));
      setRecentCursor(json.next_cursor || null);
    } finally {
      setLoadingMoreRecent(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadNodes(), loadRecent()]);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, []);

  return (
    <div className="op-container">
      <header className="op-header">
        <h1>OpenPoster (beta UI)</h1>
        <p className="op-subtle op-mt-6">
          Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
        </p>
      </header>

      {error && (
        <div className="op-alert op-alert--error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <section className="op-section">
        <h2 className="op-section-title">Search</h2>
        <p className="op-subtle op-mt-6">
          Search by TMDB id or title keyword (MVP substring match on indexed titles).
        </p>

        <div className="op-form-grid-3">
          <input
            className="op-input"
            value={tmdbId}
            onChange={(e) => setTmdbId(e.target.value)}
            placeholder="TMDB id (optional)"
          />

          <input
            className="op-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title contains… (optional)"
          />

          <button
            className="op-btn"
            onClick={() => void runSearch().catch((e) => setError(e?.message || String(e)))}
          >
            Search
          </button>
        </div>

        <div className="op-mt-10 op-max-360">
          <label className="op-label">
            <div className="op-label-hint">Media type (optional)</div>
            <select className="op-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">(any)</option>
              {["movie", "show", "season", "episode", "collection"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {search && (
          <div className="op-mt-12">
            <p className="op-subtle">{search.results.length} result(s)</p>
            <PosterGrid items={search.results} cols={5} />
          </div>
        )}
      </section>

      <section className="op-section">
        <div className="op-row op-row--between">
          <h2 className="op-section-title">Recent uploads (via indexer)</h2>
          <a className="op-link op-text-sm" href="/browse">
            Browse all →
          </a>
        </div>

        {recent ? (
          recent.results.length > 0 ? (
            <>
              <PosterGrid items={recent.results} cols={5} />
              <div className="op-mt-16">
                {recentCursor ? (
                  <button
                    className="op-btn"
                    onClick={() => void loadMoreRecent().catch((e) => setError(e?.message || String(e)))}
                    disabled={loadingMoreRecent}
                  >
                    {loadingMoreRecent ? "Loading…" : "Load more"}
                  </button>
                ) : (
                  <div className="op-faint op-text-sm">End of list.</div>
                )}
              </div>
            </>
          ) : (
            <p className="op-subtle op-mt-10">No recent posters.</p>
          )
        ) : (
          <p className="op-subtle op-mt-10">Loading…</p>
        )}
      </section>

      <section className="op-section">
        <h2 className="op-section-title">Indexer node status</h2>
        {nodes ? (
          <table className="op-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Status</th>
                <th>Last crawled</th>
                <th>Down since</th>
              </tr>
            </thead>
            <tbody>
              {nodes.nodes.map((n) => (
                <tr key={n.url}>
                  <td>
                    <code className="op-code">{n.url}</code>
                  </td>
                  <td>{n.status}</td>
                  <td>{n.last_crawled_at || "-"}</td>
                  <td>{n.down_since || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="op-subtle op-mt-10">Loading…</p>
        )}
      </section>
    </div>
  );
}

function PosterGrid({ items }: { items: PosterEntry[]; cols: number }) {
  return (
    <div className="op-grid op-grid--posters">
      {items.map((r) => (
        <div key={r.poster_id} className="op-card">
          <a href={r.assets.preview.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="op-img"
              src={r.assets.preview.url}
              alt={r.media.title || r.poster_id}
            />
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
  );
}
