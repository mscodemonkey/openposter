"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import type { IndexerNodesResponse, PosterEntry, SearchResponse } from "@/lib/types";

type RecentResponse = { results: PosterEntry[] };

export default function Home() {
  const [tmdbId, setTmdbId] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<RecentResponse | null>(null);
  const [nodes, setNodes] = useState<IndexerNodesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchUrl = useMemo(() => {
    const base = INDEXER_BASE_URL.replace(/\/+$/, "");
    const u = new URL(base + "/v1/search");
    if (tmdbId.trim() !== "") u.searchParams.set("tmdb_id", tmdbId.trim());
    if (q.trim() !== "") u.searchParams.set("q", q.trim());
    return u.toString();
  }, [tmdbId, q]);

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
    setRecent((await res.json()) as RecentResponse);
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
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>OpenPoster (beta UI)</h1>
        <p style={{ opacity: 0.8 }}>
          Indexer: <code>{INDEXER_BASE_URL}</code>
        </p>
      </header>

      {error && (
        <div style={{ background: "#2b1b1b", padding: 12, borderRadius: 8, marginTop: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Search</h2>
        <p style={{ opacity: 0.8, marginTop: 6 }}>
          Search by TMDB id or title keyword (MVP substring match on indexed titles).
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 8, marginTop: 10 }}>
          <input
            value={tmdbId}
            onChange={(e) => setTmdbId(e.target.value)}
            placeholder="TMDB id (optional)"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title contains… (optional)"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333" }}
          />
          <button
            onClick={() => void runSearch().catch((e) => setError(e?.message || String(e)))}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #333" }}
          >
            Search
          </button>
        </div>

        {search && (
          <div style={{ marginTop: 12 }}>
            <p style={{ opacity: 0.8 }}>{search.results.length} result(s)</p>
            <PosterGrid items={search.results} cols={5} />
          </div>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Recent uploads (via indexer)</h2>
        {recent ? (
          recent.results.length > 0 ? (
            <PosterGrid items={recent.results} cols={5} />
          ) : (
            <p style={{ opacity: 0.8, marginTop: 10 }}>No recent posters.</p>
          )
        ) : (
          <p style={{ opacity: 0.8, marginTop: 10 }}>Loading…</p>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Indexer node status</h2>
        {nodes ? (
          <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                <th style={{ padding: 8 }}>URL</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}>Last crawled</th>
                <th style={{ padding: 8 }}>Down since</th>
              </tr>
            </thead>
            <tbody>
              {nodes.nodes.map((n) => (
                <tr key={n.url} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: 8 }}>
                    <code>{n.url}</code>
                  </td>
                  <td style={{ padding: 8 }}>{n.status}</td>
                  <td style={{ padding: 8 }}>{n.last_crawled_at || "-"}</td>
                  <td style={{ padding: 8 }}>{n.down_since || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ opacity: 0.8, marginTop: 10 }}>Loading…</p>
        )}
      </section>
    </div>
  );
}

function PosterGrid({ items, cols }: { items: PosterEntry[]; cols: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginTop: 10 }}>
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
  );
}
