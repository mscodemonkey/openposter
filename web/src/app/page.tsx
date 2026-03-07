"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { IndexerNodesResponse, PosterEntry, SearchResponse } from "@/lib/types";

type RecentResponse = { results: PosterEntry[]; next_cursor?: string | null };

type StatsResponse = {
  posters: number;
  nodes: { total: number; up: number };
};

const MEDIA_TYPES = ["", "movie", "show", "season", "episode", "collection"];

export default function Home() {
  const [tmdbId, setTmdbId] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [search, setSearch] = useState<SearchResponse | null>(null);

  const [recent, setRecent] = useState<RecentResponse | null>(null);
  const [recentCursor, setRecentCursor] = useState<string | null>(null);
  const [loadingMoreRecent, setLoadingMoreRecent] = useState(false);

  const [nodes, setNodes] = useState<IndexerNodesResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [error, setError] = useState<string | null>(null);

  const searchUrl = useMemo(() => {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const u = new URL(base + "/v1/search");
    if (tmdbId.trim() !== "") u.searchParams.set("tmdb_id", tmdbId.trim());
    if (q.trim() !== "") u.searchParams.set("q", q.trim());
    if (type.trim() !== "") u.searchParams.set("type", type.trim());
    u.searchParams.set("limit", "40");
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

  async function loadStats() {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const res = await fetch(base + "/v1/stats");
    if (!res.ok) throw new Error(`stats failed: ${res.status}`);
    setStats((await res.json()) as StatsResponse);
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
        await Promise.all([loadNodes(), loadRecent(), loadStats()]);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, []);

  return (
    <div className="op-container">
      <header className="op-header">
        <h1>OpenPoster (beta UI)</h1>
        <div className="op-subtle op-mt-6">
          Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
        </div>
        {stats && (
          <div className="op-subtle op-text-sm op-mt-6">
            Indexed posters: <strong>{stats.posters}</strong> · Nodes up: {stats.nodes.up}/{stats.nodes.total}
          </div>
        )}
      </header>

      {error && (
        <div className="op-alert op-alert--error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <section className="op-section">
        <div className="op-row op-row--between">
          <h2 className="op-section-title">Search</h2>
          <a className="op-link op-text-sm" href="/search">
            Advanced search →
          </a>
        </div>

        <p className="op-subtle op-mt-6">
          Search by TMDB id or title keyword (MVP substring match on indexed titles).
        </p>

        <div className="op-form-grid-2 op-mt-10">
          <label className="op-label">
            <div className="op-label-hint">Title contains</div>
            <input className="op-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="optional" />
          </label>

          <label className="op-label">
            <div className="op-label-hint">Media type</div>
            <select className="op-select" value={type} onChange={(e) => setType(e.target.value)}>
              {MEDIA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === "" ? "(any)" : t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="op-form-grid-title-year op-mt-10">
          <label className="op-label">
            <div className="op-label-hint">TMDB id</div>
            <input className="op-input" value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} placeholder="optional" />
          </label>
          <div className="op-row op-justify-end">
            <button
              className="op-btn"
              onClick={() => void runSearch().catch((e) => setError(e?.message || String(e)))}
            >
              Search
            </button>
          </div>
        </div>

        {search && (
          <div className="op-mt-12">
            <div className="op-subtle">{search.results.length} result(s)</div>
            <PosterGrid items={search.results} />
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
              <PosterGrid items={recent.results} />
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

function PosterGrid({ items }: { items: PosterEntry[] }) {
  return (
    <div className="op-grid op-grid--posters">
      {items.map((r) => (
        <div key={r.poster_id} className="op-card">
          <a href={r.assets.preview.url} target="_blank" rel="noreferrer">
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
  );
}
