"use client";

import { useEffect, useMemo, useState } from "react";

import { loadCreatorConnection } from "@/lib/storage";
import type { PosterEntry, SearchResponse } from "@/lib/types";

export default function LibraryPage() {
  const conn = loadCreatorConnection();
  const baseUrl = useMemo(() => conn?.nodeUrl?.replace(/\/+$/, "") || "", [conn]);

  const [items, setItems] = useState<PosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!conn) {
      setItems([]);
      return;
    }
    setError(null);
    const r = await fetch(baseUrl + "/v1/posters?limit=50");
    if (!r.ok) throw new Error(`list failed: ${r.status}`);
    const json = (await r.json()) as SearchResponse;
    setItems(json.results);
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
    await load();
  }

  useEffect(() => {
    void load().catch((e) => setError(e?.message || String(e)));
  }, []);

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
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <a href={p.assets.full.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      Download
                    </a>
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
        )}
      </div>
    </div>
  );
}
