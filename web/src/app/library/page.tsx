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
        // kick off check in background for the newly loaded page
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

  async function checkAllIndexed(list: PosterEntry[]) {
    // Small concurrency pool to keep this fast but not abusive.
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
        } catch (e: any) {
          setError(e?.message || String(e));
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  useEffect(() => {
    // client-only query param parsing (avoids useSearchParams build constraint)
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
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>My library</h1>
      <p style={{ opacity: 0.8 }}>
        Lists posters from your connected node via <code>/v1/posters</code>.
      </p>

      {!conn ? (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 10 }}>
          Not connected. Go to <a href="/connect">/connect</a> first.
        </div>
      ) : (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 10 }}>
          Connected node: <code>{baseUrl}</code>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #633", borderRadius: 10 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {items === null ? (
          <p style={{ opacity: 0.8 }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ opacity: 0.8 }}>No posters found.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <button
                onClick={() => void checkAllIndexed(items).catch((e) => setError(e?.message || String(e)))}
                style={{ fontSize: 12, border: "1px solid #444", borderRadius: 8, padding: "8px 12px" }}
                title="Checks indexer status for all currently loaded posters"
              >
                Check all indexed
              </button>
              <div style={{ opacity: 0.8, fontSize: 12 }}>
                Indexer: <code>{INDEXER_BASE_URL}</code>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {items.map((p) => (
                <div key={p.poster_id} style={{ border: "1px solid #333", borderRadius: 10, overflow: "hidden" }}>
                <a href={p.assets.preview.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.assets.preview.url} alt={p.media.title || p.poster_id} style={{ width: "100%", display: "block" }} />
                </a>
                <div style={{ padding: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, lineHeight: "16px" }}>
                    {p.media.title || "(untitled)"}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    {p.media.type} · TMDB {p.media.tmdb_id}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <a href={p.assets.full.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      Download
                    </a>

                    <button
                      onClick={() => void checkIndexed(p).catch((e) => setError(e?.message || String(e)))}
                      style={{ fontSize: 12, border: "1px solid #444", borderRadius: 8, padding: "6px 10px" }}
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
                      <button
                        onClick={() => void del(p.poster_id)}
                        style={{ fontSize: 12, border: "1px solid #444", borderRadius: 8, padding: "6px 10px" }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
              ))}
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}
