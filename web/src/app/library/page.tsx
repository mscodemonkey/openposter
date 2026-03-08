"use client";

import { useEffect, useMemo, useState } from "react";

import { INDEXER_BASE_URL } from "@/lib/config";
import { loadCreatorConnection } from "@/lib/storage";
import type { PosterEntry, SearchResponse } from "@/lib/types";

export default function LibraryPage() {
  const conn = loadCreatorConnection();
  const baseUrl = useMemo(() => conn?.nodeUrl?.replace(/\/+$/, "") || "", [conn]);

  const [autoCheck, setAutoCheck] = useState(false);
  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexed, setIndexed] = useState<Record<string, "yes" | "no" | "checking">>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadFirstPage() {
    if (!conn) {
      setItems([]);
      setNextCursor(null);
      return;
    }
    setError(null);
    const r = await fetch(baseUrl + "/v1/posters?limit=50");
    if (!r.ok) throw new Error(`list failed: ${r.status}`);
    const json = (await r.json()) as SearchResponse;
    setItems(json.results);
    setNextCursor(json.next_cursor);
  }

  async function loadMore() {
    if (!conn) return;
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const r = await fetch(
        baseUrl + "/v1/posters?limit=50&cursor=" + encodeURIComponent(nextCursor)
      );
      if (!r.ok) throw new Error(`list failed: ${r.status}`);
      const json = (await r.json()) as SearchResponse;
      setItems((prev) => ([...(prev || []), ...json.results]));
      setNextCursor(json.next_cursor);

      if (autoCheck && json.results.length > 0) {
        void checkAllIndexed(json.results);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function checkIndexed(p: PosterEntry) {
    if (!p.media.tmdb_id) {
      setIndexed((m) => ({ ...m, [p.poster_id]: "no" }));
      return;
    }
    setIndexed((m) => ({ ...m, [p.poster_id]: "checking" }));
    const url = new URL(INDEXER_BASE_URL.replace(/\/+$/, "") + "/v1/search");
    url.searchParams.set("tmdb_id", String(p.media.tmdb_id));
    if (p.media.type) url.searchParams.set("type", p.media.type);

    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`indexer search failed: ${r.status}`);
    const json = (await r.json()) as SearchResponse;
    const found = json.results.some((x) => x.poster_id === p.poster_id);
    setIndexed((m) => ({ ...m, [p.poster_id]: found ? "yes" : "no" }));
  }

  async function checkAllIndexed(list: PosterEntry[]) {
    const concurrency = 4;
    const queue = list.filter((p) => !indexed[p.poster_id]);

    async function worker() {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const p = queue.shift();
        if (!p) return;
        try {
          // eslint-disable-next-line no-await-in-loop
          await checkIndexed(p);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  async function del(posterId: string) {
    if (!conn) return;
    setError(null);
    const r = await fetch(baseUrl + `/v1/admin/posters/${encodeURIComponent(posterId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${conn.adminToken}` },
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      setError(`delete failed: ${r.status} ${JSON.stringify(json)}`);
      return;
    }
    await loadFirstPage();
  }

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setAutoCheck(sp.get("check") === "1");
    } catch {
      setAutoCheck(false);
    }

    void loadFirstPage().catch((e) => setError(e?.message || String(e)));
  }, []);

  useEffect(() => {
    if (!autoCheck) return;
    if (!items || items.length === 0) return;
    void checkAllIndexed(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck, items]);

  return (
    <div className="op-container">
      <h1 className="op-title-lg">My library</h1>
      <p className="op-subtle op-mt-6">
        Lists posters from your connected node via <code className="op-code">/v1/posters</code>.
      </p>

      {!conn ? (
        <div className="op-card op-card--padded op-mt-16">
          Not connected. Go to <a className="op-link" href="/connect">/connect</a> first.
        </div>
      ) : (
        <div className="op-card op-card--padded op-mt-16">
          Connected node: <code className="op-code">{baseUrl}</code>
        </div>
      )}

      {error && <div className="op-alert op-alert--error">{error}</div>}

      <div className="op-section">
        {items === null ? (
          <p className="op-subtle">Loading…</p>
        ) : items.length === 0 ? (
          <p className="op-subtle">No posters found.</p>
        ) : (
          <>
            <div className="op-row op-mt-10">
              <button
                className="op-btn op-btn--sm"
                onClick={() => void checkAllIndexed(items).catch((e) => setError(e?.message || String(e)))}
                title="Checks indexer status for all currently loaded posters"
              >
                Check all indexed
              </button>
              <div className="op-subtle op-text-sm">
                Indexer: <code className="op-code">{INDEXER_BASE_URL}</code>
              </div>
            </div>

            <div className="op-grid op-grid--posters">
              {items.map((p) => (
                <div key={p.poster_id} className="op-card">
                  <a className="op-link" href={`/p/${encodeURIComponent(p.poster_id)}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="op-img" src={p.assets.preview.url} alt={p.media.title || p.poster_id} />
                  </a>
                  <div className="op-poster-meta">
                    <div className="op-poster-title">{p.media.title || "(untitled)"}</div>
                    <div className="op-subtle op-text-sm">
                      {p.media.type} · TMDB {p.media.tmdb_id}
                    </div>

                    <div className="op-row op-row--between op-mt-8">
                      <a className="op-link op-text-sm" href={p.assets.full.url} target="_blank" rel="noreferrer">
                        Download
                      </a>

                      <button
                        className="op-btn op-btn--sm"
                        onClick={() => void checkIndexed(p).catch((e) => setError(e?.message || String(e)))}
                        disabled={indexed[p.poster_id] === "checking"}
                        title={`Checks ${INDEXER_BASE_URL}/v1/search for this TMDB id/type`}
                      >
                        {indexed[p.poster_id] === "checking"
                          ? "Checking…"
                          : indexed[p.poster_id]
                            ? `Indexed: ${indexed[p.poster_id]}`
                            : "Check indexed"}
                      </button>

                      {conn && (
                        <button className="op-btn op-btn--sm" onClick={() => void del(p.poster_id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="op-mt-16">
              {nextCursor ? (
                <button
                  className="op-btn"
                  onClick={() => void loadMore().catch((e) => setError(e?.message || String(e)))}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              ) : (
                <div className="op-faint op-text-sm">End of list.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
